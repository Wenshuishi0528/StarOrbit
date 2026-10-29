import sys, tempfile, unittest, subprocess, types, io, gzip
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from http_download import download_bytes, DownloadError, response_headers, python_fetch


class Downloads(unittest.TestCase):
    def download(self, replies, **options):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            code, status, headers, body = replies.pop(0)
            Path(args[args.index('--dump-header') + 1]).write_text(
                f'HTTP/1.1 {status}\r\n' + ''.join(f'{k}: {v}\r\n' for k, v in headers.items()) + '\r\n')
            return types.SimpleNamespace(returncode=code, stdout=body, stderr=b'private diagnostics')
        with patch('http_download.subprocess.run', side_effect=run), patch('http_download.time.sleep'):
            try:
                return download_bytes('https://example.test/data', **options), calls
            finally:
                self.calls = calls

    def test_tls_and_503_retry_without_weakening_tls(self):
        value, calls = self.download([(35, 0, {}, b''), (0, 503, {}, b'unavailable'),
                                     (0, 206, {'Content-Range': 'bytes 2-5/10'}, b'abcd')],
                                    byte_range=(2, 5), limit=4)
        self.assertEqual(value, b'abcd')
        self.assertEqual(len(calls), 3)
        self.assertTrue(all('--insecure' not in c and '--max-time' in c and '--max-filesize' in c for c in calls))

    def test_absence_access_denial_and_rate_limit_are_not_retried(self):
        for status, headers in [(404, {}), (410, {}), (403, {}), (429, {'Retry-After': '120'})]:
            with self.assertRaises(DownloadError) as error:
                self.download([(0, status, headers, b'no')])
            self.assertEqual(error.exception.status, status)
            self.assertEqual(len(self.calls), 1)

    def test_certificate_failure_is_not_bypassed(self):
        with self.assertRaises(DownloadError) as error:
            self.download([(60, 0, {}, b''), (60, 0, {}, b'')])
        self.assertEqual(error.exception.code, 'tls')
        self.assertEqual(len(self.calls), 2)
        self.assertIn('--python-fetch',self.calls[1])

    def test_ranges_and_size_must_match(self):
        for status, header, body in [(200, '', b'abcd'), (206, 'bytes 3-6/10', b'abcd'),
                                      (206, 'bytes 2-5/10', b'abc')]:
            with self.assertRaises(DownloadError) as error:
                self.download([(0, status, {'Content-Range': header}, body)], byte_range=(2, 5))
            self.assertEqual(error.exception.code, 'range')
        with self.assertRaises(DownloadError) as error:
            self.download([(0, 200, {}, b'abcdef')], limit=4)
        self.assertEqual(error.exception.code, 'size')

    def test_full_response_and_redirect_headers(self):
        self.assertEqual(self.download([(0, 200, {}, b'orbit')])[0], b'orbit')
        self.assertEqual(response_headers('HTTP/1.1 301\r\nLocation: somewhere\r\n\r\nHTTP/2 206\r\nContent-Range: bytes 0-3/10\r\n'),
                         (206, {'content-range': 'bytes 0-3/10'}))

    def test_python_compression_is_bounded(self):
        for limit,expected in [(20,0),(5,63)]:
            response=io.BytesIO(gzip.compress(b'official orbit'))
            response.status=200;response.headers={'Content-Encoding':'gzip'}
            output=io.BytesIO()
            with tempfile.TemporaryDirectory() as folder, patch('urllib.request.build_opener') as factory, patch('sys.stdout',types.SimpleNamespace(buffer=output)):
                factory.return_value.open.return_value=response
                result=python_fetch(types.SimpleNamespace(url='https://example.test/orbit',range=None,max_time=10,max_filesize=limit,dump_header=str(Path(folder)/'headers')))
            self.assertEqual(result,expected)
            self.assertEqual(output.getvalue(),b'official orbit' if expected==0 else b'')

    def test_total_budget_prevents_another_attempt(self):
        with patch('http_download.time.monotonic', side_effect=[0, 0, 40, 40]), patch('http_download.time.sleep'):
            with self.assertRaises(DownloadError):
                self.download([(28, 0, {}, b'')], timeout=40)
        self.assertEqual(len(self.calls), 1)


if __name__ == '__main__':
    unittest.main()
