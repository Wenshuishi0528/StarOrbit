import {
  mansions,
  regions,
  symbols,
  figures,
  historicalNotes,
  regionObserving,
} from './chinese-sky-reading-content.js';
import profiles from './chinese-sky-profiles.json' with { type: 'json' };

// The data remain in the lazy-loaded culture. Index its actual primary members once.
const indexes = new WeakMap();
const languages = ['zh', 'en', 'fr', 'ru'];
const museum = 'https://hk.space.museum/en/web/spm/resources/';
const sourceLinks = {
  jin: {
    name: [
      '《晋书》卷十一 · 天文志',
      'Book of Jin · Astronomy, vol. 11',
      'Livre des Jin · Astronomie, vol. 11',
      'Книга Цзинь · Астрономия, цз. 11',
    ],
    url: 'https://zh.wikisource.org/zh-hant/晉書/卷011',
  },
  song49: songVolume(49, '四十九'),
  song50: songVolume(50, '五十'),
  song51: songVolume(51, '五十一'),
  fuYue: {
    name: [
      '《史记》· 殷本纪',
      'Records of the Grand Historian · Annals of Yin',
      'Mémoires historiques · Annales des Yin',
      'Исторические записки · Основные записи об Инь',
    ],
    url: 'https://ctext.org/text.pl?if=gb&node=4563&remap=gb&show=parallel',
  },
  shiji: {
    name: [
      '《史记》· 天官书',
      'Shiji · Treatise on the Celestial Officials',
      'Mémoires historiques · Traité des officiers célestes',
      'Исторические записки · Трактат о небесных чиновниках',
    ],
    url: 'https://ctext.org/text.pl?if=en&node=5592&show=parallel',
  },
  xunzi: {
    name: [
      '《荀子》· 解蔽',
      'Xunzi · Dispelling Obsession',
      'Xunzi · Dissiper les illusions',
      'Сюнь-цзы · Об избавлении от заблуждений',
    ],
    url: 'https://zh.wikisource.org/zh-hant/荀子/解蔽篇',
  },
  etaCar: {
    name: 'NASA · Eta Carinae',
    url: 'https://science.nasa.gov/asset/hubble/eta-carinae-the-great-eruption-of-a-massive-star/',
  },
  alphaCen: {
    name: 'NASA · Alpha Centauri',
    url: 'https://science.nasa.gov/resource/the-bright-star-alpha-centauri-and-its-surroundings/',
  },
  catalogue: {
    name: 'Stellarium · 中国星官',
    url: 'https://github.com/Stellarium/stellarium/blob/3c4a720f313ada6124b86fef24131fa65900133f/skycultures/chinese/description.md#the-list-of-xingguans',
  },
  mansions: {
    name: 'Stellarium · 二十八宿',
    url: 'https://github.com/Stellarium/stellarium/blob/3c4a720f313ada6124b86fef24131fa65900133f/skycultures/chinese/description.md#twenty-eight-mansions',
  },
  southern: {
    name: 'Stellarium · 近南极星区',
    url: 'https://github.com/Stellarium/stellarium/blob/3c4a720f313ada6124b86fef24131fa65900133f/skycultures/chinese/description.md#the-southern-sky',
  },
  deep: {
    name: 'Stellarium · NGC',
    url: 'https://github.com/Stellarium/stellarium/blob/3c4a720f313ada6124b86fef24131fa65900133f/skycultures/chinese/description.md#deep-space-objects',
  },
  enclosures: {
    name: 'Stellarium · 三垣',
    url: 'https://github.com/Stellarium/stellarium/blob/3c4a720f313ada6124b86fef24131fa65900133f/skycultures/chinese/description.md#three-enclosures',
  },
  symbols: {
    name: 'British Library · International Dunhuang Programme',
    url: 'https://idp.bl.uk/discover/learning/chinese-astronomy/articles/the-chinese-sky/the-regions-of-the-sky/',
  },
  starlore: {
    name: 'Hong Kong Space Museum',
    url: museum + 'teachers-corner/constellations-and-myths/chinese-starlore.html',
  },
  glossary: {
    name: 'Hong Kong Space Museum',
    url:
      museum +
      'teachers-corner/constellations-and-myths/glossary-of-chinese-star-regions-asterisms-and-star-names.html',
  },
  qixi: {
    name: 'Hong Kong Space Museum',
    url: museum + 'curators-blog/2020/08/chinese-valentine-s-day-when-altair-and-vega-meet.html',
  },
  polaris: {
    name: 'NASA',
    url: 'https://science.nasa.gov/solar-system/skywatching/what-is-the-north-star-and-how-do-you-find-it/',
  },
  hyades: {
    name: 'NASA',
    url: 'https://science.nasa.gov/solar-system/skywatching/night-sky-network/spot-the-young-stars-of-the-hyades-and-pleiades/',
  },
  algol: { name: 'AAVSO', url: 'https://mintaka.aavso.org/vsots_betaper' },
  crab: {
    name: 'NASA',
    url: 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-1/',
  },
  deneb: {
    name: 'NASA',
    url: 'https://science.nasa.gov/solar-system/skywatching/night-sky-network/summer-triangle-corner-deneb/',
  },
  arcturus: { name: 'NASA', url: 'https://science.nasa.gov/resource/whats-up-september-2021/' },
};
function nameOf(row, lang) {
  if (!row) return '';
  const local = row.names?.[lang] || row[lang];
  // The fixed catalogue deliberately uses the English gloss for unknown French
  // or Russian names. Prefer the attested Chinese proper name in romanisation.
  if ((lang === 'fr' || lang === 'ru') && local === row.en)
    return row.pinyin || row.sourceNames?.[0]?.pronounce || local || row.id;
  return local || row.en || row.id || '';
}
function songVolume(volume, chineseNumeral) {
  return {
    name: [
      '《宋史》卷' + chineseNumeral + ' · 天文志',
      'History of Song · Astronomy, vol. ' + volume,
      'Histoire des Song · Astronomie, vol. ' + volume,
      'История Сун · Астрономия, цз. ' + volume,
    ],
    url: 'https://zh.wikisource.org/zh-hant/宋史/卷0' + volume,
  };
}
function sourceLink(key, i) {
  const link = sourceLinks[key];
  if (Array.isArray(link.name)) return { name: link.name[i], url: link.url };
  const name =
    link.name.startsWith('Stellarium') && i !== 0
      ? [
          '',
          'Stellarium · Chinese sky catalogue',
          'Stellarium · Catalogue du ciel chinois',
          'Stellarium · Каталог китайского неба',
        ][i]
      : link.name === 'Hong Kong Space Museum' && i !== 1
        ? ['香港太空馆', '', 'Musée de l’espace de Hong Kong', 'Гонконгский музей космоса'][i]
        : link.name;
  return {
    name,
    url:
      i === 0 && link.name === 'Hong Kong Space Museum'
        ? link.url.replace('/en/', '/sc/')
        : link.url,
  };
}
function sourceList(keys, i) {
  return [...new Set(keys.filter(Boolean))].map((key) => sourceLink(key, i));
}
const languageIndex = (lang) => (languages.includes(lang) ? languages.indexOf(lang) : 1);
const first = (row) => row?.replace(/[(（].*$/u, '').trim();
const joinSentences = (parts, i) => parts.filter(Boolean).join(i === 0 ? '' : ' ');
const wrapName = (s, i) => (i === 0 ? s : i === 2 || i === 3 ? '«' + s + '»' : s);
const angular = (a, b) => {
  const r = Math.PI / 180;
  const half =
    Math.sin(((a.dec - b.dec) * r) / 2) ** 2 +
    Math.cos(a.dec * r) * Math.cos(b.dec * r) * Math.sin(((a.ra - b.ra) * r) / 2) ** 2;
  return (2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, half))))) / r;
};
const number = (n, i) => n.toLocaleString(languages[i], { maximumFractionDigits: n < 1 ? 2 : 1 });
function indexOf(culture) {
  if (
    !culture ||
    culture.id !== 'chinese' ||
    !Array.isArray(culture.asterisms) ||
    !Array.isArray(culture.stars) ||
    !Array.isArray(culture.groups)
  )
    return null;
  if (!indexes.has(culture)) {
    const asterisms = new Map(culture.asterisms.map((a) => [a.id, a]));
    const stars = new Map(
      [...culture.stars, ...(culture.otherStars || []), ...(culture.namedObjects || [])].map(
        (s) => [s.physicalId || s.id, s]
      )
    );
    const groups = new Map(culture.groups.map((g) => [g.id, g]));
    const mainByGroup = new Map(),
      neighbours = new Map();
    for (const g of culture.groups) {
      const family = g.asterismIds.map((id) => asterisms.get(id)).filter(Boolean);
      const name = family.find((a) => a.zh === g.zh);
      if (name) mainByGroup.set(g.id, name);
      for (const a of family) {
        const neighbour = family
          .filter((b) => b !== a && !b.isSubsidiary)
          .map((b) => ({ b, distance: angular(a, b) }))
          .sort((x, y) => x.distance - y.distance)[0];
        if (neighbour) neighbours.set(a.id, neighbour);
      }
    }
    indexes.set(culture, { asterisms, stars, groups, mainByGroup, neighbours });
  }
  return indexes.get(culture);
}
function primary(a) {
  const primaryIds = new Set([
    ...a.primaryMemberHips.map((id) => 'hip:' + id),
    ...a.primaryMemberObjectIds,
  ]);
  return a.members
    .filter((m) => primaryIds.has(m.physicalId))
    .sort((x, y) => (x.mag ?? Infinity) - (y.mag ?? Infinity));
}
function identity(a, index, i) {
  const group = index.groups.get(a.groupId);
  const g = wrapName(nameOf(group, languages[i]), i);
  const aName = wrapName(first(nameOf(a, languages[i])), i);
  if (a.parentId) {
    const p = wrapName(first(nameOf(index.asterisms.get(a.parentId), languages[i])), i);
    return [
      aName + '附属于' + p + '，在' + g + '中另有自己的定位点。',
      aName +
        ' is a subsidiary of ' +
        p +
        ' in the ' +
        g +
        '. Its position is catalogued separately.',
      aName +
        ' est une figure annexe de ' +
        p +
        ' dans ' +
        g +
        '. Sa position est répertoriée séparément.',
      aName +
        ' — подчинённая фигура ' +
        p +
        ' в области ' +
        g +
        '. В каталоге её положение указано отдельно.',
    ][i];
  }
  if (group.type === 'southern') {
    return [
      aName + '是近南极星区的星官之一，属于晚明参照欧洲南天星图补入、清代星表沿用的一组。',
      aName +
        ' belongs to the far-southern figures introduced from European sky charts in the late Ming period and retained in Qing catalogues.',
      aName +
        ' appartient aux figures du ciel austral introduites d’après des cartes européennes à la fin des Ming et reprises dans les catalogues des Qing.',
      aName +
        ' входит в число южных фигур, добавленных по европейским картам в конце эпохи Мин и сохранённых каталогами эпохи Цин.',
    ][i];
  }
  return [
    aName + '位于' + g + '。',
    aName + ' is a figure in the ' + nameOf(group, 'en') + '.',
    aName + ' figure parmi les astérismes de ' + g + '.',
    aName + ' входит в число астеризмов области ' + g + '.',
  ][i];
}
function membershipNote(a, i) {
  const { state, expected, resolved, uncertainPhysicalIds } = a.primaryMemberStatus;
  if (state === 'complete' && !uncertainPhysicalIds.length) return '';
  const counts =
    state === 'complete'
      ? ''
      : [
          '原表记有' + expected + '个主成员，按现有标识可以核实' + resolved + '个。',
          'The source table gives ' +
            expected +
            ' principal objects, while ' +
            resolved +
            ' can be identified in this edition.',
          'La table indique ' +
            expected +
            ' objets principaux. Cette édition en identifie ' +
            resolved +
            '.',
          'В исходной таблице указано ' +
            expected +
            ' основных объектов. В этой версии удалось отождествить ' +
            resolved +
            '.',
        ][i];
  const n = uncertainPhysicalIds.length;
  const uncertain = n
    ? [
        '其中有' + n + '项识别带有问号。',
        'A question mark accompanies ' + n + ' of the identifications.',
        'Un point d’interrogation accompagne ' + n + ' des identifications.',
        'Число отождествлений, отмеченных вопросительным знаком, — ' + n + '.',
      ][i]
    : '';
  return joinSentences([counts, uncertain], i);
}
function memberName(m, index, i) {
  const row = index.stars.get(m.physicalId);
  return (
    nameOf(row, languages[i]) || (m.physicalId.startsWith('hip:') ? 'HIP ' + m.id : String(m.id))
  );
}
function geometry(a, index, i, featured) {
  const points = primary(a);
  if (!points.length) return '';
  const head = points[0],
    display = wrapName(memberName(head, index, i), i);
  const mag = Number.isFinite(head.mag) ? number(head.mag, i) : null;
  if (points.length === 1) {
    const near = index.neighbours.get(a.id);
    const id = head.physicalId.startsWith('hip:')
      ? 'HIP ' + head.id
      : head.physicalId.replace(/^gaia:/u, 'Gaia DR3 ');
    const one =
      head.kind === 'deep'
        ? ''
        : [
            '本体由恒星 ' + id + ' 定位' + (mag ? '，星表视星等为 ' + mag : '') + '。',
            'The star ' +
              id +
              ' marks the figure' +
              (mag ? ', with catalogue apparent magnitude ' + mag : '') +
              '.',
            'L’étoile ' +
              id +
              ' marque la figure' +
              (mag ? ', avec une magnitude apparente de ' + mag : '') +
              '.',
            'Положение отмечает звезда ' +
              id +
              (mag ? ' с видимой звёздной величиной ' + mag : '') +
              '.',
          ][i];
    if (!near) return one;
    const n = wrapName(first(nameOf(near.b, languages[i])), i),
      d = number(near.distance, i);
    return joinSentences(
      [
        one,
        [
          '从这点到同区' + n + '星形的中心约 ' + d + '°，可以用它作参照。',
          'The centre of the nearby ' +
            first(nameOf(near.b, 'en')) +
            ' figure lies about ' +
            d +
            '° away and makes a useful landmark.',
          'Le centre de la figure voisine ' +
            n +
            ' se trouve à environ ' +
            d +
            '° et sert de repère.',
          'Центр соседней фигуры ' + n + ' находится примерно в ' + d + '° и служит ориентиром.',
        ][i],
      ],
      i
    );
  }
  let extent = 0,
    ends;
  for (let j = 1; j < points.length; j++)
    for (let k = 0; k < j; k++) {
      const separation = angular(points[j], points[k]);
      if (separation > extent) {
        extent = separation;
        ends = [points[k], points[j]];
      }
    }
  if (!ends) return '';
  const d = number(extent, i);
  if (featured) {
    const [one, two] = ends.map((point) => wrapName(memberName(point, index, i), i));
    return [
      '以两端的' + one + '和' + two + '作尺，两点的角距约 ' + d + '°，可用来选择观察全图的视场。',
      'The two outermost members, ' +
        one +
        ' and ' +
        two +
        ', are about ' +
        d +
        '° apart, a useful scale when framing the full pattern.',
      'Les deux membres les plus éloignés, ' +
        one +
        ' et ' +
        two +
        ', sont séparés d’environ ' +
        d +
        '°, un repère pour cadrer tout le dessin.',
      'Самые удалённые друг от друга звёзды, ' +
        one +
        ' и ' +
        two +
        ', разделены примерно на ' +
        d +
        '°. Этот угол помогает выбрать поле зрения для всей фигуры.',
    ][i];
  }
  if (points.length === 2) {
    return [
      '主图上的两颗星相距约 ' +
        d +
        '°。' +
        display +
        '较亮' +
        (mag ? '，视星等为 ' + mag : '') +
        '，由它出发就能估出寻找另一颗星所需的视场。',
      'The two stars stand about ' +
        d +
        '° apart. ' +
        display +
        ' is the brighter member' +
        (mag ? ' at magnitude ' + mag : '') +
        ', a useful starting point for locating its companion.',
      'Les deux étoiles sont distantes d’environ ' +
        d +
        '°. ' +
        display +
        ' est la plus brillante' +
        (mag ? ', de magnitude ' + mag : '') +
        ', un bon point de départ pour trouver sa voisine.',
      'Две звезды разделяют около ' +
        d +
        '°. Более яркая, ' +
        display +
        (mag ? ' со звёздной величиной ' + mag : '') +
        ', служит отправной точкой при поиске второй.',
    ][i];
  }
  const lead = [
    '找图时可以先认' + display,
    'Start with ' + display,
    'Prenez ' + display + ' comme repère',
    'Начните поиск со звезды ' + display,
  ][i];
  const brightness = mag
    ? [
        '，视星等约 ' + mag,
        ' at apparent magnitude ' + mag,
        ', de magnitude apparente ' + mag,
        ' с видимой величиной ' + mag,
      ][i]
    : '';
  const n = points.length;
  const endNames = ends.map((point) => wrapName(memberName(point, index, i), i));
  const lines = a.lines.filter(
    (line) => line.length > 1 && line.some((p) => p[0] !== line[0][0] || p[1] !== line[0][1])
  );
  if (lines.length === 1 && n <= 7) {
    const [one, two] = endNames;
    return [
      lead +
        brightness +
        '。主图沿一笔星线展开，跨度最大的一对是' +
        one +
        '与' +
        two +
        '，相隔约 ' +
        d +
        '°。',
      lead +
        brightness +
        '. A single connected trace marks the figure. Its widest pair, ' +
        one +
        ' and ' +
        two +
        ', is about ' +
        d +
        '° apart.',
      lead +
        brightness +
        '. Un seul tracé continu dessine la figure. Sa paire la plus espacée, ' +
        one +
        ' et ' +
        two +
        ', mesure environ ' +
        d +
        '°. ',
      lead +
        brightness +
        '. Фигуру очерчивает одна непрерывная линия. Самая широкая пара, ' +
        one +
        ' и ' +
        two +
        ', разделена примерно на ' +
        d +
        '°.',
    ][i].trim();
  }
  return [
    lead +
      brightness +
      '。' +
      n +
      '个已识别主成员中，最远的两点在天空上相距约 ' +
      d +
      '°，用稍宽的视场能看清全形。',
    lead +
      brightness +
      '. The most widely separated pair among the ' +
      n +
      ' identified principal objects spans about ' +
      d +
      '°, which gives a scale for framing the whole figure.',
    lead +
      brightness +
      '. Les deux points les plus éloignés parmi les ' +
      n +
      ' objets principaux identifiés sont distants d’environ ' +
      d +
      '°, un repère pour cadrer toute la figure.',
    lead +
      brightness +
      '. Из ' +
      n +
      ' основных объектов наиболее удалённые друг от друга разделены на небе примерно на ' +
      d +
      '°. Этот угол помогает подобрать поле зрения.',
  ][i];
}
export function readChineseAsterism(record, culture, language = 'zh') {
  const index = indexOf(culture);
  if (!index || !record || (record.culture && record.culture !== 'chinese')) return null;
  const id = String(record.id ?? record).replace(/^(?:asterism:chinese:|CON chinese )/u, '');
  const a = index.asterisms.get(id);
  if (!a) return null;
  const i = languageIndex(language),
    central = index.mainByGroup.get(a.groupId) === a;
  const ref = central ? mansions[a.groupId] : figures[a.id];
  const link =
    central && ref
      ? ['shen', 'xin', 'niu'].includes(a.groupId)
        ? 'starlore'
        : ['mao', 'bi-net'].includes(a.groupId)
          ? 'hyades'
          : a.groupId === 'gui'
            ? 'deep'
            : 'mansions'
      : ref?.[0] || (a.groupId === 'southern' ? 'southern' : 'catalogue');
  const history = historyReferences.filter(([, ids]) => ids.has(a.id)).map(([key]) => key);
  const sources = sourceList(
    [
      ...history,
      extraReferences[a.id],
      link,
      !history.length && link === 'catalogue' && 'glossary',
      'catalogue',
    ],
    i
  );
  const detail = historicalNotes[a.id]?.[i] || (fieldNotes.has(a.id) ? ref?.[i + 1] : '');
  const note = ['029', '090', '186'].includes(a.id) ? '' : membershipNote(a, i);
  return {
    description: profiles[a.id]?.[i] || identity(a, index, i),
    detail: joinSentences([detail, note], i),
    observing: joinSentences([identity(a, index, i), geometry(a, index, i, Boolean(ref))], i),
    sources,
    link: sources[0],
  };
}
// Historic assignments vary between texts. Cite the chapter used by each
// article separately from the Qing-based catalogue that supplies the sky positions.
const historyReferences = [
  [
    'jin',
    '002 003 004 005 006 008 009 011 012 014 016 017 018 023 025 028 029 040 048 065 066 069 072 077 081 084 086 093 096 102 104 105 106 107 110 112 114 115 122 124 136 149 163 185 193 195 206 213 215 216 222 226 229 232 233 254 256 263 266 269 273 280 294 307 308 312 313 314 316 318',
  ],
  [
    'song49',
    '039 041 045 052 057 059 067 080 083 087 098 101 117 131 132 140 142 152 153 155 159 160 165 175 176 178 179 180 181 189 190 200 202 203 205 208 212 214 223 228 235 237 241 248 255 257 265 267 270 274 276 279 283 285 292 297 310',
  ],
  [
    'song50',
    '036 037 038 042 054 055 058 060 064 068 070 073 074 075 078 089 095 100 108 111 116 121 129 130 137 138 143 151 156 158 162 167 169 174 186 194 196 197 198 206 209 217 218 220 236 239 240 243 245 246 251 259 271 272 277 281 287 288 289 290 295 296 299 301 302 306 309 317',
  ],
  [
    'song51',
    '053 104 118 119 133 139 154 171 172 188 191 207 210 211 219 221 224 225 230 231 238 242 244 247 249 250 252 253 260 261 262 273 278 282 286 291 293 298 315',
  ],
].map(([key, ids]) => [key, new Set(ids.split(' '))]);
const extraReferences = {
  '062': 'algol',
  '075': 'jin',
  '078': 'fuYue',
  '090': 'etaCar',
  '093': 'qixi',
  '151': 'alphaCen',
  '265': 'shiji',
  '272': 'xunzi',
  '296': 'xunzi',
};
// Preserve measured identifications and source disagreements beyond the opening text.
const fieldNotes = new Set(
  '012 029 039 041 080 083 090 101 110 130 137 186 220 222 228 232 249 278 299 300'.split(' ')
);
export function readChineseGroup(group, culture, language = 'zh') {
  const index = indexOf(culture);
  if (!index || !group || (group.culture && group.culture !== 'chinese')) return null;
  const id = String(group.id ?? group),
    i = languageIndex(language);
  if (Object.hasOwn(symbols, id)) {
    const sources = [sourceLink('symbols', i), sourceLink('mansions', i)];
    return {
      description: regions[id][i],
      observing: regionObserving[id][i],
      link: sources[0],
      sources,
    };
  }
  const g = index.groups.get(id);
  if (!g) return null;
  if (g.type !== 'mansion') {
    const sources = sourceList(
      g.type === 'southern' ? ['southern', 'glossary'] : ['song49', 'enclosures', 'glossary'],
      i
    );
    return {
      description: regions[id][i],
      observing: regionObserving[id][i],
      link: sources[0],
      sources,
    };
  }
  const ref = mansions[id],
    symbol = symbols[g.theme][i];
  const anchor = ref[0],
    name = nameOf(g, languages[i]);
  const place =
    culture.groups
      .filter((other) => other.theme === g.theme)
      .findIndex((other) => other.id === id) + 1;
  const head = [
    name + '列在' + symbol + '七宿的第' + place + '位。',
    name + ' is number ' + place + ' in the seven mansions of the ' + symbol + '.',
    name + ' occupe la position ' + place + ' parmi les sept loges de la figure ' + symbol + '.',
    name + ' занимает место ' + place + ' среди семи стоянок фигуры «' + symbol + '».',
  ][i];
  const end = [
    '本版采用的距星是 ' + anchor + '，古人用距星标定天体沿赤道方向的位置。',
    'This edition uses ' +
      anchor +
      ' as the mansion’s reference star. Such stars provided a baseline for measuring positions along the celestial equator.',
    'Cette édition prend ' +
      anchor +
      ' pour étoile de référence. Ces étoiles servaient d’origine pour mesurer les positions le long de l’équateur céleste.',
    'В этой версии опорная звезда стоянки — ' +
      anchor +
      '. От таких звёзд отсчитывали положение светил вдоль небесного экватора.',
  ][i];
  const neighbourNames = g.asterismIds
    .filter((key) => key !== index.mainByGroup.get(id)?.id)
    .map((key) => index.asterisms.get(key))
    .filter((row) => row && !row.isSubsidiary)
    .slice(0, 3)
    .map((row) => first(nameOf(row, languages[i])));
  const list = new Intl.ListFormat(languages[i]).format(neighbourNames);
  const neighbours = !list
    ? ''
    : [
        '同属这一宿区的还有' + list + '。它们各有自己的星形，可以作为游览这一带的下一站。',
        'The region also includes ' + list + ', each a separate figure to explore.',
        'La région comprend aussi ' + list + ', autant de figures distinctes à découvrir.',
        'В эту область также входят ' +
          list +
          '. Каждая из этих фигур имеет собственный звёздный рисунок.',
      ][i];
  const sources = [sourceLink('mansions', i), sourceLink('jin', i)];
  return {
    description: joinSentences([head, ref[i + 1]], i),
    detail: neighbours,
    observing: end,
    link: sources[0],
    sources,
  };
}
