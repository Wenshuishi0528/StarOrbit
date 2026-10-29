// Reported geometry plus a minute-resolution historical reconstruction, NOT a
// recovered TLE. Launch-plane prior and Apr 25/26/29 newspaper times constrain
// orientation/phase; Apr 27/30 and May 1/2 are checks. See docs/v0.78-details.md.
export const DFH1_HISTORY=Object.freeze({
 perigeeKm:439,apogeeKm:2384,inclinationDeg:68.5,periodSeconds:114*60,
 epoch:Date.parse('1970-04-25T12:29:00Z'),cutoff:Date.parse('2000-01-01T00:00:00+08:00'),
 // Node longitude is relative to the Earth-fixed axes at epoch, not J2000 RAAN.
 nodeLongitudeDeg:314.175778843,argumentDeg:195.736019111,meanAnomalyDeg:314.511293882,
 // The communiqué's integer-minute period cannot resolve accumulated phase.
 // This fitted mean-anomaly period still rounds to 114 min; it is empirical.
 reconstructedPeriodSeconds:6844.602828727,
 source:'https://www.rmrb.zhouenlai.info/人民日报（1946-2003）/1970/04/1970-04-26.htm#0396211',
});
export const orbitSegment=(data,time)=>data?.missionId==='dfh1'&&time<DFH1_HISTORY.cutoff?'historical':'current';
export function historicalEllipse(radius,axes,time=DFH1_HISTORY.epoch){
 const h=DFH1_HISTORY,r=Math.PI/180,i=h.inclinationDeg*r,ci=Math.cos(i),si=Math.sin(i);
 const a=radius+(h.perigeeKm+h.apogeeKm)/2,e=(h.apogeeKm-h.perigeeKm)/(2*a),period=h.reconstructedPeriodSeconds,n=2*Math.PI/period;
 // First-order J2 secular plane/perigee drift only. The fitted phase rate is
 // independent; no claim of a full dynamical solution or decades of accuracy.
 const f=1.08262668e-3*(6378.137/(a*(1-e*e)))**2,nodeRate=-1.5*f*n*ci,argumentRate=.75*f*n*(5*ci*ci-1),dt=(time-h.epoch)/1000;
 const advance=rate=>(dt%(2*Math.PI/Math.abs(rate)))*rate;
 const O=h.nodeLongitudeDeg*r+advance(nodeRate),w=h.argumentDeg*r+advance(argumentRate),c=Math.cos(O),s=Math.sin(O),cw=Math.cos(w),sw=Math.sin(w);
 const transform=v=>axes[0].map((_,k)=>v.reduce((sum,n,j)=>sum+n*axes[j][k],0));
 const normal=transform([s*si,-c*si,ci]);
 return {epoch:h.epoch,a,b:a*Math.sqrt(1-e*e),e,n,period,periodMs:period*1000,M:h.meanAnomalyDeg*r,
  angularVelocity:normal.map((v,k)=>argumentRate*v+nodeRate*axes[2][k]),
  x:transform([c*cw-s*sw*ci,s*cw+c*sw*ci,sw*si]),y:transform([-c*sw-s*cw*ci,-s*sw+c*cw*ci,cw*si])};
}
