// Each flight carries its own assembly, orbital seed, and checkpoint. Starting
// another trip cannot overwrite the one the player just left.
const prefix='starorbit-free-flight-v1:';
const volatile=new Map();
const copy=value=>JSON.parse(JSON.stringify(value));

export function saveFlight(record){
 const value=copy({...record,savedAt:Date.now()});
 volatile.set(value.id,value);
 try{localStorage.setItem(prefix+value.id,JSON.stringify(value));return true;}
 catch{return false;}
}
export function readFlight(id){
 let disk=null;
 try{disk=JSON.parse(localStorage.getItem(prefix+id));}catch{}
 const ram=volatile.get(id);
 if(ram&&(!disk||ram.savedAt>=disk.savedAt))return copy(ram);
 return disk;
}
export function savedFlights(){
 const keys=new Set(volatile.keys());
 try{
  for(let i=0;i<localStorage.length;i++){
   const key=localStorage.key(i);
   if(key?.startsWith(prefix))keys.add(key.slice(prefix.length));
  }
 }catch{}
 return [...keys].map(readFlight).filter(row=>row?.format===1&&typeof row.id==='string'&&Number.isFinite(row.savedAt)&&Number.isFinite(new Date(row.savedAt).getTime()))
  .sort((a,b)=>b.savedAt-a.savedAt);
}
