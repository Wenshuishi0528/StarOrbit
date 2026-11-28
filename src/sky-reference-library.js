import { ensureSkyCulture, getSkyCulture } from './sky-cultures.js';
import { DEEP_SKY_OBJECTS } from './deep-sky-catalog.js';
import { equatorial } from './environment-math.js';
import { formationSubject, readingTargetId } from './sky-reading-view.js';
import { westernRegion } from './sky-location-math.js';
import {
  catalogTargetIds,
  matchingTargetIds,
  getXuntianTarget,
  chineseAsterismsForTarget,
} from './xuntian-catalog.js';
import { solarBodyIds, solarLabel, searchSolarTargets } from './solar-targets.js';
import { symbols } from './chinese-sky-reading-content.js';

export const referenceCategories = {
  all: '全部类别',
  asterism: '中国星官',
  'sky-group': '传统天区',
  constellation: '现代星座',
  star: '恒星',
  solar: '太阳系天体',
  'deep-sky': '深空天体',
};
const languages = ['zh', 'en', 'fr', 'ru'];
const groupAliases = {
  enclosure: ['三垣', 'Three Enclosures', 'Trois enclos', 'Три ограды'],
  mansion: [
    '二十八宿',
    '二十八星宿',
    'Twenty-eight Mansions',
    'Vingt-huit loges',
    'Двадцать восемь стоянок',
  ],
  symbol: ['四象', '四宫', 'Four Symbols', 'Quatre symboles', 'Четыре символа'],
};
const firstReads = [
  'asterism:chinese:075',
  'constellation:Ant',
  'hip:14576',
  'solar:Moon',
  'deep-sky:m31',
  'group:ziwei',
  'hip:91262',
  'asterism:chinese:304',
  'constellation:Lyr',
  'group:azuredragon',
  'deep-sky:m1',
  'solar:Saturn',
  'asterism:chinese:039',
  'constellation:Ori',
  'deep-sky:m45',
];
const normalized = (text) =>
  String(text)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
let directory;

export function referenceCategory(id) {
  if (id.startsWith('group:')) return 'sky-group';
  const prefix = id.split(':', 1)[0];
  return ['hip', 'tycho', 'gaia'].includes(prefix) ? 'star' : prefix;
}

export async function loadReferenceLibrary() {
  const sky = await ensureSkyCulture('chinese');
  if (directory) return directory;
  const groups = new Map(sky.groups.map((row) => [row.id, row]));
  for (const [id, labels] of Object.entries(symbols))
    groups.set(id, {
      id,
      type: 'symbol',
      names: Object.fromEntries(languages.map((lang, i) => [lang, labels[i]])),
    });
  const formations = new Map(sky.asterisms.map((row) => [row.targetId, row]));
  const groupsByTerm = [...groups.values()].map((g) => ({
    id: 'group:' + g.id,
    terms: [
      g.id,
      g.pinyin,
      ...Object.values(g.names),
      ...(groupAliases[g.type] || []),
      ...(g.id === 'azuredragon' ? ['青龙', '東方青龍', '东方青龙'] : []),
    ]
      .filter(Boolean)
      .map(normalized),
  }));
  const ids = [
    ...solarBodyIds.map((body) => 'solar:' + body),
    ...groupsByTerm.map((g) => g.id),
    ...catalogTargetIds().map(readingTargetId),
  ];
  const known = new Set(ids);
  const ordered = [...new Set([...firstReads.filter((id) => known.has(id)), ...ids])];
  const byCategory = new Map(Object.keys(referenceCategories).map((key) => [key, []]));
  for (const id of ordered) byCategory.get(referenceCategory(id))?.push(id);
  byCategory.set('all', ordered);
  let westernLandmarks;
  function constellationLandmarks(id) {
    if (!westernLandmarks) {
      westernLandmarks = new Map();
      const add = (region, key) => {
        if (!westernLandmarks.has(region)) westernLandmarks.set(region, []);
        westernLandmarks.get(region).push(key);
      };
      for (const star of getSkyCulture('western').stars) {
        if (!star.major) continue;
        const region = westernRegion(equatorial(star.ra, star.dec));
        if (region) add(region.targetId, 'hip:' + star.id);
      }
      for (const object of DEEP_SKY_OBJECTS) {
        if (object.constellation && (/^M\d+$/.test(object.id) || object.name !== object.id))
          add(
            'constellation:' + object.constellation,
            readingTargetId('deep-sky:' + object.id.toLowerCase())
          );
      }
    }
    return westernLandmarks.get(id) || [];
  }

  function search(text, category = 'all') {
    const raw = text.trim(),
      q = normalized(raw);
    if (!raw) return byCategory.get(category) || [];
    if (!q) return [];
    const groupHits = groupsByTerm
      .filter(({ terms }) => terms.some((term) => term.includes(q)))
      .sort((a, b) => Number(b.terms.includes(q)) - Number(a.terms.includes(q)));
    const catalogue = matchingTargetIds(raw, 'chinese').map(readingTargetId);
    const results = new Set([
      ...(known.has(raw) ? [raw] : []),
      ...groupHits.filter((g) => g.terms.includes(q)).map((g) => g.id),
      ...searchSolarTargets(raw, 'en').map((item) => item.id),
      ...catalogue,
      ...groupHits.map((g) => g.id),
    ]);
    return [...results].filter(
      (id) => known.has(id) && (category === 'all' || category === referenceCategory(id))
    );
  }
  function subject(id, language) {
    id = readingTargetId(id);
    const category = referenceCategory(id);
    if (category === 'solar') {
      const body = id.slice(6);
      return solarBodyIds.includes(body)
        ? { id, type: 'solar', body, name: solarLabel(body, language) }
        : null;
    }
    if (category === 'sky-group') return formationSubject(groups.get(id.slice(6)), language);
    if (category === 'asterism') return formationSubject(formations.get(id), language);
    return getXuntianTarget(id, language);
  }
  function related(id, target) {
    let links = [];
    if (target.type === 'sky-group') {
      const g = target.record;
      if (g.asterismIds) {
        if (Object.hasOwn(symbols, g.theme)) links.push('group:' + g.theme);
        links.push(...g.asterismIds.map((n) => 'asterism:chinese:' + n));
      } else
        links = sky.groups
          .filter((child) => child.theme === g.id)
          .map((child) => 'group:' + child.id);
    } else if (target.type === 'asterism') {
      const r = target.record;
      links.push('group:' + r.groupId);
      if (r.parentId) links.push('asterism:chinese:' + r.parentId);
      links.push(
        ...sky.asterisms.filter((other) => other.parentId === r.id).map((other) => other.targetId)
      );
      links.push(
        ...(r.primaryMemberHips || []).map((hip) => 'hip:' + hip),
        ...(r.primaryMemberObjectIds || []).map((key) =>
          key.startsWith('deep:') ? getXuntianTarget(key)?.id : key
        )
      );
    } else if (target.type === 'constellation') {
      links = constellationLandmarks(id);
    } else if (target.direction && ['star', 'deep-sky'].includes(target.type)) {
      const region = westernRegion(target.direction);
      if (region) links.push(region.targetId);
      links.push(...chineseAsterismsForTarget(id).map((r) => r.targetId));
    }
    return [...new Set(links)].filter((key) => key !== id && known.has(key));
  }
  directory = { search, subject, related };
  return directory;
}
