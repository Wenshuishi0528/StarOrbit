// The orbit canvas receives pointer events everywhere outside the visible dock.
export class MusicDock{
 constructor(widget,locked=()=>false){
  this.widget=widget;this.locked=locked;this.inside=false;this.keyboard=false;this.held=false;this.dragging=false;this.expanded=false;
  widget.addEventListener('pointerenter',e=>{if(e.pointerType==='touch')return;this.touch=false;this.inside=true;this.expand();});
  widget.addEventListener('pointerleave',e=>{if(e.pointerType==='touch')return;this.inside=false;this.schedule();});
  widget.addEventListener('pointerdown',()=>{this.held=true;});
  for(const event of ['pointerup','pointercancel'])document.addEventListener(event,()=>{this.held=false;this.schedule();});
  widget.addEventListener('dragstart',()=>{this.dragging=true;});document.addEventListener('dragend',()=>{this.dragging=false;this.schedule();});
  document.addEventListener('keydown',e=>{if(e.key==='Tab')this.keyboard=true;if(e.key==='Escape'&&this.expanded){e.preventDefault();this.keyboard=false;this.collapse();if(widget.contains(document.activeElement))document.getElementById('musicOrb').focus();}});
  document.addEventListener('pointerdown',e=>{this.keyboard=false;this.touch=e.pointerType==='touch'&&widget.contains(e.target);if(!widget.contains(e.target))this.collapse();});
  widget.addEventListener('focusin',()=>{if(this.keyboard)this.expand();});
  widget.addEventListener('focusout',()=>queueMicrotask(()=>this.schedule()));
  document.getElementById('musicOrb').addEventListener('click',()=>this.expand());
  this.collapse();
 }
 expand(){clearTimeout(this.timer);this.expanded=true;this.widget.classList.add('expanded');document.getElementById('musicExpanded').hidden=false;document.getElementById('musicOrb').setAttribute('aria-expanded','true');}
 schedule(){
  clearTimeout(this.timer);if(!this.expanded||this.touch||this.inside||this.held||this.dragging||this.locked()||this.keyboard&&this.widget.contains(document.activeElement))return;
  this.timer=setTimeout(()=>{if(!this.touch&&!this.inside&&!this.held&&!this.dragging&&!this.locked()&&!(this.keyboard&&this.widget.contains(document.activeElement)))this.collapse();},280);
 }
 collapse(){
  if(this.guided)return;
  clearTimeout(this.timer);this.expanded=false;this.widget.classList.remove('expanded','music-popup-open');document.getElementById('musicExpanded').hidden=true;document.getElementById('musicOrb').setAttribute('aria-expanded','false');
  for(const [panel,button] of [['musicPanel','musicListToggle'],['musicVolumePanel','musicVolumeToggle']]){document.getElementById(panel).hidden=true;document.getElementById(button).setAttribute('aria-expanded','false');}
 }
}
