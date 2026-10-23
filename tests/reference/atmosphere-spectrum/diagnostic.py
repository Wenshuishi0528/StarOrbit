# Read-only production-model diagnosis with bundled, attributed reference data.
import numpy as np, re, json, pathlib, time
ROOT=pathlib.Path(__file__).resolve().parents[3]
HERE=pathlib.Path(__file__).parent
reference=json.loads((pathlib.Path(__file__).parent/'bruneton-reference-data.json').read_text())
solar=np.array(reference['solar']);cross=np.array(reference['ozoneCrossSection']);cie=np.array(reference['cie1931'])
xyz_to_rgb=np.array([[3.2406,-1.5372,-.4986],[-.9689,1.8758,.0415],[.0557,-.2040,1.057]])
# Obtain current production geometry LUT in memory: no downloads or disk cache.
import subprocess
code="import {buildOpticalDepthTable} from './src/atmosphere-optics.js'; const t=buildOpticalDepthTable();console.log(JSON.stringify({...t,data:Array.from(t.data)}));"
raw=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT,text=True));tab=np.array(raw['data']).reshape(raw['height'],raw['width'],4)
R=6371.;A=6471.
def dep(h,mu):
 lo=-np.sqrt(np.maximum(0,1-(R/(R+h))**2));x=np.sqrt(np.clip((mu-lo)/(1-lo),0,1))*255;y=np.sqrt(np.clip(h/100,0,1))*127
 ix=np.minimum(254,x.astype(int));iy=np.minimum(126,y.astype(int)); a=(x-ix)[...,None];b=(y-iy)[...,None]
 return ((1-b)*((1-a)*tab[iy,ix,:3]+a*tab[iy,ix+1,:3])+b*((1-a)*tab[iy+1,ix,:3]+a*tab[iy+1,ix+1,:3]))
def visibility(h,mu):
 ratio=R/(R+h);lo=-np.sqrt(np.maximum(0,1-ratio**2));v=np.clip((mu-lo)/(.00465*ratio),-1,1)
 return (np.arccos(-v)+v*np.sqrt(np.maximum(0,1-v*v)))/np.pi

def coeff(wave):return 1.24062e-3*(wave/1000)**-4, np.interp(wave,np.arange(360,840,10),cross)*300*2.687e20/15000*1000

def ms_table(br,bo,directions=24,steps=20):
 out=np.zeros((24,32,len(br))); j=np.arange(directions);dz=1-2*(j+.5)/directions;dx=np.sqrt(1-dz*dz)*np.cos(j*2.399963229728653)
 u=np.arange(steps)/steps;v=(np.arange(steps)+1)/steps
 for yi in range(24):
  h=100*(yi/23)**2+.001;r=R+h;b=r*dz;ground=(b<0)&(b*b-r*r+R*R>0)
  end=-b+np.where(ground,-1,1)*np.sqrt(np.maximum(0,b*b-r*r+np.where(ground,R*R,A*A)));closest=np.clip(-b,0,end)
  ts=[];dss=[]
  for st,en,rev in [(np.zeros_like(end),closest,True),(closest,end,False)]:
   aa=1-(1-u)**2 if rev else u*u;zz=1-(1-v)**2 if rev else v*v
   ts.append(st[:,None]+(en-st)[:,None]*(aa+zz)/2);dss.append((en-st)[:,None]*(zz-aa))
  ts=np.concatenate(ts,axis=1);ds=np.maximum(0,np.concatenate(dss,axis=1));rho=np.sqrt(r*r+ts*ts+2*b[:,None]*ts);alt=np.maximum(0,rho-R)
  dr=np.exp(-alt/8);dm=np.exp(-alt/1.2);oz=np.maximum(0,1-np.abs(alt-25)/15)
  ext=dr[...,None]*br+dm[...,None]*.00444+oz[...,None]*bo;sc=dr[...,None]*br+dm[...,None]*.004
  delta=ext*ds[...,None];tr=np.exp(-delta);T=np.exp(-(np.cumsum(delta,axis=1)-delta));wt=T*(-np.expm1(-delta))/np.maximum(ext,1e-15)
  F=np.sum(wt*sc,axis=(0,1))/directions
  for xi in range(32):
   uu=2*xi/31-1;mu=np.sign(uu)*uu*uu;sx=np.sqrt(1-mu*mu);local=(ts*dx[:,None]*sx+(r+ts*dz[:,None])*mu)/rho
   depths=dep(alt,local);sun=np.exp(-depths[...,0,None]*br-depths[...,1,None]*.00444-depths[...,2,None]*bo)*visibility(alt,local)[...,None]
   L=np.sum(wt*sc*sun,axis=(0,1))/(4*np.pi*directions)
   gmu=(end*dx*sx+(r+end*dz)*mu)/R;gd=dep(np.zeros_like(gmu),gmu);gs=np.exp(-gd[:,0,None]*br-gd[:,1,None]*.00444-gd[:,2,None]*bo)*visibility(np.zeros_like(gmu),gmu)[:,None]
   L+=np.sum(np.exp(-np.sum(delta,axis=1))*.1*np.maximum(0,gmu)[:,None]*gs*ground[:,None],axis=0)/(np.pi*directions)
   out[yi,xi]=L/(1-F)
 return out

def mssample(mt,h,mu):
 x=(.5+.5*np.sign(mu)*np.sqrt(np.abs(mu)))*31;y=np.sqrt(np.clip(h/100,0,1))*23
 ix=np.minimum(30,x.astype(int));iy=np.minimum(22,y.astype(int));a=(x-ix)[:,None];b=(y-iy)[:,None]
 return (1-b)*((1-a)*mt[iy,ix]+a*mt[iy,ix+1])+b*((1-a)*mt[iy+1,ix]+a*mt[iy+1,ix+1])

def sunlight_depth_exact(h,mu,n=256):
 rr=R+h;b=rr*mu;end=-b+np.sqrt(np.maximum(0,b*b+A*A-rr*rr));closest=np.clip(-b,0,end);sums=np.zeros((len(h),3));u=np.arange(n)/n;v=(np.arange(n)+1)/n
 for st,en,rev in [(np.zeros_like(end),closest,True),(closest,end,False)]:
  aa=1-(1-u)**2 if rev else u*u;zz=1-(1-v)**2 if rev else v*v;t=st[:,None]+(en-st)[:,None]*(aa+zz)/2;ds=(en-st)[:,None]*(zz-aa)
  alt=np.maximum(0,np.sqrt(rr[:,None]**2+t*t+2*b[:,None]*t)-R)
  sums[:,0]+=(np.exp(-alt/8)*ds).sum(axis=1);sums[:,1]+=(np.exp(-alt/1.2)*ds).sum(axis=1);sums[:,2]+=(np.maximum(0,1-np.abs(alt-25)/15)*ds).sum(axis=1)
 return sums

def ray(h,br,bo,mt=None,n=2048,el=45,az=0):
 o=np.array([0.,0.,6771.]);ratio=(R+h)/6771;phi=np.deg2rad(az);d=np.array([ratio*np.cos(phi),ratio*np.sin(phi),-np.sqrt(1-ratio**2)]);s=np.array([np.cos(np.deg2rad(el)),0,np.sin(np.deg2rad(el))])
 b=o@d;disc=b*b-o@o+A*A;begin=-b-np.sqrt(disc);end=-b+np.sqrt(disc);t=begin+(np.arange(n)+.5)/n*(end-begin);ds=(end-begin)/n;p=o+t[:,None]*d;rr=np.linalg.norm(p,axis=1);hgt=rr-R;mu=(p@s)/rr
 dr=np.exp(-hgt/8);dm=np.exp(-hgt/1.2);oz=np.maximum(0,1-np.abs(hgt-25)/15); ext=dr[:,None]*br+dm[:,None]*.00444+oz[:,None]*bo
 delta=ext*ds;T=np.exp(-(np.cumsum(delta,axis=0)-delta));wt=T*(-np.expm1(-delta))/np.maximum(ext,1e-15)
 depths=sunlight_depth_exact(hgt,mu);sun=np.exp(-depths[:,0,None]*br-depths[:,1,None]*.00444-depths[:,2,None]*bo)*visibility(hgt,mu)[:,None]
 cs=d@s;pr=3/(16*np.pi)*(1+cs*cs);g=.76;pm=3/(8*np.pi)*(1-g*g)*(1+cs*cs)/((2+g*g)*(1+g*g-2*g*cs)**1.5)
 single=(wt*sun*(dr[:,None]*br*pr+dm[:,None]*.004*pm)).sum(axis=0)
 multiple=np.zeros_like(single) if mt is None else (wt*(dr[:,None]*br+dm[:,None]*.004)*mssample(mt,hgt,mu)).sum(axis=0)
 return single,multiple


if __name__=='__main__':
 w=np.arange(360,831,10);br,bo=coeff(w);cmf=np.array([np.interp(w,cie[:,0],cie[:,k]) for k in [1,2,3]]).T;weights=(cmf@xyz_to_rgb.T)*10*solar[:,None];weights/=weights.sum(axis=0)
 nodes=np.array([420,470,520,570,620,670]);basis=np.array([np.interp(w,nodes,np.eye(6)[j]) for j in range(6)]).T;projection=basis.T@weights
 br6,bo6=coeff(nodes);m48=ms_table(br,bo);m6=ms_table(br6,bo6)
 print('Six-node CIE/solar projection (rows wavelength, columns RGB):');print(projection)
 cases=[]
 for el in [45,-19]:
  for h in [.1,1,5,10]:
   a,m=ray(h,br,bo,m48,n=2048,el=el);b,mm=ray(h,br6,bo6,m6,n=2048,el=el)
   ref=(a+m)@weights;candidate=(b+mm)@projection;err=float(np.max(np.abs(candidate-ref))/max(ref.max(),.002))
   if el==45:assert candidate[2]>candidate[1]>candidate[0],(el,h,candidate)
   cases.append({'elevation':el,'tangentKm':h,'reference48':ref.tolist(),'six':candidate.tolist(),'normalizedError':err})
 assert np.max(abs(projection.sum(axis=0)-1))<1e-12
 print(json.dumps(cases,indent=2))
