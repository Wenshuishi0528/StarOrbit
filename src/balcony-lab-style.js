export default `
.balcony-lab{--bal-line:#2d4256;--bal-cyan:#94eddb;max-width:1280px;margin:0 auto;color:#e2edf4;font-size:13px}
.balcony-lab [hidden]{display:none!important}.balcony-lab h3,.balcony-lab p,.balcony-lab figure{margin:0}
.balcony-lab button,.balcony-lab select,.balcony-lab input{font:inherit}.balcony-lab button,.balcony-lab select{max-width:100%;white-space:normal}
.balcony-lab button{padding:6px 12px;background:#172b3e;border:1px solid #3c5368;border-radius:6px;color:#e3f2f6;cursor:pointer}
.balcony-lab button:hover{border-color:#78b5bb}.balcony-lab button[aria-pressed=true],.balcony-lab .bal-primary{border-color:#629e99;background:#163d42;color:#c4f8ec}
.balcony-lab button:disabled{opacity:.5;cursor:default}.balcony-lab input[type=number],.balcony-lab input[type=text],.balcony-lab input[type=datetime-local],.balcony-lab select{width:100%;min-width:0;max-width:100%;border:1px solid #3c5061;background:#122232;color:#eff7fb;border-radius:6px;padding:7px}
.balcony-lab input[type=range]{appearance:auto;padding:0;background:transparent;border:0;accent-color:#83e3cf;max-width:none;width:100%;min-width:35px}
.balcony-lab label,.balcony-lab small{color:#a7b9c9}.balcony-lab label>span{display:block;margin-bottom:4px}
.bal-top,.bal-heading,.bal-playbar,.bal-summary-row,.bal-actions,.bal-legend,.bal-events{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bal-top{justify-content:space-between;margin-bottom:12px;gap:10px 24px}.bal-top h3{font-size:21px;line-height:1.25;letter-spacing:.01em}
.bal-top p{margin-top:3px;font-size:12px;color:#a5b5c3}.bal-select{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.bal-select select{max-width:300px;width:auto}
.bal-config,.bal-profile{border:1px solid var(--bal-line);border-radius:8px;background:#101d2a;margin-bottom:12px}
.balcony-lab summary{cursor:pointer;padding:9px 12px;color:#bfd0dd;font-size:12px}.balcony-lab summary:focus-visible{outline:2px solid #8adccc}
.bal-form{padding:0 12px 12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;align-items:end}
.bal-form label,.bal-edit label{min-width:0}.bal-form .bal-date{grid-column:span 2}.bal-form .bal-actions{grid-column:1/-1}
.bal-status{font-size:12px;color:#c2d6db;margin:3px 0 10px!important}.bal-status[data-error=true]{color:#ffc2a4}
.bal-grid{display:grid;grid-template-columns:minmax(0,2.6fr) minmax(210px,1fr);gap:12px;align-items:start}
.bal-card{border:1px solid var(--bal-line);border-radius:10px;background:#0e1d2b;overflow:hidden;min-width:0}
.bal-heading{padding:10px 13px;justify-content:space-between;line-height:1.35}.bal-heading b{font-size:13px}.bal-heading small{font-variant-numeric:tabular-nums;font-size:11px}
.bal-sky-wrap{border-block:1px solid var(--bal-line);background:#091421}
.bal-sky{display:block;width:100%;height:clamp(245px,32vw,380px);cursor:grab;touch-action:pan-y}
.bal-sky:active{cursor:grabbing}.bal-sky[data-edit=true]{cursor:crosshair}
.bal-legend{padding:8px 13px;color:#adc0ce;font-size:11px;gap:6px 14px}.bal-legend span:before{content:"";display:inline-block;vertical-align:middle;width:16px;border-top:2px solid #82e8d6;margin-right:5px}.bal-legend span:nth-child(2):before{border:0;border-top:2px dashed #95a4b4}
.bal-readout{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-top:1px solid var(--bal-line);padding:11px 3px}
.bal-readout div{padding:0 10px}.bal-readout div+div{border-left:1px solid var(--bal-line)}
.bal-readout small,.bal-orbit-info small{display:block;font-size:11px}.bal-readout b,.bal-orbit-info b{display:block;margin-top:3px;font-weight:550}
.bal-readout b[data-good=true]{color:var(--bal-cyan)}.bal-readout b[data-good=false]{color:#f0be93}
.bal-guide{padding:0 13px 11px;color:#9eb6c6;font-size:12px;line-height:1.5}
.bal-orbit-canvas{display:block;width:100%;height:clamp(145px,17vw,208px);border-block:1px solid var(--bal-line)}
.bal-orbit-info{padding:9px 13px;display:grid;gap:8px;line-height:1.35}.bal-orbit-info b{font-size:12px;color:#ccdae4}
.bal-mark{display:inline-block;width:7px;height:7px;vertical-align:1px;margin-right:4px;border-radius:50%;background:#ffd099}.bal-mark.nadir{background:white}
.bal-timeline{margin:0 0 10px;padding:8px 12px}.bal-summary-row{justify-content:space-between;margin-bottom:6px}.bal-summary-row strong{font-size:12px}
.bal-summary-row time{font-size:14px;color:var(--bal-cyan);font-variant-numeric:tabular-nums}.bal-playbar{flex-wrap:nowrap}.bal-playbar button{flex-shrink:0}
.bal-playbar select{width:auto}.bal-times{display:flex;justify-content:space-between;color:#a1b3c1;font-size:11px;font-variant-numeric:tabular-nums}.bal-events{margin-top:8px;gap:5px}
.bal-events button{font-size:11px;padding:4px 8px}.bal-profile{margin-top:12px}.bal-profile-inner{padding:0 12px 12px}
.bal-edit{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.bal-edit label{width:100px}.bal-edit .bal-point{width:min(170px,100%)}
.bal-note{font-size:11px;line-height:1.5;color:#90a6b7;margin:6px 0!important}

.bal-source-actions{padding:0 12px 4px}.bal-window-details{margin-bottom:9px}.bal-window-details[open] .obs-card h4{display:none}.bal-window-details:not([open]){border:1px solid var(--bal-line);border-radius:8px;background:#101d2a}
.bal-select .bal-target{display:grid;grid-template-columns:auto minmax(100px,1fr);align-items:center;gap:5px}.bal-select .bal-target span{margin:0}.bal-select .bal-target select{max-width:240px}
.bal-watch{padding:9px 12px;border:1px solid var(--bal-line);border-radius:8px;background:#101f2e;margin-bottom:8px}.bal-watch-head,.bal-watch-head>div{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.bal-watch-head{justify-content:space-between}.bal-watch-readout{display:grid;gap:4px;margin:9px 0 1px;border-left:3px solid var(--bal-cyan);padding:2px 10px}.bal-watch-readout strong{font-size:clamp(18px,4vw,25px);font-variant-numeric:tabular-nums;color:#aff4e1}.bal-watch-readout{position:relative;padding-right:75px}.bal-watch-readout svg{width:68px;height:68px;position:absolute;right:2px;top:50%;transform:translateY(-50%)}.bal-watch-readout svg text{text-anchor:middle;font-size:9px;fill:#bfd8d5}.bal-watch-readout b{font-size:16px}.bal-playbar small{flex-shrink:0;max-width:40%;font-size:11px}.bal-watch-readout span,.bal-track-action span{color:#a4b9c9;font-size:12px;line-height:1.5}.bal-track-action{margin-top:9px}
@media(max-width:620px){.bal-select .bal-target{width:100%}.bal-select .bal-target select{max-width:100%;width:100%}}
@media(max-width:800px){.bal-grid{grid-template-columns:minmax(0,2fr) minmax(160px,.9fr)}.bal-readout div{padding:0 7px}.bal-heading{padding:8px}}
@media(max-width:620px){.bal-grid{grid-template-columns:1fr}.bal-sky{height:255px}.bal-top{align-items:start}.bal-select{width:100%}.bal-select select{flex:1;max-width:100%}.bal-reverse{display:grid;grid-template-columns:minmax(110px,.9fr) minmax(0,1.1fr)}.bal-reverse .bal-heading{grid-column:1/-1}.bal-orbit-canvas{border:0;border-top:1px solid var(--bal-line);height:132px}.bal-orbit-info{border-top:1px solid var(--bal-line);gap:6px;align-content:center}.bal-form .bal-date{grid-column:1/-1}.bal-timeline{padding:10px}.bal-playbar{gap:5px}.bal-playbar button{padding:6px}.bal-playbar select{padding:5px}.bal-readout b{font-size:12px}.bal-guide{font-size:11px}}
`;
