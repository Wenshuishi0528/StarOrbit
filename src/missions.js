// Asset dimensions and axes are separate from the task's orbit and attitude.
// Existing station coordinates use 5 viewer units per real metre.
export const VIEW_UNITS_PER_METRE=5;
import catalog from '../assets/missions/catalog.json' with {type:'json'};
export const SPACECRAFT={...catalog.spacecraft};
export const MISSIONS={...catalog.missions};
export const DEFAULT_MISSION='tiangong';
export function mission(id){if(!Object.hasOwn(MISSIONS,id))throw Error('未知任务');return MISSIONS[id];}
export function missionLabel(id,translate=x=>x){const task=mission(id);return [task.planet,task.category,task.name].map(value=>translate(value)).join('：');}
export function spacecraft(id){return SPACECRAFT[mission(id).spacecraft];}
export function orbitState(data,time){return !data?'missing':time<data.rows[0][0]||time>data.rows.at(-1)[0]?'out-of-range':'ready';}
export function validatePose(pose={roll:0,pitch:0,yaw:0}){
 const result={};for(const key of ['roll','pitch','yaw']){const v=pose?.[key];if(!Number.isFinite(v)||v < -180||v > 180)throw Error('无效航天器姿态');result[key]=v;}return result;
}
export function bindOrbit(data,id){
 const task=mission(id);
 if(data===null)return null;
 if(data.missionId!==undefined&&data.missionId!==id)throw Error('轨道属于其他任务');
 if(task.objectId&&data.objectId!==undefined&&data.objectId!==task.objectId)throw Error('轨道文件的卫星编号与当前任务不符');
 if(task.noradId&&data.noradId!==undefined&&data.noradId!==task.noradId)throw Error('轨道文件的卫星编号与当前任务不符');
 if(data.center!==undefined&&data.center!==task.center)throw Error('当前仅支持绕地轨道');
 return {...data,missionId:id,center:task.center};
}
