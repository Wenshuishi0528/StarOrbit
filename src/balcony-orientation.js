// Sky angles are clockwise from north, elevation above the horizon and
// clockwise camera roll. W3C DeviceOrientation rotates Z, X, Y (degrees).
const RAD=Math.PI/180, DEG=1/RAD;
export const wrap=a=>(a%360+360)%360;
export const delta=(a,b)=>wrap(a-b+180)-180;
export function browserPose(event,screenAngle=0){
 const {alpha,beta,gamma}=event,compass=event.webkitCompassHeading;
 const hasCompass=Number.isFinite(compass)&&compass>=0&&compass<360&&!(event.webkitCompassAccuracy<0);
 if(!Number.isFinite(beta)||!Number.isFinite(gamma)||(!Number.isFinite(alpha)&&!hasCompass))return null;
 const absolute=event.absolute===true||event.type==='deviceorientationabsolute';
 const a=(hasCompass&&!absolute?-compass:alpha??-compass)*RAD,b=beta*RAD,g=gamma*RAD,s=screenAngle*RAD;
 const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);
 // Optical axis points through the rear of the screen; its top is corrected
 // for portrait/landscape rotation independently of this line of sight.
 const x=-ca*sg-sa*sb*cg,y=-sa*sg+ca*sb*cg,z=-cb*cg;
 const az=Math.atan2(x,y),el=Math.asin(Math.max(-1,Math.min(1,z)));
 const cs=Math.cos(s),ss=Math.sin(s);
 const ux=ss*(ca*cg-sa*sb*sg)-cs*sa*cb,uy=ss*(sa*cg+ca*sb*sg)+cs*ca*cb,uz=-ss*cb*sg+cs*sb;
 const roll=Math.atan2(ux*Math.cos(az)-uy*Math.sin(az),uz*Math.cos(el)-(ux*Math.sin(az)+uy*Math.cos(az))*Math.sin(el));
 return {yaw:wrap(az*DEG),pitch:el*DEG,roll:roll*DEG,absolute:absolute||hasCompass};
}

const isMacLocal=()=>['localhost','127.0.0.1'].includes(location.hostname)&&location.protocol==='http:'&&
 /Mac/i.test(navigator.platform||navigator.userAgent)&&!(navigator.maxTouchPoints>1);

function browserStream(signal,onPose,onError){
 const Type=window.DeviceOrientationEvent;
 if(!window.isSecureContext||!Type){onError('unsupported');return;}
 let timer=0,received=false,absoluteSeen=false;
 const receive=event=>{
  const pose=browserPose(event,window.screen?.orientation?.angle??window.orientation??0);
  if(!pose||absoluteSeen&&!pose.absolute)return;
  absoluteSeen||=pose.absolute;received=true;clearTimeout(timer);onPose(pose);
 };
 const listen=()=>{
  if(signal.aborted)return;
  window.addEventListener('deviceorientationabsolute',receive,{signal});
  window.addEventListener('deviceorientation',receive,{signal});
  timer=setTimeout(()=>{if(!received&&!signal.aborted)onError('no-data');},3000);
  signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
 };
 // Invoke the permission method in the original click, before any await.
 if(typeof Type.requestPermission==='function'){
  let answer;try{answer=Type.requestPermission();}catch{onError('restricted');return;}
  Promise.resolve(answer).then(value=>{if(!signal.aborted){if(value==='granted')listen();else onError('restricted');}},
   ()=>{if(!signal.aborted)onError('restricted');});
 }else listen();
}
async function nativeStream(signal,onPose,onError){
 try{
  const response=await fetch('/api/balcony/orientation',{method:'POST',headers:{'X-StarOrbit-Motion':'1'},signal,cache:'no-store'});
  if(!response.ok||!response.headers.get('Content-Type')?.includes('application/x-ndjson')||!response.body){onError('unavailable');return;}
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let remaining='';
  try{while(!signal.aborted){
   const {done,value}=await reader.read();if(done)break;remaining+=decoder.decode(value,{stream:true});
   let end;
   while((end=remaining.indexOf('\n'))>=0){
    const msg=JSON.parse(remaining.slice(0,end));remaining=remaining.slice(end+1);
    if(msg.error){onError(msg.error);return;}
    if([msg.yaw,msg.pitch,msg.roll].every(Number.isFinite))onPose({...msg,absolute:false,native:true});
   }
  }}finally{reader.releaseLock();}
  if(!signal.aborted)onError('no-data');
 }catch{if(!signal.aborted)onError('unavailable');}
}
export function startOrientation(signal,onPose,onError){
 if(isMacLocal())nativeStream(signal,onPose,onError);
 else browserStream(signal,onPose,onError);
}
