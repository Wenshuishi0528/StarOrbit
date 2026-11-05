import {t} from './i18n.js';
import {clockText} from './time-format.js';
import {SURVEY_TILES} from './survey-lab-math.js';
import {projectStar,decodeTycho} from './survey-sky-product-math.js';
import {tychoCutouts} from './survey-sky-product-tycho.js';

const hues=[[158,187,255],[191,214,255],[226,235,250],[255,237,210],[255,209,151]];
const hueForBV=bv=>bv===null?2:bv<.05?0:bv<.35?1:bv<.7?2:bv<1.15?3:4;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
function canvas(width,height=width){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
function stamp(hue){
  const size=32,card=canvas(size),ctx=card.getContext('2d'),colour=hues[hue].join(',');
  const glow=ctx.createRadialGradient(16,16,0,16,16,15.5);
  const core=hues[hue].map(value=>Math.round(value*.46+255*.54)).join(',');
  for(const [radius,tint,alpha] of [[0,core,1],[.26,core,.96],[.45,colour,.61],[.72,colour,.12],[1,colour,0]])glow.addColorStop(radius,`rgba(${tint},${alpha})`);
  ctx.fillStyle=glow;ctx.fillRect(0,0,size,size);return card;
}
export function createSkyPainter(geometry){
  const catalogs=new Map(),layers=new Map(),sprites=hues.map((_,i)=>stamp(i));
  function records(field){
    if(catalogs.has(field.id))return catalogs.get(field.id);
    const point=geometry.getAttribute('position'),mag=geometry.getAttribute('mag'),colour=geometry.getAttribute('color'),base=[];
    for(let i=0;i<point.count;i++){
      const p=projectStar(field,[point.getX(i),point.getY(i),point.getZ(i)]);if(!p)continue;
      const r=colour.getX(i),b=colour.getZ(i),hue=r<b*.75?0:b<r*.65?4:r>b*1.04?3:2;
      base.push({...p,magnitude:mag.getX(i),hue});
    }
    const faint=decodeTycho(tychoCutouts.fields[field.id]).map(s=>({...s,hue:hueForBV(s.bv)}));
    const record={base,deep:[...faint,...base].sort((a,b)=>b.magnitude-a.magnitude)};catalogs.set(field.id,record);return record;
  }
  function layer(field,mode,size,galaxy){
    const key=[field.id,mode,size,galaxy?.level||0].join('|');if(layers.has(key))return layers.get(key);
    const card=canvas(size),ctx=card.getContext('2d');ctx.fillStyle='#040a13';ctx.fillRect(0,0,size,size);
    if(mode==='galaxy'&&galaxy){ctx.globalCompositeOperation='screen';ctx.globalAlpha=.55;ctx.imageSmoothingEnabled=true;ctx.drawImage(galaxy.canvas,0,0,size,size);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
    const all=records(field),stars=mode==='catalog'?all.base:all.deep;
    ctx.globalCompositeOperation='screen';const scale=clamp((size/700)**.47,.43,1.45);
    for(const star of stars){
      const radius=Math.max(.57,scale*(.94+1.45*10**(-.155*(star.magnitude-6))));
      ctx.globalAlpha=clamp(.58+(10.8-star.magnitude)*.08,.46,1);
      const sx=star.x*size,sy=star.y*size;ctx.drawImage(sprites[star.hue],sx-radius,sy-radius,2*radius,2*radius);
      if(star.magnitude<4.7){ctx.globalAlpha=.27;ctx.drawImage(sprites[star.hue],sx-2.2*radius,sy-2.2*radius,4.4*radius,4.4*radius);}
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    if(layers.size>=4)layers.delete(layers.keys().next().value);layers.set(key,card);return card;
  }
  return {layer,records,clear(){layers.clear();catalogs.clear();}};
}

export function drawPlanner(canvas,layer,coverage,current,fraction){
  const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
  const ratio=Math.min(2,window.devicePixelRatio||1),w=Math.round(width*ratio),h=Math.round(height*ratio);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d'),side=Math.min(w,h),left=(w-side)/2,top=(h-side)/2;
  ctx.fillStyle='#06101b';ctx.fillRect(0,0,w,h);ctx.drawImage(layer,left,top,side,side);
  const half=side/2;
  for(let i=0;i<4;i++){
    const seen=coverage[i].count>0,active=current===i;
    ctx.fillStyle=seen?'rgba(74,171,157,.10)':active?`rgba(231,163,71,${.04+.17*fraction})`:'rgba(6,13,24,.16)';
    ctx.fillRect(left+(i%2)*half,top+Math.floor(i/2)*half,half,half);
  }
}
function fit(ctx,text,x,y,max,size,{colour='#d9e4ec',weight=400,align='left'}={}){
  ctx.textAlign=align;ctx.fillStyle=colour;ctx.font=`${weight} ${size}px system-ui,sans-serif`;
  while(size>12&&ctx.measureText(text).width>max){size--;ctx.font=`${weight} ${size}px system-ui,sans-serif`;}
  ctx.fillText(text,x,y,max);
}
const modeNames={catalog:'内置亮星表',dense:'高密星点',galaxy:'银河背景（源图 16K）'};
export {modeNames};
export const PRODUCT_WIDTH=1440,PRODUCT_SIDE=1320,PRODUCT_HEIGHT=1648;
export function makeSurveyPlate({field,coverage,epoch,mode,layer,galaxy}){
  const output=canvas(PRODUCT_WIDTH,PRODUCT_HEIGHT),ctx=output.getContext('2d'),left=60,top=132,side=PRODUCT_SIDE,half=side/2;
  const count=coverage.filter(x=>x.count).length;
  ctx.fillStyle='#09131f';ctx.fillRect(0,0,output.width,output.height);
  fit(ctx,t(field.name),left,68,850,43,{weight:650,colour:'#eff6f8'});
  fit(ctx,t('巡天模拟成片'),left,107,640,23,{colour:'#9eb8c8'});
  fit(ctx,t('已覆盖 {n}/4 格',{n:count}),output.width-left,82,480,30,{align:'right',colour:'#a4e2d5',weight:600});
  ctx.drawImage(layer,left,top,side,side);
  for(let i=0;i<4;i++){
    const x=left+i%2*half,y=top+Math.floor(i/2)*half;
    if(!coverage[i].count){
      ctx.save();ctx.beginPath();ctx.rect(x,y,half,half);ctx.clip();ctx.fillStyle='#111e2c';ctx.fillRect(x,y,half,half);
      ctx.strokeStyle='#1a2d3d';ctx.lineWidth=1;ctx.beginPath();for(let d=-half;d<half*2;d+=24){ctx.moveTo(x+d,y);ctx.lineTo(x+d-half,y+half);}ctx.stroke();
      fit(ctx,t('尚未曝光'),x+half/2,y+half/2,half-45,26,{colour:'#8ea9b8',align:'center'});ctx.restore();
      fit(ctx,SURVEY_TILES[i],x+34,y+41,35,22,{align:'center',colour:'#acc2d0',weight:600});
    }
  }
  ctx.strokeStyle='#405668';ctx.lineWidth=1;ctx.strokeRect(left+.5,top+.5,side-1,side-1);
  // Completed fields form one uninterrupted image; tile letters remain beside the exposure totals.
  const under=top+side;
  const geometry=`RA ${field.ra.toFixed(2)}°   Dec ${field.dec.toFixed(2)}°   ·   ${t('北上，东左')}   ·   6° × 6°`;
  fit(ctx,geometry,left,under+43,880,21);fit(ctx,mode==='galaxy'?t('银河背景与星点')+` · ${galaxy.level}K`:t(modeNames[mode]),output.width-left,under+43,400,23,{align:'right',colour:'#a2cfd2'});
  const amounts=coverage.map((tile,i)=>`${SURVEY_TILES[i]}  ${tile.count?tile.seconds+' s':t('尚未曝光')}`).join('     ·     ');
  fit(ctx,amounts,left,under+81,side,20,{colour:'#dbe5e9'});
  fit(ctx,t('本圈起点：{time} UTC+8',{time:clockText(epoch)}),left,under+116,side,19,{colour:'#99b0c1'});
  const credits=mode==='catalog'?'XHIP · d3-celestial':mode==='dense'?'XHIP · d3-celestial · Tycho-2 (Høg et al., 2000) / NASA HEASARC':
    'XHIP · Tycho-2 · NASA/Goddard SVS, Ernie Wright · Gaia DR2: ESA/Gaia/DPAC';
  fit(ctx,credits,left,under+150,side,16,{colour:'#8196a8'});
  return output;
}
