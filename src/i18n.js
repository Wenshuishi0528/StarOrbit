import english from './i18n-en.json';
import russian from './i18n-ru.json';
import french from './i18n-fr.json';
const dictionaries={en:english,ru:russian,fr:french},languages=['zh','en','ru','fr'];
const buttons=[['languageZh','zh'],['languageEn','en'],['languageRu','ru'],['languageFr','fr']];

let language='zh';
try{const saved=localStorage.getItem('tiangong-language-v1');if(languages.includes(saved))language=saved;}catch{}
const listeners=new Set(),staticText=[],attributes=[],messages=new Map();
export const getLanguage=()=>language;
export const onLanguageChange=fn=>{listeners.add(fn);return ()=>listeners.delete(fn);};
export function t(key,params={}){
 const template=language==='zh'?key:(dictionaries[language][key]??english[key]??key);
 return template.replace(/\{(\w+)\}/g,(_,name)=>{
  const value=params[name]??'';return language!=='zh'&&typeof value==='string'?errorText(value):String(value);
 });
}
export function errorText(message){
 if(language==='zh')return message;
 const match=message.match(/^无效轨道记录 (\d+)$/);
 return match?t('无效轨道记录 {index}',{index:match[1]}):(dictionaries[language][message]??english[message]??message);
}
export function setText(id,key,params={}){
 messages.set(id,{key,params});document.getElementById(id).textContent=t(key,params);
}
function render(){
 document.documentElement.lang=language==='zh'?'zh-CN':language;document.title=t('天宫 · 实时轨道模拟');
 for(const {node,key,before,after} of staticText)if(node.isConnected)node.nodeValue=before+t(key)+after;
 for(const {el,name,key} of attributes)el.setAttribute(name,t(key));
 for(const [id,{key,params}] of messages)document.getElementById(id).textContent=t(key,params);
 for(const [id,lang] of buttons){
  const button=document.getElementById(id);button.setAttribute('aria-pressed',String(language===lang));button.classList.toggle('active',language===lang);
 }
}
export function setLanguage(value){
 if(!languages.includes(value)||value===language)return;
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
 for(const [id,lang] of buttons)document.getElementById(id).onclick=()=>setLanguage(lang);render();
}
