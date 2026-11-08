export const cosmicStyle = `
.cosmic-lab{--cosmic-accent:#f0b673;color:#e6edf6;max-width:1500px;margin:auto}
.cosmic-lab *{box-sizing:border-box}.cosmic-lab button,.cosmic-lab a{touch-action:manipulation}
.cosmic-intro{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0 0 14px}
.cosmic-intro h3{display:none}.cosmic-intro p{color:#9db0c4;font-size:12px;line-height:1.6;margin:0;max-width:700px}
.cosmic-eyebrow{color:var(--cosmic-accent);font-size:10px;letter-spacing:.2em;margin-bottom:5px}
.cosmic-topics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:14px}
.cosmic-topics button{display:flex;align-items:center;gap:10px;padding:12px 10px;text-align:left;background:#0d1c2d;border:1px solid #2a3b50;min-width:0}
.cosmic-topics .cosmic-number{font-size:10px;opacity:.6;font-variant-numeric:tabular-nums}
.cosmic-topics button span{min-width:0;max-width:100%;overflow-wrap:anywhere}
.cosmic-topics button[aria-selected=true]{background:#1c2a38;border-color:var(--cosmic-accent);box-shadow:inset 0 -2px var(--cosmic-accent)}
.cosmic-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;align-items:start}
.cosmic-visual{position:relative;border:1px solid #26394e;border-radius:12px;overflow:hidden;background:#030812;height:clamp(250px,calc(92dvh - 360px),520px)}
.cosmic-canvas{display:block;width:100%;height:100%;min-height:0;touch-action:none;outline-offset:-3px!important}
.cosmic-visual-note{position:absolute;top:14px;left:16px;right:16px;pointer-events:none;display:flex;justify-content:space-between;gap:12px;font-size:10px;letter-spacing:.08em;color:#c6d6e6;text-shadow:0 1px 5px #000}
.cosmic-visual-note span:first-child{padding:5px 8px;background:#0b1624cc;border:1px solid #39516c;border-radius:5px}
.cosmic-visual-note strong{font-weight:400;color:var(--cosmic-accent)}
.cosmic-error{position:absolute;inset:0;display:grid;place-content:center;padding:24px;line-height:1.8;background:#091321;color:#ecc5a6}.cosmic-error[hidden]{display:none}
.cosmic-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0}.cosmic-actions button{padding:8px 12px}.cosmic-actions .cosmic-primary{border-color:#b59060;background:#28313b;color:#ffe5bd}
.cosmic-hint{font-size:11px;color:#92a8bd;line-height:1.6;margin:6px 0}
.cosmic-progress{display:grid;grid-template-columns:auto minmax(60px,1fr) auto;gap:12px;align-items:center;font-size:12px;margin:12px 0}.cosmic-progress input{width:100%;padding:0}.cosmic-progress output{font-variant-numeric:tabular-nums;min-width:40px;text-align:right}
.cosmic-stage{color:var(--cosmic-accent);font-size:12px;min-height:18px;margin:8px 0}
.cosmic-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.cosmic-metric{padding:12px 14px;background:#0e1c2b;border:1px solid #23374b;border-radius:8px;min-width:0}.cosmic-metric dt{font-size:11px;color:#91a9bf}.cosmic-metric dd{margin:6px 0 0;font-size:20px;line-height:1.4;color:#edf4fa;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.cosmic-panel{background:#0d1b2a;border:1px solid #26394c;border-radius:10px;padding:16px;margin:0 0 12px}.cosmic-panel h4{font-size:13px;margin:0 0 12px;color:#e1d0b5}.cosmic-panel p{font-size:12px;line-height:1.7;color:#a7bed0;margin:0 0 12px}
.cosmic-control{display:block;margin-bottom:17px}.cosmic-control:last-child{margin-bottom:0}.cosmic-control-head{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:8px}.cosmic-control output{color:var(--cosmic-accent);white-space:nowrap;font-variant-numeric:tabular-nums}.cosmic-control input{width:100%;padding:0!important;accent-color:var(--cosmic-accent)}
.cosmic-facts{padding:0 0 0 18px;margin:8px 0}.cosmic-facts li{font-size:12px;line-height:1.75;color:#b9cada;margin:10px 0}.cosmic-model-note{border-left:2px solid #9c7e52;padding-left:10px;color:#aeb9c8!important}
.cosmic-target{margin-top:10px}.cosmic-target button{width:100%;text-align:left;font-size:12px;padding:10px;border-color:#3b596a}.cosmic-target p{font-size:11px;margin:5px 0 10px}
.cosmic-sources summary{font-size:12px;color:#a7bbce;cursor:pointer}.cosmic-sources a{display:block;overflow-wrap:anywhere;font-size:11px;line-height:1.6;margin-top:8px;color:#88cbd4}
.cosmic-curve{background:#081522;border:1px solid #254057;border-radius:8px;padding:10px 12px;margin-top:12px}.cosmic-curve[hidden]{display:none}.cosmic-curve svg{display:block;width:100%;height:80px;overflow:visible}.cosmic-curve-head{display:flex;justify-content:space-between;font-size:11px;color:#a4bdd0;margin-bottom:7px}.cosmic-curve p{margin:5px 0 0;font-size:11px;color:#a4bdd0;line-height:1.5}
.cosmic-status{font-size:12px;line-height:1.6;color:#e5c49b;min-height:18px}
@media(min-width:1600px){.cosmic-layout{grid-template-columns:minmax(0,1fr) 350px}}
@media(max-width:950px){.cosmic-layout{grid-template-columns:minmax(0,1fr) 265px}.cosmic-topics button{gap:5px;padding:10px 7px}}
@media(max-width:700px){.cosmic-layout{grid-template-columns:minmax(0,1fr)}.cosmic-topics{gap:4px}.cosmic-topics button{flex-direction:column;gap:5px;text-align:center;font-size:11px;padding:8px 2px}.cosmic-intro p{font-size:11px}.cosmic-visual{height:300px}.cosmic-visual-note{left:10px;right:10px;top:10px;font-size:9px}.cosmic-panel{padding:14px}.cosmic-metric dd{font-size:17px}.cosmic-progress{font-size:11px;gap:8px}.cosmic-actions button{flex:1;font-size:11px;padding:8px}.cosmic-number{display:none}}
`;
