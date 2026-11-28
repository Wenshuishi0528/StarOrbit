import { ensureSkyCulture, getSkyCulture } from './sky-cultures.js';
import { t } from './i18n.js';
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
import {
  hipObservations,
  matchObservingDesignation,
  tychoObservations,
} from './stellar-observing-records.js';
import {
  WESTERN_CONSTELLATION_CATEGORIES,
  WESTERN_SKY_POSITIONS,
  westernConstellationCategory,
  westernSkyPosition,
} from './western-constellation-categories.js';

export const referenceCategories = {
  all: '全部类别',
  asterism: '中国星官',
  'sky-group': '传统天区',
  constellation: '西方星座',
  star: '恒星',
  solar: '太阳系天体',
  'deep-sky': '深空天体',
};
export const constellationFilters = [
  { label: '按星图来历', options: WESTERN_CONSTELLATION_CATEGORIES },
  { label: '按天球位置', options: WESTERN_SKY_POSITIONS },
  {
    label: '按黄道查看',
    options: [
      { id: 'zodiac', label: '传统黄道十二星座' },
      { id: 'ecliptic', label: '黄道经过的十三星座' },
    ],
  },
];
export const constellationNotes = {
  all: '从地球看，猎户腰带的三颗星几乎排成直线，实际却离我们远近不同。今天的猎户座包括腰带周围一整片有边界的天区。这样的天区共 88 个，合起来覆盖全天。',
  classical:
    '公元二世纪，托勒密在星表中列出 48 个星座。这里收录其中 47 个，古代南船座的三个现代星座另列一组。',
  'early-atlases':
    '航海者记录南天，制图者也在旧星图中辨出新的图形。这一组包括逐渐独立成座的后发座和南十字座。',
  hevelius: '十七世纪，赫维留斯在格但斯克观测和绘制星图。他增设的星座中，有七个沿用至今。',
  lacaille: '十八世纪，拉卡伊在好望角测量南天。他把望远镜、显微镜等科学仪器画进了星图。',
  argo: '古代南船座画的是阿尔戈号。今天，船底、船尾和船帆各自拥有星座边界。',
  north:
    '把地球赤道向天空延伸，就得到天赤道。大熊座等这些天区全部位于它的北侧。在北半球，越靠近北天极的星，越容易整夜留在地平线上方。',
  equatorial:
    '天赤道穿过这些星座的边界。猎户座的腰带就在这条线附近，在南北半球的大部分地方都能找到。这一分组按 J2000 星图的位置计算。',
  south:
    '南十字座等这些天区全部位于天赤道南侧。观察者所在的纬度决定能看到其中多少。例如，向南旅行时，南天极和它附近的星会在南方地平线上逐渐升高。',
  zodiac:
    '传统黄道十二星座从白羊座依次排到双鱼座。十二宫把黄道等分，各天文星座在黄道上所占的范围则有大有小。',
  ecliptic:
    '从地球看，太阳一年中在恒星背景上走过的路径叫黄道。按现代边界，太阳离开天蝎座后还会经过蛇夫座，再进入人马座。',
};
// In order along the ecliptic from Aries. Ophiuchus lies between Scorpius and Sagittarius.
const ecliptic = 'Ari Tau Gem Cnc Leo Vir Lib Sco Oph Sgr Cap Aqr Psc'
  .split(' ')
  .map((id) => 'constellation:' + id);
const constellationGroupAliases = {
  classical: ['古典星座', '托勒密', 'Ptolemy', 'Ptolémée', 'Птолемей'],
  'early-atlases': ['航海时代', '早期星图'],
  hevelius: ['赫维留斯', 'Hevelius', 'Hévélius', 'Гевелий'],
  lacaille: ['拉卡伊', 'Lacaille', 'Лакайль'],
  argo: ['南船座', 'Argo Navis', 'Navire Argo', 'Корабль Арго'],
  north: ['北天', '北天星座', 'northern sky', 'ciel boréal', 'северное небо'],
  equatorial: ['天赤道', '赤道星座', 'celestial equator', 'équateur céleste', 'небесный экватор'],
  south: ['南天', '南天星座', 'southern sky', 'ciel austral', 'южное небо'],
  zodiac: ['十二星座', '黄道十二星座', '黄道十二宫', 'zodiac', 'zodiaque', 'зодиак'],
  ecliptic: ['黄道', '黄道十三星座', 'ecliptic', 'écliptique', 'эклиптика'],
};
const constellationOptions = constellationFilters.flatMap((group) => group.options);
export function constellationHistoryLabel(targetId) {
  const group = westernConstellationCategory(targetId.slice('constellation:'.length));
  return WESTERN_CONSTELLATION_CATEGORIES.find(({ id }) => id === group)?.label;
}
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
  'asterism:chinese:039',
  'constellation:Ori',
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
  const constellations = byCategory.get('constellation');
  const westernRecords = getSkyCulture('western').asterisms;
  const constellationLists = new Map([
    ['all', constellations],
    ...WESTERN_CONSTELLATION_CATEGORIES.map(({ id }) => [
      id,
      constellations.filter(
        (key) => westernConstellationCategory(key.slice('constellation:'.length)) === id
      ),
    ]),
    ...WESTERN_SKY_POSITIONS.map(({ id }) => [
      id,
      westernRecords.filter((record) => westernSkyPosition(record) === id).map((r) => r.targetId),
    ]),
    ['ecliptic', ecliptic],
    ['zodiac', ecliptic.filter((key) => key !== 'constellation:Oph')],
  ]);
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

  function search(text, category = 'all', constellationFilter = 'all') {
    const raw = text.trim(),
      q = normalized(raw);
    const subset =
      category === 'constellation'
        ? constellationLists.get(constellationFilter)
        : byCategory.get(category);
    if (!subset) return [];
    if (!raw) return subset;
    if (!q) return [];
    const groupHits = groupsByTerm
      .filter(({ terms }) => terms.some((term) => term.includes(q)))
      .sort((a, b) => Number(b.terms.includes(q)) - Number(a.terms.includes(q)));
    const catalogue = [
      ...matchObservingDesignation(raw),
      ...matchingTargetIds(raw, 'chinese').map(readingTargetId),
    ];
    const westernGroup =
      (category === 'all' || category === 'constellation') &&
      constellationOptions.find(({ id, label }) =>
        [label, t(label), ...constellationGroupAliases[id]].some((term) => normalized(term) === q)
      );
    const results = new Set([
      ...(known.has(raw) ? [raw] : []),
      ...groupHits.filter((g) => g.terms.includes(q)).map((g) => g.id),
      ...searchSolarTargets(raw, 'en').map((item) => item.id),
      ...catalogue,
      ...(westernGroup ? constellationLists.get(westernGroup.id) : []),
      ...groupHits.map((g) => g.id),
    ]);
    return [...results].filter(
      (id) =>
        known.has(id) &&
        (category === 'all' || category === referenceCategory(id)) &&
        (category !== 'constellation' || subset.includes(id))
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
    const target = getXuntianTarget(id, language);
    if (!target || category !== 'star') return target;
    if (id.startsWith('hip:')) {
      const hd = hipObservations(id.slice(4))?.[1];
      if (hd) return { ...target, referenceDesignation: 'HD ' + hd };
    }
    if (id.startsWith('tycho:')) {
      const record = tychoObservations(id);
      if (record) return { ...target, name: 'TYC ' + record.slice(0, 3).join('-') };
    }
    return target;
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
