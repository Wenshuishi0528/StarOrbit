import {WeatherCache} from './weather-cache.js';
import {registerMissionPackage,unregisterMissionPackage,validateMissionPackage,validateGLB} from './mission-package.js';
import {parseMissionOrbit} from './gp-orbit.js';
export class MissionLibrary{
 constructor(){this.packages=new Map();this.orbits={};this.errors=[];}
 async restore(){
  this.cache=new WeatherCache('tiangong-mission-packages-v1');
  for(const record of await this.cache.all()){
   let registered=false;
   try{const config=registerMissionPackage(record.config);registered=true;const orbit=record.orbit?parseMissionOrbit(JSON.stringify(record.orbit),config.id):null;this.packages.set(config.id,record);this.orbits[config.id]=orbit;}
   catch(e){if(registered)unregisterMissionPackage(record.config.id);this.errors.push(e.message);}
  }
 }
 async prepare(files){
  const byName=new Map();for(const f of files){if(byName.has(f.name))throw Error('文件名重复');byName.set(f.name,f);}
  let config;
  for(const f of files)if(f.name.toLowerCase().endsWith('.json')&&f.size<=1e6){
   let x;try{x=JSON.parse(await f.text());}catch{continue;}
   if(x.format==='tiangong-mission-1'){if(config)throw Error('一次导入一个任务配置');config=validateMissionPackage(x);}
  }
  if(!config)throw Error('请选择一份任务配置 JSON，以及对应的模型和轨道文件');
  const model=byName.get(config.model.file),orbitFile=config.orbit.file&&byName.get(config.orbit.file);
  if(!model)throw Error('缺少模型文件：'+config.model.file);if(model.size>128e6)throw Error('模型文件上限为 128 MB');
  if(config.orbit.file&&!orbitFile)throw Error('缺少轨道文件：'+config.orbit.file);if(orbitFile?.size>30e6)throw Error('轨道文件上限为 30 MB');
  const buffer=await model.arrayBuffer();validateGLB(buffer);
  registerMissionPackage(config);
  try{const orbit=orbitFile?parseMissionOrbit(await orbitFile.text(),config.id):null;return {id:config.id,config,blob:new Blob([buffer],{type:'model/gltf-binary'}),orbit};}
  catch(e){unregisterMissionPackage(config.id);throw e;}
 }
 async commit(record){
  if(!this.cache.persistent)throw Error('浏览器未开启任务保存，请允许本地存储后导入');
  await this.cache.put(record);this.packages.set(record.id,record);this.orbits[record.id]=record.orbit;
 }
}
export const missionLibrary=new MissionLibrary();
