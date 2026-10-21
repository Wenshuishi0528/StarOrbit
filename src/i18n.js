import english from './i18n-en.json';

let language='zh';
try{if(localStorage.getItem('tiangong-language-v1')==='en')language='en';}catch{}
const listeners=new Set(),staticText=[],attributes=[],messages=new Map();
export const getLanguage=()=>language;
export const onLanguageChange=fn=>{listeners.add(fn);return ()=>listeners.delete(fn);};
export function t(key,params={}){
 const template=language==='en'?(english[key]??key):key;
 return template.replace(/\{(\w+)\}/g,(_,name)=>{
  const value=params[name]??'';return language==='en'&&typeof value==='string'?errorText(value):String(value);
 });
}
export function errorText(message){
 if(language!=='en')return message;
 const match=message.match(/^无效轨道记录 (\d+)$/);
 return match?`Invalid ephemeris record ${match[1]}`:(english[message]??message);
}
export function setText(id,key,params={}){
 messages.set(id,{key,params});document.getElementById(id).textContent=t(key,params);
}
function render(){
 document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=t('天宫 · 实时轨道模拟');
 for(const {node,key,before,after} of staticText)if(node.isConnected)node.nodeValue=before+t(key)+after;
 for(const {el,name,key} of attributes)el.setAttribute(name,t(key));
 for(const [id,{key,params}] of messages)document.getElementById(id).textContent=t(key,params);
 for(const [id,lang] of [['languageZh','zh'],['languageEn','en']]){
  const button=document.getElementById(id);button.setAttribute('aria-pressed',String(language===lang));button.classList.toggle('active',language===lang);
 }
}
export function setLanguage(value){
 if(!['zh','en'].includes(value)||value===language)return;
 language=value;try{localStorage.setItem('tiangong-language-v1',language);}catch{}
 render();for(const listener of listeners)listener();
}
export function initLanguage(){
 // Capture static labels once. Dynamic readouts use t()/setText() and refresh
 // callbacks, so translation never observes or scans the animation loop.
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;if(node.parentElement.closest('script,style,[data-no-i18n]'))continue;
  const key=node.nodeValue.trim();if(!Object.hasOwn(english,key))continue;
  const start=node.nodeValue.indexOf(key);staticText.push({node,key,before:node.nodeValue.slice(0,start),after:node.nodeValue.slice(start+key.length)});
 }
 for(const el of document.querySelectorAll('[aria-label],[title]'))for(const name of ['aria-label','title']){
  const key=el.getAttribute(name);if(Object.hasOwn(english,key))attributes.push({el,name,key});
 }
 document.getElementById('languageZh').onclick=()=>setLanguage('zh');document.getElementById('languageEn').onclick=()=>setLanguage('en');render();
}
