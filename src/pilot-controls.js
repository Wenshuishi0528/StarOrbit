// Pilot axes are intrinsic to the craft, independent of the observer camera.
// KSP's flight convention: W pitches down; I translates down. Other viewers
// reuse these meanings, without inventing flight systems they do not simulate.
const bindings={
 pitchDown:['KeyW','pitch',-1],pitchUp:['KeyS','pitch',1],yawLeft:['KeyA','yaw',1],yawRight:['KeyD','yaw',-1],
 rollLeft:['KeyQ','roll',-1],rollRight:['KeyE','roll',1],
 forward:['KeyH','forward',1],back:['KeyN','forward',-1],left:['KeyJ','right',-1],right:['KeyL','right',1],
 down:['KeyI','up',-1],up:['KeyK','up',1],
};
export const PILOT_CODES=Object.freeze(Object.fromEntries(Object.entries(bindings).map(([name,[code]])=>[name,code])));
export const PILOT_KEY_AXES=Object.freeze(Object.fromEntries(Object.values(bindings).map(([code,axis,sign])=>[code,Object.freeze([axis,sign])])));
export function pilotAxes(keys){
 const axes={pitch:0,yaw:0,roll:0,forward:0,right:0,up:0};
 for(const key of keys){const binding=PILOT_KEY_AXES[key];if(binding)axes[binding[0]]+=binding[1];}
 return axes;
}
export function pilotRotation({pitch=0,yaw=0,roll=0},assembly){return assembly?[roll,-pitch,yaw]:[-yaw,-pitch,roll];}
export function pilotTranslation([forward,right,up],assembly){return assembly?[forward,-right,up]:[-up,-right,forward];}
// F reverses the stored SAS switch only while held; T owns the stored switch.
export function pilotSas(enabled,temporary=false){return (enabled!==false)!==!!temporary;}
