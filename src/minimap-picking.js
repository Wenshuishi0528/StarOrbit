// Pick the nearest visible ground-track segment, including wrapped date-line copies.
export function nearestTrackTime(points,x,y,width,height,preferredTime){
 if(points.length<2||width<=0||height<=0)return null;
 let best=null;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];let ax=(a[1]+180)/360*width,bx=(b[1]+180)/360*width;
  const ay=(90-a[2])/180*height,by=(90-b[2])/180*height;
  if(bx-ax>width/2)bx-=width;else if(bx-ax<-width/2)bx+=width;
  for(const shift of [-width,0,width]){
   const sx=ax+shift,dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;
   const f=l?Math.max(0,Math.min(1,((x-sx)*dx+(y-ay)*dy)/l)):0;
   const distance=Math.hypot(x-sx-f*dx,y-ay-f*dy),time=a[0]+f*(b[0]-a[0]);
   if(!best||distance<best.distance-.1||(Math.abs(distance-best.distance)<=.1&&Math.abs(time-preferredTime)<Math.abs(best.time-preferredTime)))best={time,distance};
  }
 }
 return best;
}
