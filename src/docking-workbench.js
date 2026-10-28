import {t} from './i18n.js';
import {DOCKING_LIMITS} from './docking-physics.js';

export const dockingCSS=`
.dock-panel{height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;color:#dce8f6;font-size:12px}
.dock-panel button,.dock-panel select{font-size:12px}.dock-panel button{min-height:32px;padding:6px 10px}.dock-panel button:disabled{opacity:.42;cursor:not-allowed}
.dock-panel [hidden]{display:none!important}.dock-panel button[aria-pressed=true]{background:#174e60;border-color:#76d7e5;color:#e4fcff}
.dock-session,.dock-toolbar,.dock-modes{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.dock-session{flex-shrink:0}.dock-session label,.dock-toolbar label{display:flex;align-items:center;gap:5px}.dock-session select{max-width:235px}.dock-session .dock-primary{background:#1d6573;border-color:#76d7e5}
.dock-session .dock-terminal{margin-left:auto;min-width:110px;font-size:12px;color:#9dd6e4}.dock-terminal[data-status=docked]{color:#a8f4ce}.dock-terminal[data-status=collision],.dock-terminal[data-status=corridor],.dock-terminal[data-status=lost]{color:#ffbd9a}
.dock-brief{margin:0;color:#96afc5;font-size:11px;line-height:1.45}.dock-workspace{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 364px;gap:10px}
.dock-stage{min-width:0;min-height:0;display:flex;flex-direction:column;gap:8px}.dock-toolbar{font-size:11px}.dock-toolbar button{font-size:11px;min-height:29px;padding:4px 8px}.dock-toolbar input[type=range]{width:65px;margin:0}.dock-toolbar label{font-size:11px}
.dock-viewport{min-height:170px;flex:1;position:relative;background:radial-gradient(ellipse at 50% 110%,#102c40,#020810 70%);border:1px solid #2b485c;border-radius:10px;overflow:hidden}.dock-viewport canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}.dock-viewport canvas:focus-visible{outline:2px solid #76d7e5;outline-offset:-3px}
.dock-hud{position:absolute;inset:0;pointer-events:none;font:11px/1.5 ui-monospace,monospace;color:#97e5ed}.dock-view-caption{position:absolute;left:12px;top:10px;background:#030b14b0;padding:4px 6px;border-radius:3px;max-width:55%}.dock-hud-numbers{position:absolute;right:12px;top:12px;text-align:right;color:#d8f7ff;white-space:pre-line;background:#030b14b0;padding:4px 6px;border-radius:3px}.dock-pause-caption{position:absolute;left:12px;bottom:10px;right:12px;color:#b6cadb;line-height:1.7;white-space:pre-line;background:#030b1490;padding:4px 6px;border-radius:3px}.dock-target{position:absolute;width:18px;height:18px;border:2px solid #ffd17b;border-radius:3px;transform:translate(-50%,-50%)}.dock-crosshair{position:absolute;left:50%;top:50%;width:70px;height:70px;transform:translate(-50%,-50%);border:1px solid #8fe6ee60;border-radius:50%}.dock-crosshair:before,.dock-crosshair:after{content:'';position:absolute;background:#8fe6ee80}.dock-crosshair:before{height:1px;width:100px;left:-15px;top:34px}.dock-crosshair:after{width:1px;height:100px;left:34px;top:-15px}
.dock-guidance{display:grid;grid-template-columns:1fr auto;gap:6px 12px;background:#102635;border:1px solid #2e5064;border-radius:8px;padding:9px 11px;flex-shrink:0}.dock-guidance strong{font-size:13px;color:#d7f5ff;line-height:1.6}.dock-guidance p{margin:3px 0 0;font-size:11px;line-height:1.5;color:#a8c2d4}.dock-guidance button{align-self:center}.dock-guidance .dock-warning{color:#f5c58a;grid-column:1/-1;margin:0}.dock-gate-checks{display:flex;flex-wrap:wrap;gap:4px 12px;grid-column:1/-1;font-size:10px;color:#b5c7d5}.dock-gate-checks span[data-pass=true]{color:#92d7bc}.dock-gate-checks span[data-pass=false]{color:#efbd83}
.dock-console{min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:9px;padding:1px 4px 2px 1px}.dock-box{background:#0c1927;border:1px solid #283f53;border-radius:8px;padding:10px}.dock-box h3,.dock-box summary{margin:0;color:#b8cfdf;font-size:12px;line-height:1.5}.dock-box summary{cursor:pointer}.dock-box>p{color:#8faabf;font-size:11px;line-height:1.6;margin:5px 0 0}
.dock-console>.dock-metrics{order:1}.dock-console>.dock-telemetry{order:2}.dock-console>.dock-manual{order:3}.dock-console>.dock-analysis{order:4}.dock-console>.dock-alignment{order:5}.dock-console>.dock-settings{order:6}.dock-console>*{flex-shrink:0}
.dock-console>.dock-gate-checks{order:1;padding:8px;border:1px solid #2b4257;border-radius:8px;line-height:1.6;background:#102233}
.dock-modes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.dock-modes button{padding:6px 2px;font-size:11px;overflow-wrap:anywhere}.dock-modes [data-mode=retreat]{border-color:#8e6745}.dock-mode-help{min-height:2.7em}
.dock-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.dock-metric{padding:8px 10px;background:#102233;border:1px solid #2b4257;border-radius:7px;min-width:0}.dock-metric small{display:block;font-size:10px;color:#9cb5c8;margin-bottom:5px}.dock-metric b{font:19px ui-monospace,monospace;color:#e3f6ff;white-space:nowrap;font-weight:500}.dock-metric em{font:10px ui-monospace,monospace;color:#8daabc;margin-left:4px}.dock-metric[data-alert=true]{border-color:#be8b53}.dock-metric[data-alert=true] b{color:#ffd19b}.dock-submetrics{display:grid;grid-template-columns:1fr 1fr;gap:7px;font:11px ui-monospace,monospace;color:#b7ccdd}.dock-submetrics span{display:block;color:#8ba6bd;font:10px/1.7 system-ui,sans-serif}
.dock-alignment{display:grid;grid-template-columns:118px minmax(0,1fr);gap:10px;align-items:center}.dock-alignment svg{width:118px;height:118px}.dock-vector{display:grid;grid-template-columns:1fr 1fr;gap:9px;font:12px ui-monospace,monospace}.dock-vector small{display:block;font:10px/1.7 system-ui,sans-serif;color:#91adbf}.dock-vector b{font-weight:500;white-space:nowrap}.dock-signed-help{grid-column:1/-1;font-size:10px;color:#87a1b7;line-height:1.5;margin:0}
.dock-control-head{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}.dock-control-head label{font-size:11px;display:flex;align-items:center;gap:4px}.dock-bottom{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dock-control-box h3{font-size:11px;margin:0 0 7px;line-height:1.5}.dock-thrusters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.dock-thrusters button{padding:5px 2px;font-size:10px;min-height:31px;touch-action:none;user-select:none;overflow-wrap:anywhere}.dock-thrusters .held{background:#286774;border-color:#a1ecf5}.dock-brake{grid-column:1/-1}.dock-attitude{font:10px/1.65 ui-monospace,monospace;color:#91a8be;margin:6px 0 0}.dock-settings p{font-size:11px;line-height:1.7;color:#96aec3;margin:8px 0 0}
.dock-analysis{border:1px solid #2b4257;border-radius:8px;background:#0a1623;flex-shrink:0}.dock-analysis-tabs{display:flex;gap:5px;padding:6px;border-bottom:1px solid #253b4d}.dock-analysis-tabs button{padding:4px 9px;min-height:27px;font-size:11px}.dock-analysis-body{height:145px;overflow:auto;padding:9px 11px}.dock-analysis svg{display:block;width:100%;height:110px}.dock-analysis .dock-chart-note{font-size:10px;margin:3px 0 0;color:#8ba8bc}.dock-chart-title{font-size:10px;fill:#8eafc4}.dock-review-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:8px}.dock-review-toolbar button{min-height:27px;font-size:11px;padding:4px 9px}.dock-review-toolbar label{font-size:11px;display:flex;gap:7px;align-items:center;flex:1}.dock-review-toolbar input[type=range]{min-width:80px;flex:1;margin:0}.dock-review-time{font:11px ui-monospace,monospace;white-space:nowrap}.dock-review-summary{font-size:11px;line-height:1.65;color:#b2cbdc}.dock-review-summary p{margin:3px 0}.dock-review-table{border-collapse:collapse;width:100%;font-size:11px;margin-top:8px}.dock-review-table th,.dock-review-table td{text-align:left;padding:5px;border-bottom:1px solid #223b4e}.dock-review-table th{color:#8faebf;font-weight:400}.dock-review-table td[data-pass=false]{color:#ffb88b}.dock-review-table td[data-pass=true]{color:#8edfc1}.dock-events{list-style:none;padding:0;margin:0;font-size:11px;line-height:1.7}.dock-events li{display:flex;gap:12px;border-bottom:1px solid #1c3040;padding:4px 0}.dock-events time{color:#74d3e0;font:11px/1.7 ui-monospace,monospace;min-width:55px}.dock-events span{color:#b5cbdc}.dock-empty{margin:15px 0;color:#8faabb;font-size:11px}
@media(max-width:1100px){.dock-workspace{grid-template-columns:minmax(0,1fr) 330px}.dock-toolbar label{font-size:10px}.dock-toolbar{gap:5px}.dock-session select{max-width:180px}.dock-guidance{padding:7px 9px}}
@media(max-height:780px) and (min-width:901px){.dock-brief{display:none}.dock-analysis-body{height:110px}.dock-analysis svg{height:78px}.dock-viewport{min-height:140px}.dock-panel{gap:6px}.dock-console{gap:6px}.dock-box{padding:8px}.dock-mode-help{min-height:0}.dock-submetrics{gap:4px}.dock-thrusters button{min-height:27px;padding:3px 2px}.dock-control-head{gap:4px;margin-bottom:5px;font-size:10px}.dock-control-box h3{margin-bottom:5px}.dock-metric{padding:6px 9px}}
@media(max-width:900px){.dock-workspace{grid-template-columns:1fr;grid-template-rows:minmax(250px,1fr) minmax(180px,1fr)}.dock-brief{display:none}.dock-stage{gap:6px;overflow:auto}.dock-viewport{min-height:120px;flex-shrink:0}.dock-analysis-body{height:140px}.dock-analysis svg{height:105px}.dock-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.dock-toolbar .dock-fov{display:none}.dock-control-box button{min-height:38px}.dock-guidance{padding:7px 9px}.dock-guidance strong{font-size:12px}.dock-session .dock-terminal{font-size:11px}}
@media(max-width:560px){.dock-session{gap:5px}.dock-session button{font-size:11px;padding:5px 7px;min-height:29px}.dock-session select{max-width:165px;font-size:11px;padding:5px}.dock-session .dock-terminal{margin-left:0;flex:1}.dock-session label{font-size:10px}.dock-toolbar{gap:4px}.dock-toolbar button{font-size:10px;padding:4px 6px}.dock-hud-numbers{top:auto;bottom:42px;font-size:10px}.dock-guidance p{font-size:10px}.dock-analysis-tabs{padding:4px}.dock-analysis-tabs button{font-size:10px;min-height:25px;padding:3px 7px}.dock-view-caption{font-size:10px}}
`;

const text=key=>`data-dock-text="${key}"`;
export const dockingMarkup=`
 <div class="dock-session">
  <label><span ${text('训练场景')}></span><select data-role="scenario"></select></label>
  <button type="button" class="dock-primary" data-role="start"></button>
  <button type="button" data-role="reset" ${text('重新开始')}></button>
  <button type="button" data-role="finish" ${text('结束并复盘')}></button>
  <label><span ${text('训练速度')}></span><select data-role="speed"><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option></select></label>
  <div class="dock-terminal" role="status" aria-live="polite"></div>
 </div>
 <p class="dock-brief" data-role="brief"></p>
 <div class="dock-workspace">
  <div class="dock-stage">
   <div class="dock-guidance"><div><strong data-role="phase"></strong><p data-role="guidance"></p></div><button type="button" data-role="go" ${text('确认放行 GO')}></button><div class="dock-gate-checks" data-role="gatechecks"></div><p class="dock-warning" data-role="warnings" hidden></p></div>
   <div class="dock-toolbar">
    <button type="button" data-view="external" ${text('外部视角')}></button><button type="button" data-view="onboard" ${text('对接相机')}></button><button type="button" data-role="fit" ${text('查看全貌')}></button>
    <label class="dock-fov"><span ${text('视场')}></span><input data-role="fov" type="range" min="12" max="75" value="40"><output data-role="fovValue">40°</output></label>
    <label><input type="checkbox" data-role="prediction" checked><span ${text('无推力预测')}></span></label>
    <label><input type="checkbox" data-role="marker" checked><span ${text('目标辅助标记')}></span></label>
   </div>
   <div class="dock-viewport"><div class="dock-hud"><div class="dock-view-caption"></div><div class="dock-hud-numbers"></div><div class="dock-crosshair" hidden></div><div class="dock-target" hidden></div><div class="dock-pause-caption"></div></div></div>
   <div class="dock-analysis">
    <div class="dock-analysis-tabs" role="tablist" data-role="analysis-tabs"><button type="button" data-analysis="trend" role="tab" aria-selected="true" ${text('接近曲线')}></button><button type="button" data-analysis="events" role="tab" aria-selected="false" tabindex="-1" ${text('事件记录')}></button><button type="button" data-analysis="review" role="tab" aria-selected="false" tabindex="-1" ${text('回放与报告')}></button></div>
    <div class="dock-analysis-body">
     <div data-analysis-panel="trend" role="tabpanel"><div data-role="trend"></div><p class="dock-chart-note" ${text('青线：轴向闭合速度 · 虚线：建议速度上限 · 横轴：训练时间')}></p></div>
     <div data-analysis-panel="events" role="tabpanel" hidden><ol class="dock-events" data-role="events"></ol></div>
     <div data-analysis-panel="review" role="tabpanel" hidden>
      <div class="dock-review-toolbar"><button type="button" data-role="replay"></button><button type="button" data-role="replay-play" hidden></button><button type="button" data-role="export-json">JSON</button><button type="button" data-role="export-csv">CSV</button></div>
      <div class="dock-review-toolbar" data-role="scrubber" hidden><label><span ${text('记录时间')}></span><input data-role="replay-time" type="range" min="0" max="0" step="1" value="0"></label><output class="dock-review-time" data-role="replay-value"></output></div>
      <div class="dock-review-summary" data-role="report"></div>
     </div>
    </div>
   </div>
  </div>
  <div class="dock-console">
   <div class="dock-box"><div class="dock-modes"><button type="button" data-mode="manual" ${text('人工控制')}></button><button type="button" data-mode="hold" ${text('保持位置')}></button><button type="button" data-mode="approach" ${text('辅助接近')}></button><button type="button" data-mode="retreat" ${text('主动撤离')}></button></div><p class="dock-mode-help" data-role="mode-help"></p></div>
   <div class="dock-metrics"><div class="dock-metric"><small ${text('接口轴向距离')}></small><b data-read="distance"></b><em>m</em></div><div class="dock-metric" data-role="closing-box"><small ${text('轴向闭合速度 · 正值接近')}></small><b data-read="closing"></b><em>m/s</em></div></div>
   <div class="dock-box dock-alignment"><div data-role="alignment"></div><div class="dock-vector"><div><small ${text('飞船偏右 / 偏左')}></small><b data-read="right"></b></div><div><small ${text('飞船偏上 / 偏下')}></small><b data-read="up"></b></div><div><small ${text('右向漂移速度')}></small><b data-read="right-velocity"></b></div><div><small ${text('上向漂移速度')}></small><b data-read="up-velocity"></b></div></div><p class="dock-signed-help" ${text('圆心是目标接口，点是飞船；正值向右 / 向上。坐标固定在目标上，转动飞船后推力方向会改变。')}></p></div>
   <div class="dock-box dock-telemetry"><div class="dock-submetrics"><div><span ${text('姿态夹角 / 合成角速率')}></span><b data-read="angle"></b></div><div><span ${text('横向偏差 / 横向速度')}></span><b data-read="lateral"></b></div><div><span ${text('累计平移 Δv')}></span><b data-read="deltaV"></b></div><div><span ${text('训练时间')}></span><b data-read="time"></b></div></div><div class="dock-attitude" data-role="attitude"></div></div>
   <div class="dock-box dock-manual">
    <div class="dock-control-head"><label><input type="checkbox" data-role="fine"><span ${text('精细推力')}></span></label><label><input type="checkbox" data-role="damping" checked><span ${text('角速率阻尼')}></span></label><span ${text('仅用于人工控制')}></span></div>
    <div class="dock-bottom"><div class="dock-control-box"><h3 ${text('机体系平移 · 按住施力')}></h3><div class="dock-thrusters" data-controls="translation"></div></div><div class="dock-control-box"><h3 ${text('姿态角速率 · 按住控制')}></h3><div class="dock-thrusters" data-controls="rotation"></div></div></div>
    <p data-role="thrust"></p>
   </div>
   <details class="dock-box dock-settings"><summary ${text('训练规则与模型说明')}></summary>
    <p ${text('先选场景，再选人工或辅助接近，按开始。辅助接近在 30 m 与 5 m 停靠点减速稳定，检查就绪后按 GO；任何手动推力会接管为人工模式。')}></p>
    <p ${text('暂停会冻结时间；保持位置会消耗推力抑制漂移；撤离会沿接口外侧退开。松开平移键仍有惯性，Space 按住相对制动。')}></p>
    <p ${text('开启角速率阻尼时，松开姿态键会逐渐停止转动；关闭后保留角速率。相机固定在机体上，金框仅是已知目标位置的辅助标记。')}></p>
    <p ${text('无推力预测：未来 60 秒 HCW 自由漂移，不含后续控制、碰撞或捕获。蓝色细线是已经飞过的轨迹。')}></p>
    <p ${text('400 km 圆参考轨道的 HCW 相对运动、四元数姿态与受限角速率控制。使用理想导航与简化接口接触，不模拟传感器、接触机构或完整刚体动力学。门限是教学设置，并非神舟真实飞行参数。')}></p>
    <p ${text('记录保存在本次打开的训练台内，重新开始会替换当前记录；需要保留时先导出 JSON 或 CSV。回放只读取记录，不改变实时状态。')}></p>
   </details>
  </div>
 </div>`;

export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const signed=(value,digits=2)=>(value>=0?'+':'')+value.toFixed(digits);

export function alignmentSVG(m){
 const radius=Math.max(.5,m.lateralOffset*1.35),scale=43/radius,x=59+m.right*scale,y=59-m.up*scale;
 const bound=Math.min(43,DOCKING_LIMITS.captureLateral*scale);
 return `<svg viewBox="0 0 118 118" role="img" aria-label="${escapeHTML(t('目标接口坐标中的飞船横向位置'))}"><circle cx="59" cy="59" r="44" fill="#081420" stroke="#35536a"/><path d="M15 59H103M59 15V103" stroke="#284257"/><circle cx="59" cy="59" r="${bound.toFixed(2)}" fill="#396b6020" stroke="#70bea188" stroke-dasharray="3 3"/><path d="M54 59h10M59 54v10" stroke="#f7c579"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.5" fill="#91edfb"/><text x="59" y="114" text-anchor="middle" font-size="9" fill="#8daebf">±${radius.toFixed(1)} m</text><text x="107" y="62" fill="#8daebf" font-size="9">Y</text><text x="56" y="10" fill="#8daebf" font-size="9">Z</text></svg>`;
}

export function trendSVG(samples,currentTime){
 const rows=samples.length?samples:[],w=620,h=100,pad=32,left=rows[0]?.time||0,right=Math.max(left+1,rows.at(-1)?.time||0);
 // Keep each bucket's extrema, not every Nth point: short burns and retreat
 // reversals must survive downsampling. First/last + 149 pairs <= 300 points.
 let points=rows;
 if(rows.length>300){
  points=[rows[0]];const bucketSize=Math.ceil((rows.length-2)/149);
  for(let start=1;start<rows.length-1;start+=bucketSize){
   const end=Math.min(rows.length-1,start+bucketSize);let min=start,max=start;
   for(let i=start+1;i<end;i++){if(rows[i].instruments.axialClosing<rows[min].instruments.axialClosing)min=i;if(rows[i].instruments.axialClosing>rows[max].instruments.axialClosing)max=i;}
   for(const index of [...new Set([min,max])].sort((a,b)=>a-b))points.push(rows[index]);
  }
  points.push(rows.at(-1));
 }
 const speedLimit=p=>p.context?.speedLimit??p.instruments.recommendedClosing;
 const low=Math.min(0,...rows.map(p=>p.instruments.axialClosing)),high=Math.max(.06,...rows.map(p=>Math.max(p.instruments.axialClosing,speedLimit(p))))*1.15;
 const x=time=>pad+(time-left)/(right-left)*(w-pad-12),y=v=>8+(high-v)/(high-low)*62;
 const path=get=>points.map((p,i)=>(i?'L':'M')+x(p.time).toFixed(1)+','+y(get(p)).toFixed(1)).join(' ');
 return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${escapeHTML(t('轴向闭合速度随训练时间变化'))}"><path d="M${pad} 8V72H608" fill="none" stroke="#31495c"/><path d="M${pad} ${y(0)}H608" stroke="#233c50"/><text x="1" y="13" class="dock-chart-title">${high.toFixed(2)}</text><text x="1" y="72" class="dock-chart-title">${low.toFixed(2)}</text><path d="${path(speedLimit)}" fill="none" stroke="#d5a960" stroke-width="1" stroke-dasharray="5 4"/><path d="${path(p=>p.instruments.axialClosing)}" fill="none" stroke="#83e1ed" stroke-width="1.6"/><path d="M${x(Math.min(right,Math.max(left,currentTime)))} 8V72" stroke="#9cd7e66e"/><text x="${pad}" y="91" class="dock-chart-title">${left.toFixed(0)} s</text><text x="608" y="91" text-anchor="end" class="dock-chart-title">${right.toFixed(0)} s</text></svg>`;
}

export function captureRows(metrics){
 if(!metrics)return [];
 const limits=DOCKING_LIMITS;
 return [
  ['接口距离',metrics.distance,limits.captureDistance,'m','distance'],
  ['横向偏差',metrics.lateral,limits.captureLateral,'m','lateral'],
  ['相对速度',metrics.speed,limits.captureSpeed,'m/s','speed'],
  ['轴向闭合速度',metrics.axialClosing,limits.captureAxialClosing,'m/s','axialClosing'],
  ['横向速度',metrics.lateralSpeed,limits.captureLateralSpeed,'m/s','lateralSpeed'],
  ['姿态误差',metrics.angle,limits.captureAngle,'°','angle'],
  ['合成角速率',metrics.angularSpeed*180/Math.PI,limits.captureAngularSpeed*180/Math.PI,'°/s','angularSpeed'],
 ].map(([key,value,limit,unit,check])=>({key,value,limit,unit,min:check==='axialClosing'?0:null,pass:metrics.captureChecks?.[check]??(value<limit&&(check!=='axialClosing'||value>=0))}));
}

export function reportHTML(summary,violations=0){
 const esc=escapeHTML,m=summary.contactMetrics;
 const rows=captureRows(m).map(row=>`<tr><td>${esc(t(row.key))}</td><td data-pass="${row.pass}">${row.value.toFixed(3)} ${row.unit}</td><td>${row.min===0?'0 ≤ v ':''}&lt; ${row.limit.toFixed(3)} ${row.unit}</td><td>${esc(t(row.pass?'通过':'未通过'))}</td></tr>`).join('');
 return `<p>${esc(t('本次训练：{time} s · 累计平移 Δv {dv} m/s',{time:summary.duration.toFixed(1),dv:summary.deltaV.toFixed(3)}))}</p><p>${esc(t('最高闭合速度 {speed} m/s · 超过建议速度 {time} s',{speed:summary.maxClosing.toFixed(3),time:summary.timeAboveSpeedLimit.toFixed(1)}))}</p><p>${esc(t('建议速度统计容差 ±{value} m/s',{value:DOCKING_LIMITS.speedTolerance.toFixed(3)}))}</p><p>${esc(t('未放行越过停靠点：{count} 次',{count:violations}))}</p>${m?`<p>${esc(t('接触前瞬间的捕获检查'))}</p><table class="dock-review-table"><thead><tr><th>${esc(t('检查项'))}</th><th>${esc(t('实测'))}</th><th>${esc(t('教学门限'))}</th><th>${esc(t('结果'))}</th></tr></thead><tbody>${rows}</tbody></table>`:`<p>${esc(t('尚未接触目标接口；曲线与事件保留实际操作过程。'))}</p>`}<p>${esc(t('保留 {samples} 个采样 · {events} 条事件',{samples:summary.sampleCount,events:summary.eventCount}))}${summary.droppedSamples?' · '+esc(t('较早轨迹已移出记录，汇总仍覆盖全程')):''}</p>`;
}
