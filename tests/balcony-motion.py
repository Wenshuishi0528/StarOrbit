import json
import math
import os
from pathlib import Path
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from balcony_motion import view_angles
assert view_angles((0, 0, -1), (0, 0, -20), .1) == (2., 0., 0.)
assert abs(view_angles((0, -.5, -math.sqrt(.75)), (0, 0, 0), .1)[1]-30) < .001
assert view_angles((0, 0, 0), (1, 1, 1), .1) is None

with tempfile.TemporaryDirectory() as folder:
    os.environ['TIANGONG_CLOUD_CACHE'] = folder
    from serve import Handler, ThreadingHTTPServer
    class Quiet(Handler):
        def log_message(self, *args): pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Quiet)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    def post(headers):
        req = urllib.request.Request(origin+'/api/balcony/orientation', headers=headers, method='POST')
        try: result = urllib.request.urlopen(req, timeout=2)
        except urllib.error.HTTPError as e: result = e
        with result: return result.status, result.read()
    stopped = []
    def stream():
        try: yield {'yaw': 13, 'pitch': 2, 'roll': 0}
        finally: stopped.append(True)
    try:
        with patch('serve.orientation_stream', side_effect=stream) as access:
            for headers in [{}, {'Origin': origin}, {'Origin': 'http://different.test', 'X-StarOrbit-Motion': '1'},
                            {'Origin':'http://rebind.test','Host':'rebind.test','X-StarOrbit-Motion':'1'}]:
                assert post(headers)[0] == 403
            assert not access.called
            status,raw = post({'Origin':origin,'X-StarOrbit-Motion':'1'})
            assert status==200 and json.loads(raw)=={'yaw':13,'pitch':2,'roll':0} and stopped==[True]
    finally:
        server.shutdown(); server.server_close(); thread.join()
print('Mac relative tilt, motion stream origin, opt-in header and disconnect cleanup passed')
