"""One cancellable conversion job; completed maps belong to the shared library."""
import hashlib, json, subprocess, sys, tempfile, threading, uuid, os, signal, re, time, shutil
from pathlib import Path
from cloud_history import selection

CACHE = Path(os.environ.get('TIANGONG_CLOUD_CACHE', Path.home()/'Library/Application Support/Tiangong Orbit Simulator/clouds'))


WORKERS = {'satcorps': 'cloud_history.py', 'gmgsi': 'gmgsi.py', 'himawari': 'himawari.py'}


def frame_stamp(provider, date, slot):
    if provider not in WORKERS:
        raise ValueError('未知云图来源')
    if provider != 'himawari':
        return selection(date, slot)[0]
    from himawari import selection as select_scan
    return select_scan(date, slot).timestamp()


class HistoryService:
    def __init__(self, cache=None, job_name='download-job'):
        # Explicit storage for the desktop service; isolated storage for test instances.
        self._storage = tempfile.TemporaryDirectory(prefix='starorbit-library-') if cache is None else None
        self.cache = Path(self._storage.name if self._storage else cache)
        if not re.fullmatch(r'[\w-]{1,64}', job_name):
            raise ValueError('invalid job namespace')
        self.job_name = job_name
        self.cache.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.state = {'state': 'idle'}
        self.temp = self.process = None
        self.cancelled = []
        try:
            saved = json.loads(self.state_path.read_text())
            if saved.get('state') in ('running', 'cancelling', 'ready', 'error', 'cancelled'):
                frame_stamp(saved.get('provider', 'satcorps'), saved['date'], saved['hour'])
                if not re.fullmatch(r'[a-f0-9]{32}', saved['id']):
                    raise ValueError('invalid job')
                self.state = saved
                if saved['state'] in ('running', 'cancelling'):
                    self.state.update(state='error', error='本机服务已重启，下载已中断；可重试此版本', retryable=True)
                elif saved['state'] == 'ready' and self._image(saved.get('result', {})) is None:
                    self.state.update(state='error', error='已下载文件缺失或损坏，请重新下载', retryable=True)
        except (OSError, ValueError, KeyError, TypeError):
            pass

    @property
    def state_path(self):
        return self.cache/(self.job_name+'.json')

    def _persist(self):
        self.cache.mkdir(parents=True, exist_ok=True)
        self.state['updatedAt'] = int(time.time()*1000)
        pending = self.state_path.with_suffix('.tmp')
        pending.write_text(json.dumps(self.state, ensure_ascii=False))
        pending.replace(self.state_path)

    def snapshot(self):
        with self.lock:
            return dict(self.state)

    def _image(self, meta):
        name, sha = meta.get('disk', ''), meta.get('sha256', '')
        if not re.fullmatch(r'[\w-]+\.png', name) or not re.fullmatch(r'[a-f0-9]{64}', sha):
            return None
        try:
            data = (self.cache/name).read_bytes()
            return data if hashlib.sha256(data).hexdigest() == sha else None
        except OSError:
            return None

    def start(self, date, hour, request_id=None, provider="satcorps", revision=None):
        if revision is not None:
            if provider not in ('gmgsi','himawari') or not re.fullmatch(r'[0-9]{13}', str(revision)):
                raise ValueError('云图修订时间无效')
            revision = int(revision)
        stamp = frame_stamp(provider, date, hour)
        if request_id and not re.fullmatch(r'[a-f0-9]{32}', request_id):
            raise ValueError('下载请求标识无效')
        with self.lock:
            same_frame = (provider, date, hour) == (self.state.get('provider', 'satcorps'), self.state.get('date'), self.state.get('hour'))
            if request_id in self.cancelled:
                return {'state': 'cancelled', 'id': request_id, 'provider': provider, 'revision': revision, 'date': date, 'hour': hour}
            if self.state['state'] in ('running', 'cancelling'):
                if not same_frame or revision and revision > (self.state.get('revision') or 0):
                    raise ValueError('另一份云图正在下载，请先取消或等待完成')
                return dict(self.state)
            if self.state['state'] == 'ready' and same_frame and (not revision or self.state['result'].get('createdAt', 0) >= revision) and self._image(self.state.get('result', {})) is not None:
                return dict(self.state)
            from cloud_versions import library
            for meta in sorted(library(self.cache), key=lambda item: item.get('createdAt', 0), reverse=True):
                if meta.get('provider') == provider and meta.get('time') == int(stamp*1000) and (not revision or meta.get('createdAt', 0) >= revision) and self._image(meta) is not None:
                    self.state = {'state': 'ready', 'id': request_id or uuid.uuid4().hex, 'provider': provider, 'revision': revision, 'date': date, 'hour': hour,
                                  'result': meta, 'status': '此版本已保存在本机图库，无需重复下载'}
                    self._persist()
                    return dict(self.state)
            if self.temp:
                self.temp.cleanup()
            self.cache.mkdir(parents=True, exist_ok=True)
            # A different viewer address may explicitly clear the shared map
            # library. Its cleanup must not remove this job's scientific fields.
            self.temp = tempfile.TemporaryDirectory(prefix='starorbit-download-')
            self.state = {'state': 'running', 'id': request_id or uuid.uuid4().hex, 'provider': provider, 'revision': revision, 'date': date, 'hour': hour,
                          'status': '正在连接所选时次…', 'startedAt': int(time.time()*1000)}
            self._persist()
            try:
                worker = WORKERS[provider]
                self.process = subprocess.Popen([sys.executable, str(Path(__file__).with_name(worker)), date, hour, self.temp.name],
                                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, start_new_session=os.name == 'posix')
                threading.Thread(target=self.run, args=(self.process, self.state['id']), daemon=True).start()
            except OSError:
                self.state.update(state='error', error='云图处理程序未能启动，请检查本机 Python 环境')
                self._persist()
            return dict(self.state)

    def _publish(self, meta):
        data = (Path(self.temp.name)/'image.png').read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        if meta.get('provider') != self.state.get('provider', 'satcorps') or sha != meta.get('sha256'):
            raise ValueError('下载文件完整性校验失败')
        stamp = frame_stamp(meta['provider'], self.state['date'], self.state['hour'])
        if meta.get('time') != int(stamp*1000):
            raise ValueError('下载文件观测时次不符')
        if self.state.get('revision') and meta.get('createdAt', 0) < self.state['revision']:
            raise ValueError('返回的云图早于所选修订')
        prefix = '' if meta['provider'] == 'satcorps' else meta['provider']+'-'
        name = prefix+time.strftime('%Y%m%dT%H%M', time.gmtime(stamp))+'-'+sha[:16]
        image = self.cache/(name+'.png')
        pending = image.with_suffix('.'+self.state['id']+'.tmp')
        shutil.copyfile(Path(self.temp.name)/'image.png', pending)
        pending.replace(image)
        saved = {**meta, 'disk': image.name, 'downloaded': int(time.time()*1000), 'size': len(data)}
        sidecar = image.with_suffix('.json')
        pending = sidecar.with_suffix('.'+self.state['id']+'.json.tmp')
        pending.write_text(json.dumps(saved, ensure_ascii=False))
        pending.replace(sidecar)
        return saved

    def run(self, process, job):
        try:
            for line in process.stdout:
                try:
                    value = json.loads(line)
                except ValueError:
                    continue
                with self.lock:
                    if self.state.get('id') != job or self.state['state'] in ('cancelled', 'cancelling'):
                        continue
                    if 'result' in value:
                        self.state.update(state='ready', result=self._publish(value['result']), status='下载完成，已保存到本机云图库')
                    elif 'error' in value:
                        self.state.update(state='error', **value)
                    else:
                        self.state.update(value)
                    self._persist()
            process.wait()
            with self.lock:
                if self.state.get('id') == job and self.state['state'] == 'running':
                    self.state.update(state='error', error='云图处理失败；请检查网络及 numpy、Pillow、h5py 依赖')
                    self._persist()
        except Exception as error:
            with self.lock:
                if self.state.get('id') == job and self.state['state'] not in ('cancelled', 'cancelling'):
                    self.state.update(state='error', error='云图保存失败：'+str(error))
                    self._persist()

    def image_bytes(self, job, sha):
        with self.lock:
            if self.state.get('id') != job or self.state.get('result', {}).get('sha256') != sha or self.state['state'] != 'ready':
                return None
            return self._image(self.state['result'])

    def clear(self):
        with self.lock:
            if self.state['state'] in ('running', 'cancelling'):
                return False
            if self.temp:
                self.temp.cleanup()
                self.temp = None
            self.state = {'state': 'idle'}
            self._persist()
            return True

    def cancel(self, job):
        with self.lock:
            if not re.fullmatch(r'[a-f0-9]{32}', job or ''):
                return False
            self.cancelled = (self.cancelled+[job])[-64:]
            if self.state.get('id') != job or self.state['state'] not in ('running', 'cancelling'):
                return True
            process, temp = self.process, self.temp
            self.state.update(state='cancelling', status='正在停止下载…')
            self._persist()
        try:
            if os.name == 'posix':
                os.killpg(process.pid, signal.SIGTERM)
            else:
                process.terminate()
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            try:
                if os.name == 'posix':
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
                process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                return False
        except OSError:
            pass
        if temp:
            temp.cleanup()
        with self.lock:
            if self.state.get('id') == job:
                self.state.update(state='cancelled', status='已取消下载')
                self._persist()
        return True
