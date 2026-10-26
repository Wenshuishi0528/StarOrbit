export const WEB_BUILD=typeof __WEB_BUILD__!=='undefined'&&__WEB_BUILD__;
export async function readPackedModel(source){
 if(typeof source==='string'&&source.startsWith('{'))source=JSON.parse(source);
 let stream;
 if(source?.url){const response=await fetch(source.url);if(!response.ok)throw Error('模型资源加载失败');stream=response.body;}
 else{const bytes=Uint8Array.from(atob(source),c=>c.charCodeAt(0));stream=new Blob([bytes]).stream();}
 return new Response(stream.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
export async function hydrateOrbitData(){
 const node=document.getElementById('missionOrbits'),data=JSON.parse(node.textContent);
 if(data.url){const response=await fetch(data.url);if(!response.ok)throw Error('轨道资源加载失败');node.textContent=JSON.stringify(await response.json());}
}
