import { jsonChunks, embeddedAssetScripts, writeTemplatePayloads } from './scripts/build-payload.mjs';
import {build} from 'esbuild';import fs from 'node:fs';import zlib from 'node:zlib';import crypto from 'node:crypto';import path from 'node:path';
const web=process.argv.includes('--web'),split=web||process.argv.includes('--local'),out=web?'dist':'dist-local';
if(split){fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out+'/assets',{recursive:true});}
const emitted=new Map();
function publish(file,bytes=fs.readFileSync(file),suffix=path.extname(file)){
 const hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16),name=path.basename(file,path.extname(file))+'-'+hash+suffix,url='assets/'+name;
 if(!emitted.has(url)){fs.writeFileSync(out+'/'+url,bytes);emitted.set(url,bytes.length);}return url;
}
const image=file=>split?publish(file):'data:image/'+({'.png':'png','.avif':'avif','.webp':'webp'}[path.extname(file)]||'jpeg')+';base64,'+fs.readFileSync(file).toString('base64');
const packed=file=>{const bytes=zlib.gzipSync(fs.readFileSync(file),{level:9});return split?{url:publish(file,bytes,'.glb.gz')}:bytes.toString('base64');};
import {SPACECRAFT,MISSIONS} from './src/missions.js';
const spacecraftModels=Object.fromEntries(Object.entries(SPACECRAFT).filter(([,x])=>x.asset).map(([id,x])=>[id,packed(x.asset)]));
const missionOrbits=Object.fromEntries(Object.entries(MISSIONS).map(([id,x])=>[id,x.orbitAsset?JSON.parse(fs.readFileSync(x.orbitAsset,'utf8')):null]));
const music=JSON.parse(fs.readFileSync('assets/music/catalog.json','utf8')).map(({file,...track})=>({...track,...(split?{url:publish(file)}:{base64:fs.readFileSync(file).toString('base64')})}));
music.push({id:'mission-dfh1-broadcast',title:'东方红一号 · 乐曲与遥测信号',mission:'dfh1',sha256:crypto.createHash('sha256').update(fs.readFileSync('assets/music/dfh1-broadcast.m4a')).digest('hex'),type:'audio/mp4',duration:56.067755,...(split?{url:publish('assets/music/dfh1-broadcast.m4a')}:{base64:fs.readFileSync('assets/music/dfh1-broadcast.m4a').toString('base64')})});
const app=JSON.parse(fs.readFileSync('package.json','utf8'));
const trial=JSON.parse(fs.readFileSync('assets/cloud-trial/manifest.json','utf8'));
trial.samples=Object.fromEntries(['day','night'].map(kind=>{const file='assets/cloud-trial/'+kind+'.png';return [kind,split?publish(file):'data:image/png;base64,'+fs.readFileSync(file).toString('base64')];}));
const worklet=await build({entryPoints:['src/dfh1-telemetry-worklet.js'],bundle:true,format:'iife',minify:true,write:false,legalComments:'none'});
const cityWorker=await build({entryPoints:['src/city-terrain-worker.js'],bundle:true,format:'iife',minify:true,write:false,platform:'browser',legalComments:'none'});
const elevationWorker=await build({entryPoints:['src/earth-elevation-worker.js'],bundle:true,format:'iife',minify:true,write:false,platform:'browser',legalComments:'none'});
await build({entryPoints:['src/app.js'],bundle:true,format:'iife',minify:true,outfile:'assets/app.bundle.js',legalComments:'none',define:{__WEB_BUILD__:String(web),__TELEMETRY_WORKLET_SOURCE__:JSON.stringify(worklet.outputFiles[0].text),__CITY_TERRAIN_WORKER__:JSON.stringify(cityWorker.outputFiles[0].text),__ELEVATION_WORKER__:JSON.stringify(elevationWorker.outputFiles[0].text),__VIIRS_TRIAL__:JSON.stringify(trial)}});
const environmentAssets=Object.fromEntries(['simple','medium','standard','high'].map(tier=>[tier,Object.fromEntries(fs.readdirSync('assets/earth/'+tier).filter(f=>f.endsWith('.jpg')).map(f=>[f.replace('.jpg',''),image(f==='day.jpg'&&tier!=='high'?'assets/earth/day-2004/'+tier+'.jpg':'assets/earth/'+tier+'/'+f)]))]));
// The minimap is a readable display map, independent of 3D reflectance assets.
environmentAssets.minimap=image('assets/earth/minimap/display.avif');
environmentAssets.detail=Object.fromEntries(fs.readdirSync('assets/earth/detail').filter(f=>f.endsWith('.jpg')).map(f=>[f.slice(0,-4),image('assets/earth/detail/'+f)]));
environmentAssets.nightDetail=Object.fromEntries(fs.readdirSync('assets/earth/night-detail').filter(f=>f.endsWith('.jpg')).map(f=>[f.slice(0,-4),image('assets/earth/night-detail/'+f)]));
environmentAssets.nightSources={'2016':{columns:24,rows:12,base:Object.fromEntries(['simple','medium','standard','high'].map(tier=>[tier,environmentAssets[tier].night]))}};
for(const id of ['2024-1km','2025-500m']){
 const dir='assets/earth/night-'+id,meta=JSON.parse(fs.readFileSync(dir+'/manifest.json','utf8'));
 const ext=id==='2025-500m'?'.avif':'.jpg';
 environmentAssets.nightSources[id]={columns:meta.columns,rows:meta.rows,base:Object.fromEntries(['simple','medium','standard','high'].map(tier=>[tier,image(dir+'/'+tier+ext)])),tiles:Object.fromEntries(Object.keys(meta.files).filter(f=>/^\d+-\d+\.(jpg|avif)$/.test(f)).map(f=>[f.slice(0,-ext.length),image(dir+'/'+f)]))};
}
// The old July 2004 map remains a complete selectable source. Reuse its existing tiles.
environmentAssets.daySources={'2004':{columns:12,rows:6,base:{}}};
for(const id of ['2026-q2-1km','2026-q2-500m']){
 const dir='assets/earth/day-'+id,meta=JSON.parse(fs.readFileSync(dir+'/manifest.json','utf8')),ext=id.endsWith('500m')?'.avif':'.jpg';
 environmentAssets.daySources[id]={columns:meta.columns,rows:meta.rows,base:Object.fromEntries(['simple','medium','standard','high'].map(tier=>[tier,image(dir+'/'+tier+ext)])),tiles:Object.fromEntries(Object.keys(meta.files).filter(f=>/^\d+-\d+\.(jpg|avif)$/.test(f)).map(f=>[f.slice(0,-ext.length),image(dir+'/'+f)]))};
 if(split&&id.endsWith('500m')){fs.mkdirSync(out+'/'+dir,{recursive:true});for(const name of ['README.md','manifest.json','provenance.json.gz','coastline.geojson.gz','coverage.png'])fs.copyFileSync(dir+'/'+name,out+'/'+dir+'/'+name);}
}
{const manifest=JSON.parse(fs.readFileSync('assets/earth/elevation/manifest.json','utf8'));const {file,...base}=manifest.base;environmentAssets.elevation={version:manifest.version,base:{...base,url:split?publish(file):'data:application/gzip;base64,'+fs.readFileSync(file).toString('base64')},source:manifest.source};}
{const manifest=JSON.parse(fs.readFileSync('assets/earth/observation/manifest.json','utf8'));const binary=file=>split?publish(file):'data:application/gzip;base64,'+fs.readFileSync(file).toString('base64');environmentAssets.earthObservation={...manifest,layers:Object.fromEntries(Object.entries(manifest.layers).map(([id,r])=>[id,{...r,url:image(r.file),...(r.heightFile?{heightUrl:binary(r.heightFile)}:{})}])),minerals:{...manifest.minerals,url:binary(manifest.minerals.file)}};}
environmentAssets.moon=image('assets/moon/lroc-color-2k.jpg');
{const manifest=JSON.parse(fs.readFileSync('assets/satellites/manifest.json','utf8'));const file='assets/satellites/'+manifest.file;environmentAssets.satellites={...manifest,url:split?publish(file):'data:application/gzip;base64,'+fs.readFileSync(file).toString('base64')};}
{const {sources,...manifest}=JSON.parse(fs.readFileSync('assets/mars/manifest.json','utf8'));environmentAssets.mars={...manifest,layers:Object.fromEntries(Object.entries(manifest.layers).map(([id,record])=>[id,{...record,url:image(record.file??record.url)}]))};const file=manifest.terrain.file??manifest.terrain.url;environmentAssets.mars.terrain={...manifest.terrain,url:split?publish(file):'data:application/gzip;base64,'+fs.readFileSync(file).toString('base64')};}
{const geology=JSON.parse(fs.readFileSync('assets/moon/geology/manifest.json','utf8'));environmentAssets.lunarGeology=Object.fromEntries(geology.outputs.map(record=>[record.id,image(record.file)]));}
{const {file,...terrain}=JSON.parse(fs.readFileSync('assets/moon/terrain-manifest.json','utf8'));environmentAssets.lunarTerrain={...terrain,url:split?publish(file):'data:application/gzip;base64,'+fs.readFileSync(file).toString('base64')};}

{
 const art=JSON.parse(fs.readFileSync('assets/constellation-art/manifest.json','utf8'));
 environmentAssets.constellationArt={version:art.version,constellationImages:art.constellationImages,images:art.images.map(c=>({imageId:c.imageId,width:c.width,height:c.height,size:c.size,constellationIds:c.constellationIds,anchors:c.anchors,url:image(c.file)}))};
 if(split){
  const directory=out+'/assets/constellation-art';fs.mkdirSync(directory,{recursive:true});
  for(const name of ['README.md','LICENSE-FAL-1.3.html','LICENSE-CC-BY-SA-4.0.txt','upstream-description.md'])fs.copyFileSync('assets/constellation-art/'+name,directory+'/'+name);
  fs.writeFileSync(directory+'/manifest.json',JSON.stringify({...art,images:art.images.map((record,i)=>({...record,file:'../'+path.basename(environmentAssets.constellationArt.images[i].url)}))},null,2));
 }
}

{
 const art=JSON.parse(fs.readFileSync('assets/chinese-sky/art/manifest.json','utf8'));
 environmentAssets.chineseConstellationArt={version:art.version,artworks:art.artworks,images:art.images.map(({imageId,file})=>({imageId,url:image(file)}))};
 if(split){
  const directory=out+'/assets/chinese-sky';fs.mkdirSync(directory+'/art',{recursive:true});
  fs.copyFileSync('LICENSE',out+'/LICENSE');
  for(const name of ['README.md','catalog.json'])fs.copyFileSync('assets/chinese-sky/'+name,directory+'/'+name);
  fs.mkdirSync(directory+'/source',{recursive:true});
  for(const name of ['CC-BY-SA-4.0.txt','index.json','I-239-hip_main.tsv','I-311-hip2.tsv','Gaia-DR3.csv','Gaia-DR3-AIP.xml','Gaia-HIP-crossmatch.csv'])fs.copyFileSync('assets/chinese-sky/source/'+name,directory+'/source/'+name);
  for(const name of ['README.md','provenance.json','rigid-placements.json','expansion-brief.json','subjects.txt','placement-audit.json'])fs.copyFileSync('assets/chinese-sky/art/'+name,directory+'/art/'+name);
  fs.mkdirSync(out+'/docs',{recursive:true});
  for(const name of fs.readdirSync('docs').filter(name=>/^v\d+\.\d+-validation\.json$/.test(name)))fs.copyFileSync('docs/'+name,out+'/docs/'+name);
  fs.copyFileSync('docs/birthday-calendar-sources.md',out+'/docs/birthday-calendar-sources.md');
  fs.writeFileSync(directory+'/art/manifest.json',JSON.stringify({...art,images:art.images.map((record,i)=>({...record,file:'../../../'+environmentAssets.chineseConstellationArt.images[i].url}))},null,2));
 }
}

{
 const manifest=JSON.parse(fs.readFileSync('assets/earth/cities/manifest.json','utf8'));
 environmentAssets.cityTerrain={version:manifest.version,cities:manifest.cities.map(c=>({
  ...Object.fromEntries(['id','names','center','bounds','extentKm','pixelSizeMeters','year','tileSize','gutter','maxLevel','bytes'].map(key=>[key,c[key]])),
  source:Object.fromEntries(['id','title','url','license','licenseUrl','credit','observed'].map(key=>[key,c.source[key]])),
  tiles:Object.fromEntries(Object.entries(c.tiles).map(([key,file])=>[key,image(file)]))
 }))};
}
environmentAssets.planets=Object.fromEntries(['Sun','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','SaturnRing'].map(body=>{
 const extension=body==='SaturnRing'?'png':'jpg';
 return [body,image('assets/planets/'+body+'.'+extension)];
}));
environmentAssets.sky=Object.fromEntries([4,8,16].map(size=>[size,['px','nx','py','ny','pz','nz'].map(face=>image(`assets/sky/milkyway-${size}k-${face}.jpg`))]));
{
 const {version,providers,local}=JSON.parse(fs.readFileSync('assets/sky-detail/manifest.json','utf8'));
 environmentAssets.skyDetail={version,providers:providers.map(({coverage,...provider})=>provider),local:{providerId:local.providerId,tiles:Object.fromEntries(Object.entries(local.tiles).map(([key,file])=>[key,image(file)]))}};
}
let html=fs.readFileSync('src/layout.html','utf8')
 .replace('__EVENT_TIMELINE_CSS__',()=>fs.readFileSync('src/event-timeline.css','utf8'))
 .replace('__EVENT_TIMELINE_UI__',()=>fs.readFileSync('src/event-timeline.html','utf8'))
 .replace('__WORKSPACE_CSS__',()=>['workspace.css','floating-windows.css','free-flight-layout.css','free-flight.css','free-flight-instruments.css','xuntian-scope.css','observation-journal.css'].map(f=>fs.readFileSync('src/'+f,'utf8')).join('\n'))
 .replace('__XUNTIAN_UI__',()=>fs.readFileSync('src/xuntian-scope.html','utf8'))
 .replace('__HELP_CSS__',()=>fs.readFileSync('src/help.css','utf8'))
 .replace('__HELP_UI__',()=>fs.readFileSync('src/help.html','utf8'))
 .replace('__MUSIC_CSS__',()=>fs.readFileSync('src/music.css','utf8'))
 .replace('__MUSIC_UI__',()=>fs.readFileSync('src/music-widget.html','utf8'))
 .replace('__APP_VERSION__',app.displayVersion||app.version).replace('__APP_AUTHOR__',app.author)
 .replace('<script id="environmentAssets" type="application/json">__ENV_ASSETS__</script>','__ENVIRONMENT_SCRIPT_PAYLOAD__')
 .replace('<script>__JS__</script>','__APP_JS_SCRIPT__');
const payloads={
 __MUSIC_DATA__:()=>jsonChunks(music),
 __ENVIRONMENT_SCRIPT_PAYLOAD__:function*(){
  if(!split){yield* embeddedAssetScripts(environmentAssets);return;}
  yield '<script id="environmentAssets" type="application/json">';yield* jsonChunks(environmentAssets);yield '</script>';
 },
 __SPACECRAFT_MODELS__:()=>jsonChunks(spacecraftModels),
 __MISSION_ORBITS__:()=>jsonChunks(split?{url:publish('orbits.json',Buffer.from(JSON.stringify(missionOrbits)))}:missionOrbits),
 __META__:()=>jsonChunks(JSON.parse(fs.readFileSync('assets/model.json','utf8'))),
 __MODEL__:()=>split?jsonChunks(packed('assets/station.glb')):packed('assets/station.glb'),
 __APP_JS_SCRIPT__:()=>split?'<script defer src="'+publish('assets/app.bundle.js')+'"></script>':'<script>'+fs.readFileSync('assets/app.bundle.js','utf8').replace(/<\/script/gi,'<\\/script')+'</script>',
};
html=html.replace('</head>','<!-- satellite.js MIT license\n'+fs.readFileSync('node_modules/satellite.js/LICENSE.md','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Three.js license\n'+fs.readFileSync('node_modules/three/LICENSE','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Astronomy Engine MIT / three-mesh-bvh MIT licenses\n'+fs.readFileSync('node_modules/astronomy-engine/astronomy.js','utf8').split('*/')[0].slice(3)+'\n'+fs.readFileSync('node_modules/three-mesh-bvh/LICENSE','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Earth and star credits\n'+fs.readFileSync('素材与迁移说明.md','utf8')+'\n'+fs.readFileSync('assets/D3-CELESTIAL-LICENSE.txt','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Constellation art attribution and placement license\n'+fs.readFileSync('assets/constellation-art/README.md','utf8')+'\n'+fs.readFileSync('assets/constellation-art/LICENSE-CC-BY-SA-4.0.txt','utf8')+'\n'+fs.readFileSync('assets/constellation-art/LICENSE-FAL-1.3.html','utf8').replaceAll('<','&lt;').replaceAll('>','&gt;')+' -->\n</head>');
html=html.replace('</head>','<!-- Chinese sky culture and modern teaching art credits\n'+fs.readFileSync('assets/chinese-sky/README.md','utf8')+'\n'+fs.readFileSync('assets/chinese-sky/art/README.md','utf8')+'\n'+fs.readFileSync('assets/chinese-sky/source/CC-BY-SA-4.0.txt','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Stellar distance catalogue attribution\n'+fs.readFileSync('assets/stellar-distances/README.md','utf8')+' -->\n</head>');
if(split) fs.cpSync('assets/stellar-distances',out+'/assets/stellar-distances',{recursive:true});
html=html.replace('</head>','<!-- Cosmic explorer: model methods and sources\n'+fs.readFileSync('assets/cosmic/README.md','utf8')+' -->\n</head>');
if(split) fs.cpSync('assets/cosmic',out+'/assets/cosmic',{recursive:true});
html=html.replace('</head>','<!-- Lunar observatory: sources and scientific scope\n'+fs.readFileSync('assets/moon/README.md','utf8')+'\n'+fs.readFileSync('assets/moon/SCIENCE.md','utf8')+' -->\n</head>');
if(split){fs.mkdirSync(out+'/assets/moon',{recursive:true});for(const file of ['README.md','SCIENCE.md','terrain-manifest.json','lola-720x360.i16.gz','lroc-color-2k.jpg'])fs.copyFileSync('assets/moon/'+file,out+'/assets/moon/'+file);}
for(const directory of ['places','geology']){if(split)fs.cpSync('assets/moon/'+directory,out+'/assets/moon/'+directory,{recursive:true});html=html.replace('</head>','<!-- Lunar '+directory+' provenance\n'+fs.readFileSync('assets/moon/'+directory+'/README.md','utf8')+' -->\n</head>');}


for(const directory of ['mars','satellites']){html=html.replace('</head>','<!-- Planetary sources\n'+fs.readFileSync('assets/'+directory+'/README.md','utf8').replaceAll('-->','-- >')+' -->\n</head>');if(split){fs.mkdirSync(out+'/assets/'+directory,{recursive:true});for(const file of ['README.md','manifest.json',...(directory==='mars'?['geology-legend.json']:[])])fs.copyFileSync('assets/'+directory+'/'+file,out+'/assets/'+directory+'/'+file);}}

html=html.replace('</head>','<!-- OpenCC search character mapping, Apache-2.0\n'+fs.readFileSync('assets/OPENCC-LICENSE.txt','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- GeoTIFF decoder licenses\n'+fs.readFileSync('assets/GEOTIFF-DEPENDENCY-LICENSES.txt','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Atmospheric spectral reference license\n'+fs.readFileSync('tests/reference/atmosphere-spectrum/LICENSE-Bruneton.txt','utf8')+' -->\n</head>');
html=html.replace('</head>','<!-- Earth observation sources\n'+fs.readFileSync('assets/earth/observation/README.md','utf8').replaceAll('-->','-- >')+' -->\n</head>');
// Keep the complete document and environment payload out of any single V8 string.
// Writes are atomic; failed size checks preserve the previous runnable build.
const bytes=writeTemplatePayloads(split?out+'/index.html':'StarOrbit.html',html,payloads,{maxBytes:1200e6});
if(split){fs.writeFileSync(out+'/.nojekyll','');fs.writeFileSync(out+'/version.json',JSON.stringify({version:app.displayVersion}));console.log('Built '+(web?'web':'local')+' index',bytes,'bytes; assets',Math.round([...emitted.values()].reduce((a,b)=>a+b,0)/1e6),'MB');}else{fs.writeFileSync('天宫空间站交互预览.html','<!doctype html><meta charset="UTF-8"><title>星轨 · StarOrbit</title><meta http-equiv="refresh" content="0;url=StarOrbit.html"><a href="StarOrbit.html">打开星轨 · Open StarOrbit</a>');console.log('Built offline HTML',Math.round(bytes/1e6)+' MB / '+Math.round(bytes/1024/1024)+' MiB');}

if(split){fs.mkdirSync(out+'/assets/earth/observation',{recursive:true});for(const file of ['README.md','manifest.json'])fs.copyFileSync('assets/earth/observation/'+file,out+'/assets/earth/observation/'+file);}
