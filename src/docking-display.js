// Resize the existing workbench inside its modal, without replacing the canvas
// or using browser fullscreen (which is not available for dialogs everywhere).
export function installDockingDisplay(dialog,panel,{t,clearInput}){
 const largeButton=panel.querySelector('[data-role="large-view"]');
 const fillButton=panel.querySelector('[data-role="fill-window"]');
 let large=false,fill=false;
 function refresh(){
  dialog.classList.toggle('dock-large',large||fill);
  dialog.classList.toggle('dock-window-fill',fill);
  panel.classList.toggle('dock-expanded',large||fill);
  largeButton.textContent=t(large?'标准视窗':'大视窗');
  largeButton.setAttribute('aria-pressed',String(large));
  largeButton.disabled=fill;
  fillButton.textContent=t(fill?'退出铺满':'铺满窗口');
  fillButton.setAttribute('aria-pressed',String(fill));
  fillButton.title=t('铺满浏览器内容区，按 Esc 恢复');
 }
 largeButton.onclick=()=>{clearInput();large=!large;refresh();};
 fillButton.onclick=()=>{clearInput();fill=!fill;refresh();};
 const cancel=event=>{
  if(!large&&!fill)return;
  event.preventDefault();clearInput();
  if(fill){fill=false;refresh();fillButton.focus();}
  else{large=false;refresh();largeButton.focus();}
 };
 dialog.addEventListener('cancel',cancel);
 function reset(){large=false;fill=false;refresh();}
 refresh();
 return {refresh,reset,dispose(){reset();dialog.removeEventListener('cancel',cancel);largeButton.onclick=null;fillButton.onclick=null;}};
}
