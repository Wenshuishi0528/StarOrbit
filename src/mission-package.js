import {MISSIONS,SPACECRAFT} from './missions.js';
const axes=['+X','-X','+Y','-Y','+Z','-Z'];
const label=(value,name)=>{if(typeof value!=='string'||!value.trim()||value.length>120)throw Error('请填写'+name);return value.trim();};
const filename=x=>typeof x==='string'&&x.length<=160&&!/[\\/\u0000-\u001f]/.test(x)&&!['.','..',''].includes(x);
export function validateMissionPackage(input){
 if(!input||input.format!=='tiangong-mission-1')throw Error('配置格式应为 tiangong-mission-1');
 const x=structuredClone(input),m=x.model,o=x.orbit||{};
 if(typeof x.id!=='string'||! /^[a-z][a-z0-9-]{1,62}$/.test(x.id)||['constructor','prototype','__proto__'].includes(x.id))throw Error('任务 ID 使用 2–63 位小写字母、数字和连字符');
 x.name=label(x.name,'名称');x.category=label(x.category||'卫星','类别');
 if(x.center!==undefined&&x.center!=='EARTH'||x.planet!==undefined&&x.planet!=='地球')throw Error('当前星球配置为地球');
 if(!m||!filename(m.file)||!m.file.toLowerCase().endsWith('.glb'))throw Error('请配置 GLB 模型文件名');
 if(!Number.isFinite(m.metresPerUnit)||m.metresPerUnit<=0||m.metresPerUnit>1e6)throw Error('模型比例应为每个单位对应的米数');
 if(!axes.includes(m.forwardAxis)||!axes.includes(m.normalAxis)||m.forwardAxis.at(-1)===m.normalAxis.at(-1))throw Error('前向轴和轨道法向轴应互相垂直');
 if(o.file!=null&&!filename(o.file))throw Error('请配置轨道文件名');
 if(o.updateSource!=null&&!['celestrak'].includes(o.updateSource))throw Error('在线轨道源可选 celestrak');
 if(o.noradId!=null&&(!Number.isSafeInteger(o.noradId)||o.noradId<1||o.noradId>999999999))throw Error('无效 NORAD 编号');
 if(o.objectId!=null&&!/^\d{4}-\d{3}[A-Z]{1,3}$/.test(o.objectId))throw Error('无效国际卫星编号');
 if(o.updateSource==='celestrak'&&(!o.noradId||!o.objectId))throw Error('CelesTrak 更新需要 NORAD 编号和国际卫星编号');
 if(x.spinRpm!=null&&(!Number.isFinite(x.spinRpm)||x.spinRpm<0||x.spinRpm>6000))throw Error('自旋速度范围为 0–6000 转/分');
 if(x.spinSource!=null&&!(typeof x.spinSource==='string'&&/^https?:\/\//.test(x.spinSource)))throw Error('自旋来源应为网页地址');
 if(x.axes!=null&&(typeof x.axes!=='string'||x.axes.length>500))throw Error('轴向说明应在 500 字以内');
 return {format:x.format,id:x.id,name:x.name,category:x.category,planet:'地球',center:'EARTH',model:{file:m.file,metresPerUnit:m.metresPerUnit,forwardAxis:m.forwardAxis,normalAxis:m.normalAxis},orbit:{file:o.file||null,updateSource:o.updateSource||null,noradId:o.noradId,objectId:o.objectId},spinRpm:x.spinRpm||0,spinSource:x.spinSource,axes:x.axes};
}
export function registerMissionPackage(input){
 const x=validateMissionPackage(input);if(Object.hasOwn(MISSIONS,x.id))throw Error('任务 ID 已存在，请在配置中换一个 ID');
 SPACECRAFT[x.id]={name:x.name,asset:null,metresPerUnit:x.model.metresPerUnit,forwardAxis:x.model.forwardAxis,normalAxis:x.model.normalAxis,axes:x.axes||'模型前向轴映射到星体 +Z，轨道法向轴映射到星体 +Y。',capabilities:{assembly:false,solarArrays:false,manualAttitude:true}};
 MISSIONS[x.id]={name:x.name,planet:x.planet,category:x.category,center:x.center,spacecraft:x.id,attitude:'velocity-axis',attitudeNote:'航向跟随时星体 +Z 沿速度方向、+Y 沿轨道法向；惯性定轴时保持参考历元的轴向。',spinRpm:x.spinRpm,spinSource:x.spinSource,...x.orbit};return x;
}
export function unregisterMissionPackage(id){delete MISSIONS[id];delete SPACECRAFT[id];}
export function validateGLB(buffer){
 const view=new DataView(buffer);if(buffer.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw Error('模型应为完整的 GLB 2.0 文件');
 const length=view.getUint32(12,true);if(view.getUint32(16,true)!==0x4e4f534a||20+length>buffer.byteLength)throw Error('GLB 模型结构无效');
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
 for(const part of [...(json.buffers||[]),...(json.images||[])])if(part.uri&&!part.uri.startsWith('data:'))throw Error('请导出包含纹理和网格的独立 GLB 文件');
 return json;
}
export const MISSION_TEMPLATE={format:'tiangong-mission-1',id:'my-satellite',name:'我的卫星',planet:'地球',category:'卫星',center:'EARTH',model:{file:'model.glb',metresPerUnit:1,forwardAxis:'+Y',normalAxis:'-Z'},orbit:{file:'orbit.json'},spinRpm:0};
