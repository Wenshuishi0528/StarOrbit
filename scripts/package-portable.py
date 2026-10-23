"""Package only runtime files; exclude raw textures, dependencies and build caches."""
from pathlib import Path
import argparse
import zipfile
import json

root = Path(__file__).resolve().parents[1]
app = json.loads((root / 'package.json').read_text())
version = app.get('displayVersion', app['version'])
parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
args = parser.parse_args()
files = ['天宫空间站交互预览.html', '启动实时地球.command',
         'scripts/serve.py', '使用说明.md', '素材与迁移说明.md']
size = sum((root / name).stat().st_size for name in files)
if size > 400_000_000:
    raise SystemExit('Runtime package exceeds the 400 MB budget')
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in files:
        z.write(root / name, '天宫轨道模拟/' + name)
    z.writestr('天宫轨道模拟/先读我.txt', f'''天宫 · 轨道模拟 v{version} / Tiangong Orbit Simulator
作者 / Author: wenshuishi0528

直接打开「天宫空间站交互预览.html」即可离线运行。
macOS需要统一联网更新时，运行「启动实时地球.command」。
其他系统可安装Python 3后运行：python3 scripts/serve.py --open
同一浏览器和地址会记住设置，切换file/localhost时各自独立保存。
浏览器下载的历史云图/极光缓存可在软件内另行管理和清理。

Open the HTML file in a recent Chrome, Edge, or Safari for offline use.
For the local update relay, run python3 scripts/serve.py --open.
This portable edition includes all runtime assets inside the HTML.
Development sources, raw EXR data and build dependencies are excluded.
The separate developer sections of the manual apply to the source checkout.
''')
print(f'Runtime files: {size / 1e6:.1f} MB; ZIP: {args.output.stat().st_size / 1e6:.1f} MB')
print(args.output)
