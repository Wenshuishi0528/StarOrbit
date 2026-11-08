"""Explicit deletion of one verified cloud version, independent of automatic retention."""
import hashlib
import json
import re
from pathlib import Path


def remove_version(history, clouds, name, sha, provider, timestamp):
    if (not isinstance(name, str) or not re.fullmatch(r'[\w-]+\.png', name)
            or not isinstance(sha, str) or not re.fullmatch(r'[a-f0-9]{64}', sha)
            or provider not in ('satcorps', 'gmgsi', 'himawari')):
        raise ValueError('云图删除标识无效')
    try:
        stamp = int(timestamp)
    except (TypeError, ValueError):
        raise ValueError('云图删除时次无效') from None
    if str(stamp) != str(timestamp) or not 0 < stamp < 8640000000000000:
        raise ValueError('云图删除时次无效')
    root = Path(history.cache).resolve()
    if Path(clouds.cache).resolve() != root:
        raise ValueError('云图库目录不一致')
    image, sidecar = root/name, (root/name).with_suffix('.json')

    def matches(meta):
        return (isinstance(meta, dict) and meta.get('sha256') == sha
                and meta.get('provider') == provider and meta.get('time') == stamp)

    # Block publication and selection of a reused job result while removing its
    # files. Automatic retention is deliberately unaffected by manual deletion.
    with history.lock, clouds.lock:
        if history.state.get('state') in ('running', 'cancelling') or clouds.state.get('state') == 'running':
            raise ValueError('云图正在下载，请完成或取消后删除')
        for path in (image, sidecar):
            if path.is_symlink() or path.resolve().parent != root:
                raise ValueError('云图文件路径无效')
        exists = image.exists() or sidecar.exists()
        if exists:
            try:
                meta = json.loads(sidecar.read_text())
            except (OSError, ValueError):
                raise ValueError('云图文件记录无法核验，未删除') from None
            if not matches(meta):
                raise ValueError('云图版本已改变，请刷新图库后重试')
            if image.exists() and hashlib.sha256(image.read_bytes()).hexdigest() != sha:
                raise ValueError('云图文件校验失败，未删除')
        image.unlink(missing_ok=True)
        sidecar.unlink(missing_ok=True)
        # Prevent the legacy migration from repopulating an explicitly emptied
        # library at the next launch.
        (root/'migration-complete').touch()
        if matches(history.state.get('result')):
            history.state = {'state': 'idle'}
            history._persist()
        if matches(clouds.result):
            clouds.state = {'state': 'idle'}
            clouds.result = clouds.image = None
            clouds.check = {}
        # Other local viewer origins have their own persisted completion cards.
        # Forget only matching completed jobs, never their unrelated/running jobs.
        for path in root.glob('download-job*.json'):
            if path.is_symlink():
                continue
            try:
                job = json.loads(path.read_text())
                if job.get('state') == 'ready' and matches(job.get('result')):
                    pending = path.with_suffix('.delete.tmp')
                    pending.write_text(json.dumps({'state': 'idle'}))
                    pending.replace(path)
            except (OSError, ValueError, AttributeError):
                continue
        return {'deleted': True, 'alreadyAbsent': not exists, 'name': name, 'sha256': sha}
