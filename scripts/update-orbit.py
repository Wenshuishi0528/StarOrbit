"""Refresh the embedded official OEM data, then rebuild the offline HTML."""
import subprocess, shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
url='https://en.cmse.gov.cn/news/202107/t20210722_48418.html'
raw=root/'assets/official-orbit-source.html';data=root/'assets/orbit.json'
oldraw=raw.read_bytes();olddata=data.read_bytes()
try:
    print('正在下载官方轨道数据…',flush=True)
    result=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','45','--proto','=https','--proto-redir','=https',url],capture_output=True,check=True)
    body=result.stdout
    if len(body)>5_000_000: raise RuntimeError('官方响应异常，超过 5 MB')
    raw.write_bytes(body)
    subprocess.run(['python3',str(root/'scripts/prepare-orbit.py')],cwd=root,check=True)
    node=shutil.which('node') or '/opt/homebrew/bin/node'
    subprocess.run([node,'--input-type=module','-e',"import fs from 'node:fs';import {validateOrbit} from './src/orbit.js';validateOrbit(JSON.parse(fs.readFileSync('assets/orbit.json')));"],cwd=root,check=True)
    subprocess.run([node,'build.mjs'],cwd=root,check=True)
    print('更新完成。请重新打开 HTML 或刷新浏览器。')
except Exception as e:
    raw.write_bytes(oldraw);data.write_bytes(olddata)
    print('更新未完成，已保留原有数据和 HTML：',e)
    raise SystemExit(1)
