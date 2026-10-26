// Geometry and period from the 1970 Xinhua communiqué. Orientation is a fixed
// visualization solution checked against the two Beijing viewing references.
export const DFH1_HISTORY=Object.freeze({
 perigeeKm:439,apogeeKm:2384,inclinationDeg:68.5,periodSeconds:114*60,
 epoch:Date.parse('1970-04-25T12:29:00Z'),cutoff:Date.parse('2000-01-01T00:00:00+08:00'),
 nodeLongitudeDeg:110,argumentDeg:185,meanAnomalyDeg:200,
 source:'https://www.xinhuanet.com/mil/2016-04/22/c_128920072.htm',
});
export const orbitSegment=(data,time)=>data?.missionId==='dfh1'&&time<DFH1_HISTORY.cutoff?'historical':'current';
export function historicalEllipse(radius,axes){
 const h=DFH1_HISTORY,r=Math.PI/180,O=h.nodeLongitudeDeg*r,w=h.argumentDeg*r,i=h.inclinationDeg*r;
 const a=radius+(h.perigeeKm+h.apogeeKm)/2,e=(h.apogeeKm-h.perigeeKm)/(2*a),c=Math.cos(O),s=Math.sin(O),cw=Math.cos(w),sw=Math.sin(w),ci=Math.cos(i),si=Math.sin(i);
 const transform=v=>axes[0].map((_,k)=>v.reduce((sum,n,j)=>sum+n*axes[j][k],0));
 return {epoch:h.epoch,a,b:a*Math.sqrt(1-e*e),e,n:2*Math.PI/h.periodSeconds,period:h.periodSeconds,periodMs:h.periodSeconds*1000,M:h.meanAnomalyDeg*r,
  x:transform([c*cw-s*sw*ci,s*cw+c*sw*ci,sw*si]),y:transform([-c*sw-s*cw*ci,-s*sw+c*cw*ci,cw*si])};
}
