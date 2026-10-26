import {build} from 'esbuild';import fs from 'node:fs';import zlib from 'node:zlib';import crypto from 'node:crypto';import path from 'node:path';
const web=process.argv.includes('--web'),out='dist';
if(web){fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out+'/assets',{recursive:true});}
const emitted=new Map();
function publish(file,bytes=fs.readFileSync(file),suffix=path.extname(file)){
 const hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16),name=path.basename(file,path.extname(file))+'-'+hash+suffix,url='assets/'+name;
 if(!emitted.has(url)){fs.writeFileSync(out+'/'+url,bytes);emitted.set(url,bytes.length);}return url;
}
const image=file=>web?publish(file):'data:image/jpeg;base64,'+fs.readFileSync(file).toString('base64');
const packed=file=>{const bytes=zlib.gzipSync(fs.readFileSync(file),{level:9});return web?{url:publish(file,bytes,'.glb.gz')}:bytes.toString('base64');};
import {SPACECRAFT,MISSIONS} from './src/missions.js';
const spacecraftModels=Object.fromEntries(Object.entries(SPACECRAFT).filter(([,x])=>x.asset).map(([id,x])=>[id,packed(x.asset)]));
const missionOrbits=Object.fromEntries(Object.entries(MISSIONS).map(([id,x])=>[id,x.orbitAsset?JSON.parse(fs.readFileSync(x.orbitAsset,'utf8')):null]));
const music=JSON.parse(fs.readFileSync('assets/music/catalog.json','utf8')).map(({file,...track})=>({...track,...(web?{url:publish(file)}:{base64:fs.readFileSync(file).toString('base64')})}));
const app=JSON.parse(fs.readFileSync('package.json','utf8'));
await build({entryPoints:['src/app.js'],bundle:true,format:'iife',minify:true,outfile:'assets/app.bundle.js',legalComments:'none',define:{__WEB_BUILD__:String(web)}});
const environmentAssets=Object.fromEntries(['simple','medium','standard','high'].map(tier=>[tier,Object.fromEntries(fs.readdirSync('assets/earth/'+tier).filter(f=>f.endsWith('.jpg')).map(f=>[f.replace('.jpg',''),image('assets/earth/'+tier+'/'+f)]))]));
environmentAssets.detail=Object.fromEntries(fs.readdirSync('assets/earth/detail').filter(f=>f.endsWith('.jpg')).map(f=>[f.slice(0,-4),image('assets/earth/detail/'+f)]));
environmentAssets.nightDetail=Object.fromEntries(fs.readdirSync('assets/earth/night-detail').filter(f=>f.endsWith('.jpg')).map(f=>[f.slice(0,-4),image('assets/earth/night-detail/'+f)]));
environmentAssets.moon=image('assets/moon/lroc-color-2k.jpg');
environmentAssets.sky=Object.fromEntries([4,8,16].map(size=>[size,['px','nx','py','ny','pz','nz'].map(face=>image(`assets/sky/milkyway-${size}k-${face}.jpg`))]));
let html=fs.readFileSync('src/layout.html','utf8').replace('__EVENT_TIMELINE_CSS__',()=>fs.readFileSync('src/event-timeline.css','utf8')).replace('__EVENT_TIMELINE_UI__',()=>fs.readFileSync('src/event-timeline.html','utf8')).replace('__HELP_CSS__',()=>fs.readFileSync('src/help.css','utf8')).replace('__HELP_UI__',()=>fs.readFileSync('src/help.html','utf8')).replace('__MUSIC_CSS__',()=>fs.readFileSync('src/music.css','utf8')).replace('__MUSIC_UI__',()=>fs.readFileSync('src/music-widget.html','utf8')).replace('__MUSIC_DATA__',()=>JSON.stringify(music).replaceAll('</script','<\\/script')).replace('__APP_VERSION__',app.displayVersion||app.version).replace('__APP_AUTHOR__',app.author).replace('__ENV_ASSETS__',()=>JSON.stringify(environmentAssets)).replace('__SPACECRAFT_MODELS__',()=>JSON.stringify(spacecraftModels)).replace('__MISSION_ORBITS__',()=>JSON.stringify(web?{url:publish('orbits.json',Buffer.from(JSON.stringify(missionOrbits)))}:missionOrbits).replaceAll('</script','<\\/script')).replace('__META__',fs.readFileSync('assets/model.json','utf8')).replace('__MODEL__',web?JSON.stringify(packed('assets/station.glb')):packed('assets/station.glb')).replace('<script>__JS__</script>',()=>web?'<script defer src="'+publish('assets/app.bundle.js')+'"></script>':'<script>'+fs.readFileSync('assets/app.bundle.js','utf8').replaceAll('</script','<\\/script')+'</script>');
html=html.replace('</head>','<!-- satellite.js MIT license\n'+fs.readFileSync('node_modules/satellite.js/LICENSE.md','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Three.js license\n'+fs.readFileSync('node_modules/three/LICENSE','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Astronomy Engine MIT / three-mesh-bvh MIT licenses\n'+fs.readFileSync('node_modules/astronomy-engine/astronomy.js','utf8').split('*/')[0].slice(3)+'\n'+fs.readFileSync('node_modules/three-mesh-bvh/LICENSE','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Earth and star credits\n'+fs.readFileSync('素材与迁移说明.md','utf8')+'\n'+fs.readFileSync('assets/D3-CELESTIAL-LICENSE.txt','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Atmospheric spectral reference license\n'+fs.readFileSync('tests/reference/atmosphere-spectrum/LICENSE-Bruneton.txt','utf8')+' -->\n</head>');
const bytes=Buffer.byteLength(html);
if(bytes>400e6)throw new Error('Standalone app exceeds the 400 MB distribution budget');
if(web){fs.writeFileSync(out+'/index.html',html);fs.writeFileSync(out+'/.nojekyll','');fs.writeFileSync(out+'/version.json',JSON.stringify({version:app.displayVersion}));console.log('Built web index',bytes,'bytes; assets',Math.round([...emitted.values()].reduce((a,b)=>a+b,0)/1e6),'MB');}else{fs.writeFileSync('天宫空间站交互预览.html',html);console.log('Built offline HTML',Math.round(bytes/1e6)+' MB / '+Math.round(bytes/1024/1024)+' MiB');}
