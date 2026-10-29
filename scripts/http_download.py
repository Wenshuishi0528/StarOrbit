"""Bounded HTTPS downloads using the OS curl trust store, with transient retries.

The launcher must also work with macOS Python installations whose own CA bundle
is missing. TLS verification is always enabled; no browser/CORS proxy is added.
"""
import re, subprocess, tempfile, time, sys
from pathlib import Path


class DownloadError(RuntimeError):
    def __init__(self, code, message, status=None, retryable=False):
        super().__init__(message)
        self.code, self.status, self.retryable = code, status, retryable


def response_headers(text):
    status, headers = 0, {}
    for line in text.splitlines():
        match = re.match(r'HTTP/\S+\s+(\d{3})', line)
        if match:
            status, headers = int(match[1]), {}
        elif ':' in line:
            key, value = line.split(':', 1)
            headers[key.strip().lower()] = value.strip()
    return status, headers


def download_bytes(url, *, byte_range=None, limit=6000000, timeout=40, attempts=3, attempt_timeout=25):
    if not url.startswith('https://'):
        raise ValueError('Only HTTPS data sources are supported')
    deadline = time.monotonic() + timeout
    last_error = DownloadError('timeout', '数据源连接超时', retryable=True)
    with tempfile.TemporaryDirectory(prefix='starorbit-http-') as tmp:
        header = Path(tmp) / 'headers'
        for attempt in range(attempts):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            header.write_text('')
            budget = min(attempt_timeout, remaining)
            python_transport = attempt > 0 and last_error.code in ('tls','timeout','network')
            args = ([sys.executable, str(Path(__file__).resolve()), '--python-fetch'] if python_transport else
                    ['curl', '--silent', '--show-error', '--location',
                    '--proto', '=https', '--proto-redir', '=https',
                    '--connect-timeout', str(min(10, budget))]) + ['--max-time', str(budget),
                    '--max-filesize', str(limit), '--dump-header', str(header)]
            if byte_range is not None:
                args += ['--range', f'{byte_range[0]}-{byte_range[1]}']
            elif not python_transport:
                args += ['--compressed']
            try:
                result = subprocess.run(args + [url], capture_output=True, timeout=budget + 1)
                status, headers = response_headers(header.read_text(errors='replace'))
                if status >= 400:
                    error = DownloadError('http', f'数据源返回 HTTP {status}', status,
                                          status in (408, 429, 500, 502, 503, 504))
                    # Respect rate limiting instead of immediately repeating it.
                    retry_after = headers.get('retry-after', '')
                    if status == 429 and retry_after and (not retry_after.isdigit() or int(retry_after) > 1):
                        error.retryable = False
                    raise error
                if result.returncode:
                    code = result.returncode
                    category, message = ('timeout', '数据源连接超时') if code == 28 else ('tls', '数据源 TLS 连接中断') if code in (35, 60) else ('network', '数据源连接中断')
                    if code == 60:
                        message = '数据源 TLS 证书验证失败'
                    if code == 63:
                        category, message = 'size', '数据超过大小限制'
                    raise DownloadError(category, message, retryable=code in (5, 6, 7, 16, 18, 28, 35, 52, 55, 56, 92) or (code==60 and not python_transport))
                data = result.stdout
                if len(data) > limit:
                    raise DownloadError('size', '数据超过大小限制')
                if byte_range is not None:
                    start, end = byte_range
                    match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', headers.get('content-range', ''))
                    if status != 206 or not match or (int(match[1]), int(match[2])) != (start, end) or int(match[3]) <= end or len(data) != end - start + 1:
                        raise DownloadError('range', '数据源未返回正确的分段数据')
                elif not 200 <= status < 300:
                    raise DownloadError('http', f'数据源返回 HTTP {status}', status)
                return data
            except subprocess.TimeoutExpired:
                last_error = DownloadError('timeout', '数据源连接超时', retryable=True)
            except DownloadError as error:
                last_error = error
            if not last_error.retryable:
                raise last_error
            if attempt + 1 < attempts:
                time.sleep(min(.5 * (attempt + 1), max(0, deadline - time.monotonic())))
    raise last_error


def python_fetch(args):
    """A second verified TLS stack repairs macOS LibreSSL handshake failures.

    The parent process enforces the same hard deadline and byte limit. Adding
    certifi's CA roots fixes a missing Python CA bundle, never skips validation.
    """
    import ssl, urllib.request, urllib.error, socket, gzip
    context=ssl.create_default_context()
    try:
        import certifi
        context.load_verify_locations(certifi.where())
    except ImportError:
        pass
    class HTTPSRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,request,fp,code,msg,headers,url):
            if not url.startswith('https://'):raise ValueError('HTTPS redirect required')
            return super().redirect_request(request,fp,code,msg,headers,url)
    opener=urllib.request.build_opener(HTTPSRedirect(),urllib.request.HTTPSHandler(context=context))
    headers={'Range':'bytes='+args.range} if args.range else {'Accept-Encoding':'gzip'}
    try:
        try:response=opener.open(urllib.request.Request(args.url,headers=headers),timeout=args.max_time)
        except urllib.error.HTTPError as error:response=error
        with response:
            Path(args.dump_header).write_text(f'HTTP/1.1 {response.status}\r\n'+str(response.headers))
            body=gzip.GzipFile(fileobj=response) if response.headers.get('Content-Encoding','').lower()=='gzip' else response
            data=body.read(args.max_filesize+1)
            if len(data)>args.max_filesize:return 63
            sys.stdout.buffer.write(data)
        return 0
    except Exception as error:
        reason=getattr(error,'reason',error)
        if isinstance(reason,ssl.SSLCertVerificationError):return 60
        if isinstance(reason,ssl.SSLError):return 35
        if isinstance(reason,(TimeoutError,socket.timeout)):return 28
        return 52


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--python-fetch',action='store_true',required=True)
    parser.add_argument('--range')
    parser.add_argument('--max-time',type=float,required=True)
    parser.add_argument('--max-filesize',type=int,required=True)
    parser.add_argument('--dump-header',required=True)
    parser.add_argument('url')
    args=parser.parse_args()
    if not args.url.startswith('https://'):raise SystemExit(52)
    raise SystemExit(python_fetch(args))
