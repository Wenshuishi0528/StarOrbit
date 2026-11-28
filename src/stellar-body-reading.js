import chart from '../assets/star-chart.json' with { type: 'json' };
import { equatorial } from './environment-math.js';
import { westernRegion, skyAngles } from './sky-location-math.js';
import { cultureObjectLabel } from './sky-cultures.js';
import { stellarProfiles, stellarNotes } from './stellar-featured-reading.js';
import { starHistory } from './stellar-catalogue-history-reading.js';
import { standardStarNames } from './stellar-name-register-reading.js';
import { tychoObservations } from './stellar-observing-records.js';
import { solarBodyProfiles, solarIntroductions, solarStories } from './solar-body-reading-data.js';

const chartNames = new Map(chart.stars.filter((s) => s.hasProperName).map((s) => [s.id, s]));

const copy = {
  zh: {
    field: '从地球望去，这颗星落在{region}天区。',
    cataloguedField: '{name} 位于{region}天区。',
    star: '星图用它的天球坐标标出了这个光点的位置。',
    catalogue: '这颗恒星在星表里的标识是 {name}。',
    tychoName: '它在《第谷第二星表》里的编号是 {name}。三段数字依次标记天区、区内序号和星表分量。',
    named: '{name} 是一颗有专名的恒星，在依巴谷星表中能用 {id} 查到它。',
    magnitude: '观测记录给出的 {band} 星等约为 {mag}。',
    beacon: '这样的亮度在星空中相当醒目，适合用来定位邻近较暗的目标。',
    easy: '在晴朗的暗夜里，通常可以从周围的星群中用肉眼认出这种亮度的星。',
    dark: '这样的星光在暗处有机会用肉眼看见，城市的天空背景却容易将它淹没。',
    faint: '这个亮度通常已超出肉眼范围，用双筒望远镜或小望远镜更容易与邻星区分。',
    gaia: 'Gaia 的宽 G 波段收集了从蓝光到近红外的一大段星光。同一波段内，星等数值相差五等，两者的光通量就相差一百倍。',
    colour: '它的 B−V 色指数为 {value}，{tone}。',
    converted: '由 Tycho 的蓝、可见光测量换算，B−V 色指数约为 {value}，{tone}。',
    blue: '观测到的颜色比太阳偏蓝',
    red: '观测到的颜色比太阳偏红',
    neutral: '观测到的颜色与太阳相近',
    distance:
      '从恒星视差估计，它离太阳约 {distance} 光年，今天收到的光在星际空间走了大约这么多年。',
    noDistance: '要知道它和同方向的邻星在空间中究竟相隔多远，还需要可靠的距离测量。',
  },
  en: {
    field: 'On a star chart, this point lies in the region marked {region}.',
    cataloguedField: '{name} lies in the constellation of {region}.',
    star: 'Celestial coordinates mark the position of this point on a star chart.',
    catalogue: 'This star is listed as {name}.',
    tychoName:
      'The Tycho-2 designation is {name}. Its three numbers give the sky region, the entry within that region and the catalogue component.',
    named: '{name} is a named star recorded in the Hipparcos catalogue as {id}.',
    magnitude: 'Its apparent magnitude in the {band} band is about {mag}.',
    beacon:
      'That puts it among the conspicuous lights in the sky and makes it a useful starting point for finding fainter neighbours.',
    easy: 'Under a clear, dark sky, stars of this brightness are usually easy to pick out by eye.',
    dark: 'A dark sky may bring it within reach of the unaided eye, while city lights can easily wash it out.',
    faint:
      'This is usually beyond the unaided eye. Binoculars or a small telescope help separate it from nearby points.',
    gaia: 'Gaia’s broad G band collects light from blue wavelengths into the near infrared. Within that band, five magnitudes correspond to a hundredfold difference in received light.',
    colour: 'Its B−V colour index of {value} places its observed light {tone}.',
    converted:
      'Tycho’s blue and visual measurements give an approximate B−V index of {value}, placing its observed light {tone}.',
    blue: 'on the blue side of the Sun’s colour',
    red: 'on the red side of the Sun’s colour',
    neutral: 'close to the Sun in colour',
    distance:
      'Parallax places it about {distance} light-years from the Sun. The light arriving now has travelled for roughly that many years.',
    noDistance:
      'A reliable distance measurement would show how far along this line of sight the star lies.',
  },
  fr: {
    field: 'Sur une carte du ciel, cette étoile se trouve dans la région indiquée « {region} ».',
    cataloguedField: 'Sur les cartes du ciel, {name} se trouve dans la constellation « {region} ».',
    star: 'Ses coordonnées célestes indiquent la position de ce point sur la carte du ciel.',
    catalogue: 'Cette étoile porte la désignation {name} dans le catalogue.',
    tychoName:
      'Cette étoile est répertoriée sous le numéro {name} dans Tycho-2. Ses trois nombres indiquent la région du ciel, le numéro dans cette région et la composante du catalogue.',
    named: '{name} est le nom de l’étoile inscrite au catalogue Hipparcos sous le numéro {id}.',
    magnitude: 'Sa magnitude apparente en bande {band} est d’environ {mag}.',
    beacon:
      'Son éclat la rend facile à repérer et en fait un bon point de départ pour rechercher des voisines plus faibles.',
    easy: 'Par nuit claire et sombre, une étoile de cet éclat se repère généralement à l’œil nu.',
    dark: 'Un ciel sombre peut la rendre visible à l’œil nu, mais les lumières de la ville la noient facilement.',
    faint:
      'Cet éclat se situe généralement au-delà de la portée de l’œil nu. Des jumelles ou un petit télescope aident à distinguer l’étoile de ses voisines.',
    gaia: 'La large bande G de Gaia recueille la lumière du bleu au proche infrarouge. Dans cette même bande, cinq magnitudes d’écart correspondent à un facteur cent sur le flux reçu.',
    colour: 'Son indice de couleur B−V vaut {value}. {tone}.',
    converted:
      'Les mesures bleue et visuelle de Tycho donnent un indice B−V approché de {value}. {tone}.',
    blue: 'La lumière reçue est plus bleue que celle du Soleil',
    red: 'La lumière reçue est plus rouge que celle du Soleil',
    neutral: 'La lumière reçue a une couleur voisine de celle du Soleil',
    distance:
      'La parallaxe la situe à environ {distance} années-lumière du Soleil. La lumière reçue aujourd’hui a voyagé à peu près autant d’années.',
    noDistance:
      'Une mesure fiable de distance préciserait sa profondeur le long de cette ligne de visée.',
  },
  ru: {
    field: 'На звёздной карте эта точка лежит в области с подписью «{region}».',
    cataloguedField: 'На звёздной карте {name} находится в области с подписью «{region}».',
    star: 'Положение этой точки на звёздной карте задано небесными координатами.',
    catalogue: 'В каталоге эта звезда обозначена как {name}.',
    tychoName:
      'В каталоге Tycho-2 эта звезда обозначена как {name}. Три числа указывают область неба, номер в этой области и обозначение компонента в каталоге.',
    named: '{name} — собственное имя звезды, записанной в каталоге Hipparcos как {id}.',
    magnitude: 'Её видимая величина в полосе {band} — около {mag}.',
    beacon:
      'Такой блеск хорошо выделяет звезду на небе. От неё удобно искать более слабые соседние объекты.',
    easy: 'Ясной тёмной ночью звезду такого блеска обычно легко найти невооружённым глазом.',
    dark: 'В тёмном месте её можно попробовать увидеть без оптики, но городская засветка легко заглушает такой свет.',
    faint:
      'Такой блеск обычно лежит за пределом видимости невооружённого глаза. Бинокль или небольшой телескоп помогает выделить звезду среди соседних точек.',
    gaia: 'Широкая полоса G телескопа Gaia охватывает свет от синего до ближнего инфракрасного. Разность в пять величин в одной полосе означает стократную разницу в потоке света.',
    colour: 'Показатель цвета B−V равен {value}. {tone}.',
    converted:
      'По измерениям Tycho в синей и визуальной полосах показатель B−V приблизительно равен {value}. {tone}.',
    blue: 'Наблюдаемый свет голубее солнечного',
    red: 'Наблюдаемый свет краснее солнечного',
    neutral: 'Наблюдаемый цвет близок к цвету Солнца',
    distance:
      'По параллаксу расстояние от Солнца оценивается примерно в {distance} световых лет. Примерно столько лет шёл свет, который мы видим сейчас.',
    noDistance:
      'Надёжное измерение расстояния позволило бы определить, как далеко звезда находится на этом луче зрения.',
  },
};

function supportedLanguage(language) {
  const base = String(language).toLowerCase().split('-')[0];
  return Object.hasOwn(copy, base) ? base : 'zh';
}

function fieldDirection(target, hit) {
  const direction = target?.direction || hit?.targetDirection;
  if (direction?.length === 3 && direction.every(Number.isFinite) && Math.hypot(...direction) > 0)
    return direction;
  if (Number.isFinite(target?.ra) && Number.isFinite(target?.dec) && Math.abs(target.dec) <= 90)
    return equatorial(target.ra, target.dec);
  return null;
}

function catalogueLink(family, id, direction) {
  const tables = { hip: 'I/239/hip_main', gaia: 'I/355/gaiadr3', tycho: 'I/259/tyc2' };
  const names = { hip: 'Hipparcos', gaia: 'Gaia DR3', tycho: 'Tycho-2' };
  const query = new URLSearchParams({ '-source': tables[family] });
  const tyc = family === 'tycho' && tychoObservations(id);
  if (tyc) {
    ['TYC1', 'TYC2', 'TYC3'].forEach((key, i) => query.set(key, String(tyc[i])));
  } else if (family === 'tycho' && direction) {
    const { ra, dec } = skyAngles(direction);
    query.set('-c', ra.toFixed(6) + ' ' + dec.toFixed(6));
    query.set('-c.rs', '5');
  } else if (family !== 'tycho') {
    // Gaia source identifiers exceed JavaScript’s safe integer range.
    query.set(family === 'hip' ? 'HIP' : 'Source', id);
  }
  return {
    name: 'CDS VizieR · ' + names[family],
    url: 'https://vizier.cfa.harvard.edu/viz-bin/VizieR?' + query,
  };
}

export function readCatalogStar(target, hit, language = 'zh') {
  const match = /^(hip|gaia|tycho):(.+)$/.exec(target?.id || hit?.id || '');
  if (!match) return null;
  const [, family, id] = match;
  if (family !== 'tycho' && !/^\d+$/.test(id)) return null;
  const lang = supportedLanguage(language);
  const profile = family === 'hip' && stellarProfiles[id];
  const phrases = copy[lang];
  const direction = fieldDirection(target, hit);
  const catalogue = catalogueLink(family, id, direction);
  const history = starHistory(family, id, lang);
  if (profile?.[lang]) {
    const link = { name: profile.source, url: profile.url };
    return {
      description: profile[lang],
      story: history.story,
      storyKind: history.storyKind,
      relatedStory: history.relatedStory,
      detail: stellarNotes[id][lang],
      observing: profile.observing?.[lang],
      link,
      sources: [link, ...history.sources, profile.study, catalogue].filter(
        (s, i, items) => s && items.findIndex((item) => item?.url === s.url) === i
      ),
    };
  }

  const region = direction && cultureObjectLabel(westernRegion(direction), lang);
  const tyc = family === 'tycho' && tychoObservations(id);
  const name =
    family === 'hip'
      ? 'HIP ' + id
      : family === 'gaia'
        ? 'Gaia DR3 ' + id
        : tyc
          ? 'TYC ' + tyc.slice(0, 3).join('-')
          : target?.identifier;
  const chartName = family === 'hip' && chartNames.get(Number(id));
  const named =
    chartName?.[lang] || chartName?.en || (family === 'hip' && standardStarNames[id]?.[0]);
  const intro =
    name && region && !tyc && !named
      ? [phrases.cataloguedField.replace('{name}', name).replace('{region}', region)]
      : [
          named
            ? phrases.named.replace('{name}', named).replace('{id}', name)
            : name && (tyc ? phrases.tychoName : phrases.catalogue).replace('{name}', name),
          region ? phrases.field.replace('{region}', region) : phrases.star,
        ].filter(Boolean);
  const measurements = [];
  let observing;
  const fmt = (number, digits) => number.toLocaleString(lang, { maximumFractionDigits: digits });
  const mag = Number.isFinite(hit?.magnitude) ? hit.magnitude : target?.magnitude;
  if (Number.isFinite(mag)) {
    const band = { hip: 'V', tycho: 'Vₜ', gaia: 'G' }[family];
    intro.push(phrases.magnitude.replace('{band}', band).replace('{mag}', fmt(mag, 2)));
    const advice =
      family === 'gaia'
        ? 'gaia'
        : mag <= 1
          ? 'beacon'
          : mag <= 4
            ? 'easy'
            : mag <= 6
              ? 'dark'
              : 'faint';
    if (family === 'gaia') measurements.push(phrases[advice]);
    else observing = phrases[advice];
  }

  // The bundled Gaia stars have G magnitudes and no measured B−V. The Tycho
  // cutouts approximate Johnson B−V using 0.85 × (BT−VT).
  const bv = hit?.bv ?? target?.bv;
  if (family !== 'gaia' && Number.isFinite(bv)) {
    const tone = bv < 0.45 ? phrases.blue : bv > 0.85 ? phrases.red : phrases.neutral;
    measurements.push(
      phrases[family === 'tycho' ? 'converted' : 'colour']
        .replace('{value}', fmt(bv, 2))
        .replace('{tone}', tone)
    );
  }
  const distance = hit?.distanceLightYears;
  if (Number.isFinite(distance) && distance > 0)
    measurements.push(
      phrases.distance.replace('{distance}', fmt(Number(distance.toPrecision(2)), 2))
    );
  else if (!Number.isFinite(bv) || family === 'gaia') measurements.push(phrases.noDistance);
  const separator = lang === 'zh' ? '' : ' ';
  const sources = [catalogue, ...history.sources];
  if (family === 'hip' && hit?.distanceSource === 'hipparcos-2007' && distance > 0) {
    sources.push({
      name: 'CDS VizieR · Hipparcos 2007',
      url:
        'https://vizier.cfa.harvard.edu/viz-bin/VizieR?' +
        new URLSearchParams({ '-source': 'I/311/hip2', HIP: id }),
    });
  }
  return {
    description: intro.join(separator),
    story: history.story,
    storyKind: history.storyKind,
    relatedStory: history.relatedStory,
    detail: measurements.join(separator) || undefined,
    observing,
    link: catalogue,
    sources,
  };
}

export function readSolarBody(bodyId, language = 'zh') {
  const id = String(bodyId)
    .replace(/^solar:/i, '')
    .toLowerCase();
  const name = id.charAt(0).toUpperCase() + id.slice(1);
  if (!Object.hasOwn(solarBodyProfiles, name)) return null;
  const lang = supportedLanguage(language);
  const link = { name: 'NASA Science', url: 'https://science.nasa.gov/' + id + '/facts/' };
  const story = solarStories[name];
  return {
    description: solarIntroductions[name][lang],
    story: story[lang],
    storyKind: story.kind,
    detail: solarBodyProfiles[name][lang],
    link,
    sources: [link, story.source, story.artifact].filter(Boolean),
  };
}
