import { stellarCatalogueObservations } from './stellar-catalogue-observations.js';
import { standardStarNames } from './stellar-name-register-reading.js';
import { brightStarStories } from './stellar-story-reading.js';
import { stellarObservationStories } from './stellar-observation-stories.js';
import nameNotes from './stellar-name-notes.json' with { type: 'json' };
import chineseNameNotes from './stellar-chinese-name-notes.json' with { type: 'json' };
import latinNameNotes from './stellar-latin-name-notes.json' with { type: 'json' };
import earlyArabicNotes from './stellar-arabic-early-name-notes.json' with { type: 'json' };
import lateArabicNotes from './stellar-arabic-late-name-notes.json' with { type: 'json' };
import worldNameNotes from './stellar-world-name-notes.json' with { type: 'json' };
import nameArticles from './stellar-name-article-ids.json' with { type: 'json' };

const namesAuthority = {
  name: 'IAU · Working Group on Star Names',
  url: 'https://exopla.net/star-names/modern-iau-star-names/',
};
const museum = {
  name: 'Hong Kong Space Museum',
  url: 'https://hk.space.museum/sc/web/spm/resources/teachers-corner/constellations-and-myths/chinese-starlore.html',
};
const twins = {
  name: 'Apollodorus · Library 3.11.2',
  url: 'https://beta.perseus.tufts.edu/urn%3Acts%3AgreekLit%3Atlg0548.tlg001.perseus-eng2/section%3A3.11.2/',
};
const witnesses = {
  32349: {
    name: 'The Metropolitan Museum of Art',
    url: 'https://www.metmuseum.org/essays/telling-time-in-ancient-egypt',
  },
  30438: { name: '司马迁 · 史记·天官书', url: 'https://zh.wikisource.org/wiki/史記/卷027' },
  37826: twins,
  36850: twins,
  91262: museum,
  97649: museum,
  14576: {
    name: 'John Goodricke · Royal Society',
    url: 'https://makingscience.royalsociety.org/items/l-and-p_8_69/letter-of-the-periods-of-the-light-of-the-star-algol-from-john-goodricke-to-richard-shepherd',
  },
};
const locales = ['zh', 'en', 'ru', 'fr'];
const nameOrigins = {
  ...nameNotes,
  ...chineseNameNotes,
  ...latinNameNotes,
  ...earlyArabicNotes,
  ...lateArabicNotes,
  ...worldNameNotes,
};
const dateFormats = new Map();

function nameSources(id, witness) {
  const registered = standardStarNames[id];
  if (!registered) return [];
  const [name] = registered;
  const register = {
    ...namesAuthority,
    url: namesAuthority.url + '#:~:text=' + encodeURIComponent(name),
  };
  const page = nameArticles[id];
  return page && !witness?.url.startsWith('https://ase.exopla.net/')
    ? [{ name: 'IAU WGSN · ' + name, url: 'https://ase.exopla.net/?curid=' + page }, register]
    : [register];
}

function registeredStory(id, lang, i, originNote) {
  const [name, , adopted, designation] = standardStarNames[id];
  if (!dateFormats.has(lang))
    dateFormats.set(lang, new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }));
  const date = dateFormats.get(lang).format(new Date(adopted + 'T00:00:00Z'));
  const identification = [
    `国际天文学联合会于 ${date} 为 ${designation} 核定了 ${name} 这个写法。`,
    `On ${date}, the IAU adopted the spelling ${name} for ${designation}.`,
    `МАС утвердил написание ${name} для звезды ${designation} ${date}.`,
    `Le ${date}, l’UAI a adopté la graphie ${name} pour l’étoile ${designation}.`,
  ][i];
  return originNote[lang] + (lang === 'zh' ? '' : ' ') + identification;
}

export function starHistory(family, id, lang) {
  const i = locales.indexOf(lang);
  const featured = family === 'hip' && (brightStarStories[id] || stellarObservationStories[id]);
  const note = family === 'hip' && nameOrigins[id];
  const record = stellarCatalogueObservations(family, id, lang, i);
  if (!featured && !note) return record;
  const relatedStory = {
    kind: 'history',
    label: [
      '星表怎样记录这颗星',
      'The star in observing catalogues',
      'Как звезду записали в каталогах',
      'L’étoile dans les catalogues',
    ][i],
    text: record.story,
    links: record.sources,
  };
  if (featured) {
    const witness = featured.source || witnesses[id];
    return {
      story: featured[lang],
      storyKind: featured.kind,
      relatedStory,
      sources: [witness, ...nameSources(id, witness)].filter(Boolean),
    };
  }
  return {
    story: registeredStory(id, lang, i, note),
    storyKind: 'name',
    relatedStory,
    sources: [note.source, ...nameSources(id, note.source)].filter(Boolean),
  };
}
