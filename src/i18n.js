import english from './i18n-en.json' with { type: 'json' };
import { lazyData } from './lazy-data.js';

// 中文即键名，无需词典。英文词典随启动包载入：initLanguage() 用它识别静态文本，
// 俄文、法文缺词时也回退英文。俄文、法文词典较大，首次选用时再载入。
const dictionaries = { en: english },
  loaders = {
    ru: lazyData(() => import('./i18n-ru.json', { with: { type: 'json' } })).load,
    fr: lazyData(() => import('./i18n-fr.json', { with: { type: 'json' } })).load,
  },
  languages = ['zh', 'en', 'ru', 'fr'];
const buttons = [
  ['languageZh', 'zh'],
  ['languageEn', 'en'],
  ['languageRu', 'ru'],
  ['languageFr', 'fr'],
];

let language = 'zh',
  saved = null,
  pending = null,
  request = 0,
  startup = Promise.resolve(false);
try {
  saved = localStorage.getItem('tiangong-language-v1');
} catch {}
const available = (value) => value === 'zh' || Object.hasOwn(dictionaries, value);
function loadDictionary(value) {
  if (available(value)) return Promise.resolve();
  return loaders[value]().then((module) => {
    dictionaries[value] = module.default;
  });
}
if (saved === 'en') language = saved;
// 已保存俄文或法文时立即开始取词典；initLanguage() 记下中文静态文本后再切换。
else if (Object.hasOwn(loaders, saved)) loadDictionary(saved).catch(() => {});
const listeners = new Set(),
  staticText = [],
  attributes = [],
  messages = new Map();
export const getLanguage = () => language;
export const onLanguageChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export function t(key, params = {}) {
  const template = language === 'zh' ? key : (dictionaries[language][key] ?? english[key] ?? key);
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = params[name] ?? '';
    return language !== 'zh' && typeof value === 'string' ? errorText(value) : String(value);
  });
}
export function errorText(message) {
  if (language === 'zh') return message;
  const exact = dictionaries[language][message] ?? english[message];
  if (exact) return exact;
  const http = message.match(/^数据源返回 HTTP (\d{3})$/);
  if (http) return t('数据源返回 HTTP {status}', { status: http[1] });
  if (message.includes('；')) return message.split('；').map(errorText).join('; ');
  const match = message.match(/^无效轨道记录 (\d+)$/);
  return match
    ? t('无效轨道记录 {index}', { index: match[1] })
    : (dictionaries[language][message] ?? english[message] ?? message);
}
export function setText(id, key, params = {}) {
  messages.set(id, { key, params });
  document.getElementById(id).textContent = t(key, params);
}
function render() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
  document.title = t('星轨 · StarOrbit — 航天与轨道模拟');
  for (const { node, key, before, after } of staticText)
    if (node.isConnected) node.nodeValue = before + t(key) + after;
  for (const { el, name, key } of attributes) el.setAttribute(name, t(key));
  for (const [id, { key, params }] of messages)
    document.getElementById(id).textContent = t(key, params);
  markButtons();
}
function markButtons() {
  for (const [id, lang] of buttons) {
    const button = document.getElementById(id);
    button.setAttribute('aria-pressed', String(language === lang));
    button.classList.toggle('active', language === lang);
    if (lang === pending) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  }
}
function apply(value) {
  pending = null;
  try {
    localStorage.setItem('tiangong-language-v1', value);
  } catch {}
  if (value === language) {
    markButtons();
    return;
  }
  language = value;
  render();
  for (const listener of listeners) listener();
}
// 词典就绪后才切换，t() 始终同步。连续点选时只采用最后一次；载入失败保持当前语言。
// 返回的 Promise 表示这次选择是否已生效。
export function setLanguage(value) {
  if (!languages.includes(value)) return Promise.resolve(false);
  const ticket = ++request;
  if (available(value)) {
    apply(value);
    return Promise.resolve(true);
  }
  pending = value;
  markButtons();
  return loadDictionary(value).then(
    () => {
      if (ticket !== request) return false;
      apply(value);
      return true;
    },
    (error) => {
      console.error('StarOrbit language pack', value, error);
      if (ticket === request) {
        pending = null;
        markButtons();
      }
      return false;
    }
  );
}
// 启动时等待已保存的俄文或法文词典再揭开载入画面；失败时不阻塞启动。
export const languageReady = () => startup;
export function initLanguage() {
  // Capture static labels once. Dynamic readouts use t()/setText() and refresh
  // callbacks, so translation never observes or scans the animation loop.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('script,style,[data-no-i18n]')) continue;
    const key = node.nodeValue.trim();
    if (!Object.hasOwn(english, key)) continue;
    const start = node.nodeValue.indexOf(key);
    staticText.push({
      node,
      key,
      before: node.nodeValue.slice(0, start),
      after: node.nodeValue.slice(start + key.length),
    });
  }
  for (const el of document.querySelectorAll('[aria-label],[title]'))
    for (const name of ['aria-label', 'title']) {
      const key = el.getAttribute(name);
      if (Object.hasOwn(english, key)) attributes.push({ el, name, key });
    }
  for (const [id, lang] of buttons) document.getElementById(id).onclick = () => setLanguage(lang);
  render();
  if (Object.hasOwn(loaders, saved)) startup = setLanguage(saved);
}
