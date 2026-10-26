// Sky geometry uses the same J2000 equatorial frame as the star catalogue.
export function sphereHidesDirection(direction,center,radius){
 const along=direction[0]*center[0]+direction[1]*center[1]+direction[2]*center[2];
 return along>0&&center[0]**2+center[1]**2+center[2]**2-along*along<radius*radius;
}
export function placeSkyLabels(candidates,width,height,density,reserved=[]){
 const gap=4+(1-density)*9,limit=Math.round(18+density*78),cell=64,buckets=new Map(),placed=[];
 const cells=rect=>{const out=[];for(let x=Math.floor(rect.x/cell);x<=Math.floor((rect.x+rect.w)/cell);x++)for(let y=Math.floor(rect.y/cell);y<=Math.floor((rect.y+rect.h)/cell);y++)out.push(x+':'+y);return out;};
 const overlaps=(a,b)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
 for(const item of candidates){
  if(placed.length>=limit)break;
  const positions=item.centered?[[ -item.w/2,-item.h/2]]:[[8,-item.h/2],[-item.w-8,-item.h/2],[8,-item.h-7],[8,7]];
  for(const [dx,dy] of positions){
   const rect={x:item.x+dx,y:item.y+dy,w:item.w,h:item.h};
   if(rect.x<5||rect.y<5||rect.x+rect.w>width-5||rect.y+rect.h>height-5)continue;
   if(reserved.some(other=>overlaps(rect,other)))continue;
   const keys=cells({x:rect.x-gap,y:rect.y-gap,w:rect.w+gap*2,h:rect.h+gap*2});
   if(keys.some(key=>(buckets.get(key)||[]).some(other=>overlaps(rect,other))))continue;
   for(const key of keys){if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(rect);}
   placed.push({...item,dx,dy,rect});break;
  }
 }
 return placed;
}
