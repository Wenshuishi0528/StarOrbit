export const surveyStyle=`
.survey-live-launch{padding:0 8px 8px}.survey-live-launch button{border-color:#967447;color:#f0cc95}
.survey-live-wall{margin:12px 0;padding:13px 15px;background:#0b1a29;border:1px solid #354c5a;border-radius:9px}
.survey-live-head,.survey-live-info,.survey-live-footer{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.survey-live-head h4{font-size:15px;margin:0}.survey-live-head select,.survey-live-info button{margin-left:auto}
.survey-live-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.survey-live-card{min-width:0;border:1px solid #334958;border-radius:7px;background:#102132;padding:7px;overflow:hidden}
.survey-live-card .survey-live-picture{padding:0;width:100%;aspect-ratio:8/5;display:grid;place-items:center;overflow:hidden;border-radius:3px;background:repeating-linear-gradient(132deg,#0a1723,#0a1723 12px,#152738 13px,#0a1723 14px);color:#a3b6bf;font-size:11px}
.survey-live-picture:disabled{opacity:1}.survey-live-picture img{width:100%;height:100%;object-fit:contain;background:#000}.survey-live-picture [hidden]{display:none!important}
.survey-live-info{margin-top:5px}.survey-live-info strong{color:#ecc38c}.survey-live-card time,.survey-live-card small{display:block;font-size:11px;color:#b0c5cd;margin-top:3px}
.survey-live-card select{max-width:100%;margin-top:4px;font-size:11px}.survey-live-footer{margin-top:9px;font-size:11px}
.survey-live-dialog{border:1px solid #446273;border-radius:9px;color:#deedf0;background:#0b1724;max-width:94vw;max-height:90dvh;padding:10px}
.survey-live-dialog::backdrop{background:#020813cc}.survey-live-dialog img{display:block;max-width:100%;max-height:74dvh;object-fit:contain;margin-top:8px}
@media(max-width:550px){.survey-live-wall{padding:9px}.survey-live-head select{font-size:11px}.survey-live-card{padding:4px}.survey-live-info button{font-size:10px;padding:3px 5px}.survey-live-card time,.survey-live-card small{font-size:9px;overflow-wrap:anywhere}}

.survey-lab{display:grid;gap:12px;color:#ddebf4;font:13px/1.45 system-ui,sans-serif}
.survey-lab [hidden]{display:none!important}.survey-lab h3,.survey-lab h4,.survey-lab p{margin:0}.survey-lab h3{font-size:16px}.survey-lab h4{font-size:13px}
.survey-lab button,.survey-lab select,.survey-lab input{font:inherit;color:inherit}.survey-lab button{border:1px solid #35566a;background:#152b3d;padding:6px 10px;border-radius:6px;cursor:pointer}
.survey-lab button:disabled,.survey-lab select:disabled,.survey-lab input:disabled{opacity:.52;cursor:default}
.survey-lab button:focus-visible,.survey-lab input:focus-visible,.survey-lab select:focus-visible{outline:2px solid #9beee6;outline-offset:2px}
.survey-lab .survey-primary{background:#145052;border-color:#6cbbbb;color:#e0fffa}
.survey-head,.survey-toolbar,.survey-clock,.survey-viewhead,.survey-edithead,.survey-tools{display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap}.survey-head{justify-content:space-between}
.survey-toolbar{gap:6px}.survey-toolbar label{display:flex;gap:5px;align-items:center}.survey-head p,.survey-note,.survey-viewhead small,.survey-readout small{color:#a6bccc}
.survey-views{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:12px}
.survey-card,.survey-edit,.survey-rules{min-width:0;border:1px solid #2d475c;border-radius:10px;background:#0c1c2b;padding:11px}
.survey-viewhead,.survey-edithead{justify-content:space-between;margin-bottom:7px;min-height:30px}
.survey-viewhead select{max-width:65%}.survey-viewhead small{font-variant-numeric:tabular-nums}
.survey-viewstage,.survey-mosaic{position:relative;height:clamp(165px,21vh,255px);border-radius:6px;overflow:hidden;background:radial-gradient(ellipse at 52% 92%,#1b3240 0%,#0e1d2e 55%,#050c16 95%)}
.survey-viewstage canvas,.survey-mosaic canvas{display:block;width:100%;height:100%}
.survey-stage-phase{position:absolute;left:8px;bottom:7px;background:#07131edb;color:#a4edf0;border-radius:4px;padding:3px 7px;pointer-events:none;font-size:12px}
.survey-tilegrid{position:absolute;inset:0;margin:auto;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.survey-lab .survey-tile{min-height:0;padding:6px;display:flex;align-items:flex-start;justify-content:space-between;border:1px solid #33526390;border-radius:0;background:transparent;color:#b2c5d2;font:12px/1.4 ui-monospace,monospace}
.survey-lab .survey-tile[data-selected=true]{outline:1px solid #a8dbe2;outline-offset:-2px}.survey-lab .survey-tile[data-state=exposure]{color:#f5cf89;border-color:#f5cf89}.survey-lab .survey-tile[data-state=covered]{color:#9ef2c7;border-color:#489a7e}
.survey-readout{display:flex;justify-content:space-between;gap:8px;margin-top:7px;flex-wrap:wrap;font-size:12px}
.survey-clock{border-top:1px solid #294054;padding-top:8px}.survey-clock output{font:600 16px ui-monospace,monospace;color:#baf4e9}.survey-clock input[type=range]{flex:1 0 120px;max-width:none;margin:0;padding:0;accent-color:#6ecac3}
.survey-tools{gap:5px}.survey-note{font-size:12px;margin-bottom:7px!important}.survey-rows{display:grid;gap:6px}
.survey-job{display:grid;grid-template-columns:minmax(250px,.72fr) minmax(0,1.3fr);align-items:center;gap:0 12px;border:1px solid #294054;border-radius:6px;padding:6px 8px}
.survey-job[data-selected=true]{border-color:#59848e}.survey-job[data-disabled=true]{opacity:.65}
.survey-fields{display:grid;grid-template-columns:24px minmax(64px,1.4fr) 41px minmax(44px,.57fr) minmax(53px,.65fr);gap:4px;align-items:center}
.survey-job input:not([type=checkbox]),.survey-job select{width:100%;min-width:0;min-height:30px;padding:3px!important;font-size:12px}
.survey-job input[type=checkbox]{width:18px;height:18px;accent-color:#80d3c9}.survey-time{display:flex;flex-direction:column;gap:0}
.survey-track{position:relative;height:29px;touch-action:none;border:1px solid #314759;border-radius:5px;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(25% - 1px),#334351 calc(25% - 1px),#334351 25%),#172433;cursor:crosshair;overflow:hidden}
.survey-window{position:absolute;top:2px;bottom:2px;background:#24544f;pointer-events:none}
.survey-lab .survey-block{position:absolute;z-index:1;top:3px;bottom:3px;padding:0;min-width:12px;border:1px solid #c4ffed;border-radius:3px;touch-action:none;cursor:ew-resize;background:#79c5b4;color:#061a23;font:bold 10px ui-monospace,monospace}
.survey-lab .survey-block[data-error=true]{background:#e6a67e;border-color:#ffd8a8}.survey-cursor{pointer-events:none;position:absolute;top:0;bottom:0;width:1px;background:#e5efff}
.survey-rowstatus{font-size:11px;line-height:1.45;color:#a5cec9;font-variant-numeric:tabular-nums;margin-top:2px}.survey-job[data-error=true] .survey-rowstatus,.survey-planmsg[data-error=true]{color:#ffc2a5}
.survey-axis{display:grid;grid-template-columns:minmax(250px,.72fr) minmax(0,1.3fr);gap:12px;padding:0 8px}
.survey-columns{color:#91a9ba;font-size:10px;line-height:1.2}.survey-ticks{align-items:end;display:flex;justify-content:space-between;color:#90aabc;font:10px ui-monospace,monospace}.survey-planmsg{font-size:12px;color:#b2e2ce;margin-top:7px!important}
.survey-rules{padding:8px 11px;color:#afc2d1;font-size:12px}.survey-rules summary{color:#d2e4ec;cursor:pointer}.survey-rules p{margin-top:6px}
@media(max-width:820px){.survey-job,.survey-axis{grid-template-columns:minmax(205px,.88fr) minmax(0,1fr)}}
@media(max-width:640px){.survey-views{grid-template-columns:1fr 1fr;gap:6px}.survey-card,.survey-edit{padding:7px}.survey-lab{gap:8px}.survey-viewstage,.survey-mosaic{height:145px}.survey-viewhead{display:grid;gap:3px;align-content:start;min-height:48px}.survey-viewhead select{max-width:100%;padding:2px!important}.survey-clock{gap:6px}.survey-job{grid-template-columns:1fr;padding:6px;gap:4px}.survey-axis{display:block}.survey-axis .survey-columns{display:none}.survey-fields{grid-template-columns:24px minmax(60px,1.5fr) 44px minmax(51px,.6fr) minmax(56px,.7fr)}.survey-stage-phase{font-size:10px}.survey-readout{font-size:10px}.survey-head{align-items:flex-start}.survey-tools button{font-size:12px}.survey-toolbar label{font-size:11px}}
@media(max-width:360px){.survey-views{grid-template-columns:1fr}.survey-viewhead{display:flex;min-height:25px}.survey-viewstage,.survey-mosaic{height:150px}}
.survey-work{display:grid;grid-template-columns:minmax(270px,.83fr) minmax(0,1.65fr);gap:12px;align-items:start}
.survey-work>*{min-width:0}.survey-map-host{align-self:stretch;container-type:inline-size}.survey-views{align-items:start}
.survey-field-tip{margin-top:7px!important}.survey-work{scroll-margin:8px}
.survey-example-note{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}
@container (max-width:590px){.survey-map-host .survey-ov-work{grid-template-columns:minmax(0,1fr);gap:8px}.survey-map-host .survey-ov-side{display:flex;flex-flow:row wrap;justify-content:flex-start;align-items:center}.survey-map-host .survey-ov-side h5{width:100%}.survey-map-host .survey-ov-canvas{height:clamp(220px,27vh,290px)}}
.survey-work .survey-axis,.survey-work .survey-job{grid-template-columns:minmax(200px,.85fr) minmax(0,1.15fr)}.survey-work .survey-note{line-height:1.5}
.survey-views .survey-mosaic{height:clamp(235px,28vh,315px)}.survey-views .survey-viewstage{height:clamp(205px,26vh,300px)}
@media(max-width:1050px){.survey-work{grid-template-columns:1fr}.survey-map-host{max-width:100%}}
@media(max-width:640px){.survey-views{grid-template-columns:1fr}.survey-views>.survey-card:nth-child(2){order:-1}.survey-views .survey-viewhead{display:flex;min-height:auto}.survey-views .survey-viewstage{height:145px}.survey-views .survey-mosaic{height:clamp(200px,56vw,255px)}.survey-work .survey-job{grid-template-columns:1fr}.survey-work .survey-axis{display:block}.survey-viewhead select{max-width:62%}}
`;
