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
parser.add_argument('--macos-launcher',type=Path)
args = parser.parse_args()
files = ['StarOrbit.html', '启动星轨.command',
         'scripts/serve.py', 'scripts/cloud_service.py', 'scripts/satcorps.py', 'scripts/cloud-requirements.txt', '使用说明.md', '素材与迁移说明.md', 'LICENSE', 'LICENSING.md']
launcher_files = [p for p in args.macos_launcher.rglob('*') if p.is_file()] if args.macos_launcher else []
size = sum((root / name).stat().st_size for name in files)+sum(p.stat().st_size for p in launcher_files)
if size > 400_000_000:
    raise SystemExit('Runtime package exceeds the 400 MB budget')
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in files:
        z.write(root / name, '星轨/' + name)
    for p in launcher_files:
        z.write(p, '星轨/星轨.app/' + str(p.relative_to(args.macos_launcher)))
    z.writestr('星轨/先读我.txt', f'''星轨 · 航天与轨道模拟 v{version} / StarOrbit · Space & Orbit Simulator
作者 / Author: wenshuishi0528

直接打开「StarOrbit.html」即可离线运行。
macOS 可双击包内「星轨.app」（若已包含），或运行「启动星轨.command」。
应用启动器需与运行文件保持在同一文件夹；本地服务会在后台运行。
其他系统可安装Python 3后运行：python3 scripts/serve.py --open
同一浏览器和地址会记住设置，切换file/localhost时各自独立保存。
浏览器下载的历史云图/极光缓存可在软件内另行管理和清理。

Open the HTML file in a recent Chrome, Edge, or Safari for offline use.
On macOS, use the included app launcher or run 启动星轨.command.
Keep the app next to the HTML; the launcher supports Intel and Apple Silicon.
For the local update relay on other systems, run python3 scripts/serve.py --open.
This portable edition includes all runtime assets inside the HTML.
Development sources, raw EXR data and build dependencies are excluded.
The separate developer sections of the manual apply to the source checkout.
''')
print(f'Runtime files: {size / 1e6:.1f} MB; ZIP: {args.output.stat().st_size / 1e6:.1f} MB')
print(args.output)
