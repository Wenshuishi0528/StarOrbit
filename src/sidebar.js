const KEY='tiangong-sidebar-v1';
export function installSidebar(){
 let saved={};
 try{const value=JSON.parse(localStorage.getItem(KEY));if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
 const controls=new Map(),defaults=new Set(['mission','orbit']);
 const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{}};
 for(const section of document.querySelectorAll('aside > section[data-settings-module]')){
  const key=section.dataset.settingsModule,button=section.querySelector('.settings-toggle'),content=document.getElementById(button.getAttribute('aria-controls'));
  const setOpen=open=>{content.hidden=!open;button.setAttribute('aria-expanded',String(open));};
  setOpen(typeof saved[key]==='boolean'?saved[key]:defaults.has(key));
  controls.set(key,setOpen);
  button.addEventListener('click',()=>{
   const open=content.hidden;setOpen(open);saved[key]=open;
   persist();
  });
 }
 for(const [id,open] of [['expandSettings',true],['collapseSettings',false]]){
  document.getElementById(id).onclick=()=>{
   for(const [key,setOpen] of controls){setOpen(open);saved[key]=open;}
   persist();
  };
 }
}
