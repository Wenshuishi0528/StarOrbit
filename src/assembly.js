import {Matrix4} from 'three';

export const PORT_KEYS=['TH_WENTIAN','TH_MENGTIAN','TH_FORWARD','TH_LOWER','TH_AFT'];
export const MODULE_TYPES=['TH','WT','MT','TZ','SZ','XT'];
const matrix=rows=>new Matrix4().set(...rows.flat());
const portId=(coreId,port)=>coreId==='TH'?port:`${coreId}/${port}`;

// Paths identify instances, not spacecraft types. A child core consumes its aft
// port and exposes four node ports; only reachable branches survive normalization.
export function describeAssembly(input={}){
 if(!input||typeof input!=='object')input={};
 const root={id:'TH',type:'TH',number:1,parentId:null};
 const cores=[root],instances=[root],ports=[],slots={},byId=new Map([['TH',root]]);
 for(let index=0;index<cores.length;index++){
  const core=cores[index];
  for(const port of PORT_KEYS){
   if(core.parentId&&port==='TH_AFT')continue;
   const id=portId(core.id,port),value=Object.hasOwn(input,id)?input[id]:'';
   const type=MODULE_TYPES.includes(value)?value:'';
   const row={id,coreId:core.id,port};ports.push(row);slots[id]=type;
   if(!type)continue;
   const instance={id,type,parentId:core.id,hostPort:port};
   if(type==='TH'){instance.number=cores.length+1;cores.push(instance);}
   instances.push(instance);byId.set(id,instance);
  }
 }
 return {cores,instances,ports,slots,byId};
}

export function replaceAttachment(input,id,type){
 const current=describeAssembly(input);
 if(!current.ports.some(p=>p.id===id))return current.slots;
 if(!MODULE_TYPES.includes(type))type='';
 if(current.slots[id]===type)return current.slots;
 const next={...current.slots,[id]:type};
 for(const key of Object.keys(next))if(key.startsWith(`${id}/`))delete next[key];
 return describeAssembly(next).slots;
}

export function attachmentPort(meta,type){
 const ports=meta.modules[type].ports;
 return matrix(ports[type==='TH'?'TH_AFT':Object.keys(ports)[0]]);
}

export function matingTransforms(meta){
 const home={WT:'TH_WENTIAN',MT:'TH_MENGTIAN',SZ:'TH_FORWARD',TZ:'TH_AFT'},result={};
 for(const type of MODULE_TYPES){
  if(home[type]){
   const host=matrix(meta.modules.TH.matrix).multiply(matrix(meta.modules.TH.ports[home[type]]));
   result[type]=host.invert().multiply(matrix(meta.modules[type].matrix)).multiply(attachmentPort(meta,type));
  }else{
   // Preserve the existing docking separation and connector clocking. Xuntian
   // retains its earlier convention; Tianhe uses the common aft-port convention.
   result[type]=new Matrix4().makeTranslation(0,0,6)
    .multiply(type==='XT'?new Matrix4().makeRotationX(Math.PI):new Matrix4().makeRotationY(Math.PI));
  }
 }
 return result;
}

export function placementMatrices(meta,assembly,mating=matingTransforms(meta)){
 const placements=new Map([['TH',matrix(meta.modules.TH.matrix)]]);
 for(const instance of assembly.instances){
  if(!instance.parentId)continue;
  placements.set(instance.id,placements.get(instance.parentId).clone()
   .multiply(matrix(meta.modules.TH.ports[instance.hostPort]))
   .multiply(mating[instance.type])
   .multiply(attachmentPort(meta,instance.type).invert()));
 }
 return placements;
}
