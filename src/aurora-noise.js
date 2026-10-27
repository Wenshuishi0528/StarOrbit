// Small periodic value-noise texture: generated once, then reused by all heights/hemispheres.
export function auroraNoise(){
 const width=128,height=64,data=new Uint8Array(width*height);
 const hash=(x,y)=>{let n=Math.imul(x+31,374761393)^Math.imul(y+71,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const noise=(u,v,nx,ny)=>{
  const x=u*nx,y=v*ny,ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,fx=a*a*(3-2*a),fy=b*b*(3-2*b);
  const at=(dx,dy)=>hash((ix+dx)%nx,(iy+dy)%ny),mix=(a,b,t)=>a+(b-a)*t;
  return mix(mix(at(0,0),at(1,0),fx),mix(at(0,1),at(1,1),fx),fy);
 };
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=Math.round(255*(.65*noise((x+.5)/width,(y+.5)/height,8,4)+.35*noise((x+.5)/width,(y+.5)/height,24,12)));
 return {data,width,height};
}
