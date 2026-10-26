import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const dictionaries=Object.fromEntries(['en','ru','fr'].map(lang=>[lang,JSON.parse(fs.readFileSync(`src/i18n-${lang}.json`))]));
for(const lang of ['ru','fr']){
 assert.deepEqual(Object.keys(dictionaries[lang]).sort(),Object.keys(dictionaries.en).sort());
 for(const [key,value] of Object.entries(dictionaries[lang])){assert(value.trim());assert.deepEqual((value.match(/\{\w+\}/g)||[]).sort(),(key.match(/\{\w+\}/g)||[]).sort(),key);}
}
const elements=new Map(),document={documentElement:{},getElementById:id=>{if(!elements.has(id))elements.set(id,{setAttribute(k,v){this[k]=v;},classList:{toggle(){}}});return elements.get(id);}};
let stored='ru';const context=vm.createContext({english:dictionaries.en,russian:dictionaries.ru,french:dictionaries.fr,document,localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v}});
vm.runInContext(fs.readFileSync('src/i18n.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ',''),context);
assert.equal(vm.runInContext('getLanguage()',context),'ru');
for(const lang of ['en','fr','zh','ru']){
 vm.runInContext(`setLanguage('${lang}')`,context);assert.equal(stored,lang);assert.equal(document.documentElement.lang,lang==='zh'?'zh-CN':lang);
 assert.equal(vm.runInContext("t('前进 {duration}',{duration:'1 秒'})",context),lang==='zh'?'前进 1 秒':dictionaries[lang]['前进 {duration}'].replace('{duration}',dictionaries[lang]['1 秒']));
 assert.equal(vm.runInContext("errorText('无效轨道记录 12')",context),lang==='zh'?'无效轨道记录 12':dictionaries[lang]['无效轨道记录 {index}'].replace('{index}','12'));
}
console.log('Four-language persistence, translation coverage, placeholders and dynamic errors passed');
