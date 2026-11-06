import {t} from './i18n.js';

export function paintSolarPhotoCaption(canvas,record,simulationTime){
 if(!record)return;
 const ctx=canvas.getContext('2d'),scale=Math.max(.7,canvas.width/1400),font=15*scale,pad=13*scale;
 const band=record.channel==='hmi'?'HMI · 6173 Å':'AIA · '+record.channel.replace('aia','')+' Å';
 const stamp=value=>new Date(value).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');
 const rows=[`NASA/SDO · ${band} · `+t('观测 {time}',{time:stamp(record.observedAt)}),
  t('模拟 {time}',{time:stamp(simulationTime)})+' · '+t(record.channel==='hmi'?'光球观测影像':'极紫外伪彩观测影像')];
 ctx.save();ctx.font=`${font}px system-ui, sans-serif`;ctx.textBaseline='bottom';
 const width=Math.min(canvas.width,Math.max(...rows.map(row=>ctx.measureText(row).width))+pad*2),height=font*2.8+pad;
 ctx.fillStyle='rgba(3,10,19,.84)';ctx.fillRect(0,canvas.height-height,width,height);
 ctx.fillStyle='#dce9f1';rows.forEach((row,i)=>ctx.fillText(row,pad,canvas.height-pad-font*(1-i)*1.4,canvas.width-pad*2));ctx.restore();
}
