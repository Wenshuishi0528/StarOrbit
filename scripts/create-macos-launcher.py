"""Build a small desktop launcher for an existing local Tiangong runtime."""
from pathlib import Path
import argparse, json, plistlib, subprocess, tempfile
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--portable',action='store_true');a=p.parse_args()
runtime=a.root.resolve();app=a.output.resolve()
if not (runtime/'天宫空间站交互预览.html').is_file():raise SystemExit('Standalone HTML not found')
if app.exists():raise SystemExit('Output already exists; choose a new app path')
mac=app/'Contents/MacOS';resources=app/'Contents/Resources';mac.mkdir(parents=True);resources.mkdir()
package=json.loads((root/'package.json').read_text());version=package.get('displayVersion',package['version'])
info={'CFBundleName':'天宫轨道模拟','CFBundleDisplayName':'天宫轨道模拟','CFBundleIdentifier':'io.github.wenshuishi.tiangong-launcher','CFBundleExecutable':'TiangongLauncher','CFBundlePackageType':'APPL','CFBundleIconFile':'AppIcon','CFBundleShortVersionString':version,'CFBundleVersion':version,'LSMinimumSystemVersion':'12.0','LSUIElement':True,'NSHighResolutionCapable':True,'NSHumanReadableCopyright':'wenshuishi0528'}
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
(resources/'launcher-config.json').write_text(json.dumps({'root':'.' if a.portable else str(runtime)},ensure_ascii=False)+'\n')
with tempfile.TemporaryDirectory(prefix='tiangong-launcher-') as temporary:
 t=Path(temporary)
 for arch in ['arm64','x86_64']:
  subprocess.run(['swiftc',str(root/'macos/Launcher.swift'),'-target',arch+'-apple-macos12.0','-O','-o',str(t/arch)],check=True)
 subprocess.run(['lipo','-create',str(t/'arm64'),str(t/'x86_64'),'-output',str(mac/'TiangongLauncher')],check=True)
 subprocess.run(['swift',str(root/'macos/Icon.swift'),str(resources/'AppIcon.png')],check=True)
 icons=t/'AppIcon.iconset';icons.mkdir()
 for points in [16,32,128,256,512]:
  for scale in [1,2]:
   size=points*scale;name=f'icon_{points}x{points}'+('@2x' if scale==2 else '')+'.png'
   subprocess.run(['sips','-z',str(size),str(size),str(resources/'AppIcon.png'),'--out',str(icons/name)],stdout=subprocess.DEVNULL,check=True)
 subprocess.run(['iconutil','-c','icns',str(icons),'-o',str(resources/'AppIcon.icns')],check=True)
subprocess.run(['codesign','--force','--sign','-','--timestamp=none',str(app)],check=True)
print(app)
