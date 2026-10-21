import {build} from 'esbuild';import fs from 'node:fs';import zlib from 'node:zlib';
const app=JSON.parse(fs.readFileSync('package.json','utf8'));
await build({entryPoints:['src/app.js'],bundle:true,format:'iife',minify:true,outfile:'assets/app.bundle.js',legalComments:'none'});
const environmentAssets=Object.fromEntries(['simple','medium','high'].map(tier=>[tier,Object.fromEntries(fs.readdirSync('assets/earth/'+tier).filter(f=>f.endsWith('.jpg')).map(f=>[f.replace('.jpg',''),'data:image/jpeg;base64,'+fs.readFileSync('assets/earth/'+tier+'/'+f).toString('base64')]))]));
let html=fs.readFileSync('src/layout.html','utf8').replace('__APP_VERSION__',app.displayVersion||app.version).replace('__APP_AUTHOR__',app.author).replace('__ENV_ASSETS__',()=>JSON.stringify(environmentAssets)).replace('__META__',fs.readFileSync('assets/model.json','utf8')).replace('__MODEL__',zlib.gzipSync(fs.readFileSync('assets/station.glb'),{level:9}).toString('base64')).replace('__JS__',()=>fs.readFileSync('assets/app.bundle.js','utf8').replaceAll('</script','<\\/script'));
html=html.replace('</head>','<!-- Three.js license\n'+fs.readFileSync('node_modules/three/LICENSE','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Astronomy Engine MIT / three-mesh-bvh MIT licenses\n'+fs.readFileSync('node_modules/astronomy-engine/astronomy.js','utf8').split('*/')[0].slice(3)+'\n'+fs.readFileSync('node_modules/three-mesh-bvh/LICENSE','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Earth and star credits\n'+fs.readFileSync('素材与迁移说明.md','utf8')+'\n'+fs.readFileSync('assets/D3-CELESTIAL-LICENSE.txt','utf8')+' -->\n</head>');
fs.writeFileSync('天宫空间站交互预览.html',html);console.log('Built offline HTML',Math.round(Buffer.byteLength(html)/1024/1024)+' MB');
