import { getLanguage, t } from './i18n.js';
import { ensureSkyCulture, getSkyCulture, cultureObjectLabel } from './sky-cultures.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import { lazyData } from './lazy-data.js';

const readers = {
  western: lazyData(() => import('./western-constellation-reading.js')),
  chinese: lazyData(() => import('./chinese-sky-reading.js')),
  objects: lazyData(() => import('./sky-object-card.js')),
};
const knownTypes = new Set(['star', 'deep-sky', 'solar', 'asterism', 'constellation', 'sky-group']);

export function formationSubject(record, language = getLanguage()) {
  if (!record) return null;
  return {
    id: record.targetId || record.id,
    name: cultureObjectLabel(record, language),
    type: record.targetId?.startsWith('constellation:')
      ? 'constellation'
      : record.targetId
        ? 'asterism'
        : 'sky-group',
    record,
  };
}

export async function skyReadingFor(target, culture, language, hit) {
  if (target.type === 'constellation') {
    const { readWesternConstellation } = await readers.western.load();
    const record =
      target.record || getSkyCulture('western').asterisms.find((s) => s.targetId === target.id);
    return readWesternConstellation(record, language);
  }
  if (target.type === 'asterism' || target.type === 'sky-group') {
    const [reader, sky] = await Promise.all([readers.chinese.load(), ensureSkyCulture('chinese')]);
    if (target.type === 'sky-group')
      return reader.readChineseGroup(
        target.record || sky.groups.find((g) => g.id === target.id) || target.id,
        sky,
        language
      );
    return reader.readChineseAsterism(
      target.record || sky.asterisms.find((s) => s.targetId === target.id),
      sky,
      language
    );
  }
  const { catalogCard } = await readers.objects.load();
  const resolved =
    target.type === 'solar' ? target : getXuntianTarget(target.id, language, culture) || target;
  return catalogCard(resolved, hit, language);
}

// A selected target, region and catalogue object share one reader. Opening an
// article never selects its subject in the instrument or changes its clock.
export function bindSkyReading(
  host,
  { inline = false, expanded = false, sourcesOpen = false } = {}
) {
  const node = document.createElement(inline ? 'div' : 'details');
  node.className = 'sky-reading';
  host.append(node);
  const summary = inline ? null : document.createElement('summary');
  if (summary) {
    node.append(summary);
    node.open = expanded;
  }
  const content = document.createElement('div');
  node.append(content);
  let subject,
    hit,
    culture,
    language,
    identity,
    ticket = 0,
    ready = false;
  function paint(article) {
    content.replaceChildren();
    const para = document.createElement('p');
    para.className = 'sky-reading-prose';
    para.textContent = article?.description || t('此位置没有已收录的天体简介。');
    content.append(para);
    if (!article) return;
    if (article.facts?.length || article.link) {
      const details = document.createElement('details'),
        caption = document.createElement('summary');
      details.className = 'sky-reading-sources';
      details.open = sourcesOpen;
      details.dataset.skyAbout = '';
      caption.textContent = t('星表资料与出处');
      details.append(caption);
      if (article.facts?.length) {
        const list = document.createElement('ul');
        list.className = 'sky-object-facts';
        for (const fact of article.facts) {
          const line = document.createElement('li');
          line.textContent = fact;
          list.append(line);
        }
        details.append(list);
      }
      if (article.link) {
        const link = document.createElement('a');
        link.href = article.link.url;
        link.textContent = article.link.name;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        details.append(link);
      }
      content.append(details);
    }
  }
  async function load() {
    if (!subject || ready || (!inline && !node.open)) return;
    const current = ++ticket;
    ready = true;
    content.textContent = t('正在读取简介…');
    content.setAttribute('aria-busy', 'true');
    try {
      const result = await skyReadingFor(subject, culture, language, hit);
      if (ticket === current) paint(result);
    } catch {
      if (ticket !== current) return;
      ready = false;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = t('重新读取简介');
      retry.onclick = load;
      content.replaceChildren(retry);
    } finally {
      if (ticket === current) content.removeAttribute('aria-busy');
    }
  }
  if (summary) node.addEventListener('toggle', load);
  node.hidden = true;
  return {
    set(next, skyCulture = 'western', measurement) {
      const lang = getLanguage();
      const key =
        next && knownTypes.has(next.type) ? [next.type, next.id, skyCulture, lang].join('|') : '';
      if (key === identity) return;
      identity = key;
      ticket++;
      ready = false;
      subject = key ? next : null;
      hit = measurement;
      culture = skyCulture;
      language = lang;
      content.replaceChildren();
      content.removeAttribute('aria-busy');
      node.hidden = !subject;
      if (!subject) {
        delete node.dataset.skyReading;
        return;
      }
      node.dataset.skyReading = subject.id;
      if (summary) summary.textContent = t('关于{name}', { name: subject.name });
      load();
    },
  };
}
