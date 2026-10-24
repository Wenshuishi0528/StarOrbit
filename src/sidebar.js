const KEY='tiangong-sidebar-v1';
export function installSidebar(){
 let saved={};
 try{const value=JSON.parse(localStorage.getItem(KEY));if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
 for(const section of document.querySelectorAll('aside > section[data-settings-module]')){
  const key=section.dataset.settingsModule,button=section.querySelector('.settings-toggle'),content=document.getElementById(button.getAttribute('aria-controls'));
  const setOpen=open=>{content.hidden=!open;button.setAttribute('aria-expanded',String(open));};
  setOpen(saved[key]!==false);
  button.addEventListener('click',()=>{
   const open=content.hidden;setOpen(open);saved[key]=open;
   try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{}
  });
 }
}
