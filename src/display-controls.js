const KEY='tiangong-overlays-v1';
export function installDisplayControls(){
 const $=id=>document.getElementById(id),panel=$('telemetry'),show=$('showTelemetry'),close=$('closeTelemetry'),toggle=$('viewMenuToggle'),actions=$('viewActions'),toolbar=toggle.closest('.toolbar');
 let visible=true;try{visible=JSON.parse(localStorage.getItem(KEY))?.telemetry!==false;}catch{}
 const setVisible=(value,save=true)=>{panel.hidden=!value;show.checked=value;if(save)try{localStorage.setItem(KEY,JSON.stringify({telemetry:value}));}catch{}};
 setVisible(visible,false);show.onchange=()=>setVisible(show.checked);close.onclick=()=>{setVisible(false);show.focus();};
 const setOpen=open=>{actions.hidden=!open;toggle.setAttribute('aria-expanded',String(open));};
 setOpen(false);toggle.onclick=()=>setOpen(actions.hidden);
 actions.addEventListener('click',event=>{if(event.target.closest('button')){setOpen(false);toggle.focus();}});
 document.addEventListener('pointerdown',event=>{if(!toolbar.contains(event.target))setOpen(false);});
 document.addEventListener('focusin',event=>{if(!toolbar.contains(event.target))setOpen(false);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!actions.hidden){setOpen(false);toggle.focus();}});
}
