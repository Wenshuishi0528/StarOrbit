import { historicalObservers, originalNGCRecord } from './deep-sky-historical-records.js';
import { indexCatalogueRecord } from './deep-sky-index-catalogue-reading.js';
import { originalICImpression } from './deep-sky-index-impressions.js';

export const dreyerNGC = {
  name: 'J. L. E. Dreyer · NGC (1888)',
  url: 'https://ui.adsabs.harvard.edu/abs/1888MmRAS..49....1D/abstract',
};
const ic1 = {
  name: 'J. L. E. Dreyer · Index Catalogue I',
  url: 'https://articles.adsabs.harvard.edu/pdf/1895MmRAS..51..185D',
};
const ic2 = {
  name: 'J. L. E. Dreyer · Index Catalogue II',
  url: 'https://articles.adsabs.harvard.edu/pdf/1910MmRAS..59..105D',
};
const icObservers = {
  J: 'Stéphane Javelle',
  W: 'Max Wolf',
  F: 'Royal Harwood Frost',
  D: 'DeLisle Stewart',
  S: 'Lewis Swift',
  B: 'Guillaume Bigourdan',
  H: 'Arnold Schwassmann',
  b: 'Edward Emerson Barnard',
  p: 'Rudolf Spitaler',
  f: 'Williamina Fleming',
  s: 'Sherburne Wesley Burnham',
  k: 'Hermann Kobold',
  r: 'Isaac Roberts',
  e: 'Thomas Espin',
  d: 'William Frederick Denning',
  i: 'Robert T. A. Innes',
  g: 'James Edward Keeler',
  a: 'Solon I. Bailey',
};
const icMethods = {
  J: [
    '雅韦勒在尼斯天文台用口径 30 英寸的折射望远镜观测，以测微器量取暗弱目标相对参照星的位置。',
    'At Nice Observatory Javelle used the 30-inch refractor and its micrometer to measure faint objects relative to reference stars.',
    'В Ницце Жавель наблюдал на 30-дюймовом рефракторе, измеряя микрометром положение слабых объектов относительно опорных звёзд.',
    'À Nice, Javelle utilisait la lunette de 30 pouces et son micromètre pour situer les objets faibles par rapport à des étoiles de référence.',
  ],
  S: [
    '斯威夫特用望远镜逐区扫寻暗弱星云，再将各轮观测分批发表。德雷尔汇编补编时使用了他的清单。',
    'Swift swept the sky for faint nebulae and published his observations in successive lists. Dreyer used those lists to compile his supplement.',
    'Свифт просматривал небо в поисках слабых туманностей и публиковал последовательные списки наблюдений. Дрейер использовал их при составлении дополнения.',
    'Swift balayait le ciel à la recherche de nébuleuses faibles et publiait ses observations par listes successives. Dreyer les utilisa pour compiler son supplément.',
  ],
  F: [
    '弗罗斯特检查在秘鲁阿雷基帕拍下的天文底片，在累积星光的影像上辨认星云。',
    'Frost searched for nebulae on photographic plates exposed at Arequipa in Peru, looking for patches of light that built up in the exposure.',
    'Фрост искал туманности на фотопластинках, снятых в Арекипе в Перу, выявляя пятна, которые проявлялись за время экспозиции.',
    'Frost cherchait des nébuleuses sur les plaques photographiques exposées à Arequipa, au Pérou, où les plages de lumière s’accumulaient pendant la pose.',
  ],
  H: [
    '沃尔夫在海德堡拍下底片。施瓦斯曼在底片上逐一辨认星云，并量出它们的位置。',
    'Max Wolf took the photographic plate at Heidelberg. Schwassmann identified the nebulae on it and measured their positions.',
    'Макс Вольф снял фотопластинку в Гейдельберге. Швассман нашёл на ней туманности и измерил их координаты.',
    'Max Wolf prit la plaque photographique à Heidelberg. Schwassmann y identifia les nébuleuses et mesura leurs positions.',
  ],
};
const words = {
  // Only unequivocal standalone terms listed in the key of the printed catalogue.
  eeF: ['极其暗淡', 'exceedingly faint', 'исключительно слабый блеск', 'éclat extrêmement faible'],
  eF: ['极暗', 'extremely faint', 'крайне слабый блеск', 'éclat extrêmement faible'],
  vF: ['很暗', 'very faint', 'очень слабый блеск', 'éclat très faible'],
  F: ['暗', 'faint', 'слабый блеск', 'éclat faible'],
  pF: ['较暗', 'pretty faint', 'довольно слабый блеск', 'éclat assez faible'],
  cF: ['明显偏暗', 'considerably faint', 'заметно слабый блеск', 'éclat sensiblement faible'],
  pB: ['较亮', 'pretty bright', 'довольно яркий', 'assez brillant'],
  cB: ['明显偏亮', 'considerably bright', 'заметно яркий', 'sensiblement brillant'],
  B: ['明亮', 'bright', 'яркий', 'brillant'],
  vB: ['很亮', 'very bright', 'очень яркий', 'très brillant'],
  vS: ['很小', 'very small', 'очень малый размер', 'très petit'],
  eS: ['极小', 'extremely small', 'крайне малый размер', 'extrêmement petit'],
  pS: ['较小', 'pretty small', 'довольно малый размер', 'assez petit'],
  S: ['小', 'small', 'малый размер', 'petit'],
  pL: ['较大', 'pretty large', 'довольно крупный размер', 'assez grand'],
  L: ['大', 'large', 'крупный размер', 'grand'],
  vL: ['很大', 'very large', 'очень крупный размер', 'très grand'],
  eL: ['极大', 'extremely large', 'крайне большой размер', 'extrêmement grand'],
  R: ['圆形', 'round', 'круглый контур', 'forme ronde'],
  iR: [
    '近圆而不规则',
    'irregularly round',
    'округлая неправильная форма',
    'forme arrondie irrégulière',
  ],
  lE: ['略显狭长', 'a little elongated', 'слегка вытянутый контур', 'légèrement allongé'],
  E: ['狭长', 'elongated', 'вытянутая форма', 'forme allongée'],
  mE: ['相当狭长', 'much elongated', 'сильно вытянутая форма', 'très allongé'],
  vlE: ['仅稍见狭长', 'very slightly elongated', 'едва вытянутая форма', 'très légèrement allongé'],
  cE: ['明显狭长', 'considerably elongated', 'заметно вытянутая форма', 'nettement allongé'],
  Cl: ['星团', 'cluster', 'скопление', 'amas'],
  GC: ['球状星团', 'globular cluster', 'шаровое скопление', 'amas globulaire'],
  PN: ['行星状星云', 'planetary nebula', 'планетарная туманность', 'nébuleuse planétaire'],
  stellar: ['外观似恒星', 'star-like', 'звездообразный вид', 'aspect stellaire'],
  bM: ['中央变亮', 'brighter in the middle', 'ярче к центру', 'plus brillant au centre'],
  lbM: [
    '中央稍亮',
    'a little brighter in the middle',
    'немного ярче к центру',
    'un peu plus brillant au centre',
  ],
  gbM: [
    '向中央渐亮',
    'gradually brighter towards the middle',
    'постепенно ярче к центру',
    'éclat croissant vers le centre',
  ],
  sbM: [
    '向中央突然变亮',
    'suddenly brighter towards the middle',
    'резко ярче к центру',
    'éclat croissant brusquement vers le centre',
  ],
  mbM: [
    '中央亮得多',
    'much brighter in the middle',
    'значительно ярче к центру',
    'beaucoup plus brillant au centre',
  ],
  Ri: ['星点丰富', 'rich in stars', 'много звёзд', 'riche en étoiles'],
  pRi: ['星点较丰富', 'fairly rich in stars', 'довольно много звёзд', 'assez riche en étoiles'],
  vRi: ['星点很丰富', 'very rich in stars', 'очень много звёзд', 'très riche en étoiles'],
};
function describeNotation(tokens, i) {
  const wordsUsed = tokens.filter((t) => Object.hasOwn(words, t));
  if (!wordsUsed.length) return '';
  const descriptors = wordsUsed.map((t) => words[t][i]).join(i === 0 ? '、' : ', ');
  const notation = wordsUsed.join(', ');
  return [
    `外观栏里的简写「${notation}」记的是${descriptors}。`,
    `The description includes “${notation}”, shorthand for ${descriptors}.`,
    `В описании стоят сокращения «${notation}». Их значения — ${descriptors}.`,
    `La description porte les abréviations « ${notation} », qui signifient ${descriptors}.`,
  ][i];
}

const coordinates = ['zh', 'en', 'ru', 'fr'].map(
  (locale) =>
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })
);
export function modernDeepSkyPosition(object, i) {
  if (!Number.isFinite(object.ra) || !Number.isFinite(object.dec)) return '';
  const ra = coordinates[i].format(object.ra) + '°';
  const dec = (object.dec > 0 ? '+' : '') + coordinates[i].format(object.dec) + '°';
  return [
    `现代星表把 ${object.id} 的位置标在赤经 ${ra}、赤纬 ${dec}（J2000）。`,
    `The modern J2000 position of ${object.id} is right ascension ${ra} and declination ${dec}.`,
    `Современные координаты ${object.id} на эпоху J2000 — прямое восхождение ${ra} и склонение ${dec}.`,
    `Les coordonnées modernes de ${object.id} pour J2000 sont ${ra} d’ascension droite et ${dec} de déclinaison.`,
  ][i];
}
function originalNGCStory(number, object, i) {
  const tokens = originalNGCRecord(number).split(',');
  const impression = describeNotation(tokens, i);
  const entries = [];
  for (const token of tokens) {
    const number = token.slice(1);
    if (token.startsWith('W'))
      entries.push(
        ['威廉·赫歇尔', 'William Herschel', 'Уильям Гершель', 'William Herschel'][i] +
          ' ' +
          number.replace('.', ' ')
      );
    if (token.startsWith('J'))
      entries.push(
        ['约翰·赫歇尔', 'John Herschel', 'Джон Гершель', 'John Herschel'][i] + ' ' + number
      );
  }
  const observerId = tokens.find((t) => /^O\d+$/.test(t));
  const observer = observerId && historicalObservers[Number(observerId.slice(1))];
  const references = entries.join(i === 0 ? '、' : ' / ');
  const origin = references
    ? [
        `德雷尔在这一行列出了此前的观测编号（${references}）。`,
        `Dreyer cross-referenced the earlier observing entries ${references}.`,
        `Дрейер привёл ссылки на более ранние наблюдения (${references}).`,
        `Dreyer renvoie à des observations antérieures (${references}).`,
      ][i]
    : observer
      ? [
          `德雷尔在原表的观测者栏列出了 ${observer}。`,
          `The original observer column credits ${observer}.`,
          `В графе наблюдателей указан источник записи — ${observer}.`,
          `Dans la colonne des observateurs, Dreyer cite ${observer}.`,
        ][i]
      : '';
  if (!impression && !origin) return '';
  const opening = [
    `翻开德雷尔 1888 年编的《星云星团新总表》，可以找到第 ${number} 项。`,
    `Entry ${number} appears in Dreyer’s New General Catalogue of 1888.`,
    `В Новом общем каталоге, составленном Дрейером в 1888 году, этому полю соответствует строка ${number}.`,
    `On retrouve ce champ à la ligne ${number} du Nouveau Catalogue général compilé par Dreyer en 1888.`,
  ][i];
  const position = (!impression || !origin) && modernDeepSkyPosition(object, i);
  return [opening, impression, origin, position].filter(Boolean).join(i === 0 ? '' : ' ');
}

export function deepCatalogueHistory(object, i) {
  const match = /^(NGC|IC)(\d+)(.*)$/.exec(object.id);
  const id = object.id.replace(/^(NGC|IC)(\d)/, '$1 $2');
  if (match) {
    const [, prefix, n, suffix] = match,
      num = Number(n);
    let source = prefix === 'NGC' ? dreyerNGC : num <= 1529 ? ic1 : ic2;
    let printedPage;
    if (prefix === 'IC' && !suffix) {
      const note = originalICImpression(num);
      const record = { ...indexCatalogueRecord(num), ...note };
      printedPage = record.printedPage;
      if (record.pdfPage)
        source = {
          name: source.name + ' · ' + record.printedPage,
          url: source.url + '#page=' + record.pdfPage,
        };
      const observer = icObservers[record.observer];
      if ((observer || note) && record.printedPage) {
        const page = record.printedPage;
        const lead = observer
          ? [
              `德雷尔编的星云补编在原刊第 ${page} 页列出 IC ${num}，观测者栏记的是 ${observer}。`,
              `Page ${page} of Dreyer’s original Index Catalogue lists IC ${num} with ${observer} in the observer column.`,
              `В оригинальном Индексном каталоге Дрейера на странице ${page} рядом с IC ${num} в графе наблюдателей указан источник — ${observer}.`,
              `À la page ${page} de l’Index Catalogue original, Dreyer inscrit ${observer} dans la colonne des observateurs pour IC ${num}.`,
            ][i]
          : [
              `德雷尔在星云星团补编第 ${page} 页把这一处天体列为 IC ${num}。`,
              `On page ${page} of his Index Catalogue, Dreyer listed this object as IC ${num}.`,
              `На странице ${page} Индексного каталога Дрейер поместил этот объект под номером IC ${num}.`,
              `À la page ${page} de son Index Catalogue, Dreyer a inscrit cet objet sous le numéro IC ${num}.`,
            ][i];
        const impression = note && describeNotation(note.terms.split(','), i);
        const context =
          icMethods[record.observer]?.[i] || (!impression && modernDeepSkyPosition(object, i));
        return {
          story: [lead, impression, context].filter(Boolean).join(i === 0 ? '' : ' '),
          storyKind: 'catalogue',
          source,
        };
      }
    }
    if (prefix === 'NGC' && !suffix) {
      const story = originalNGCStory(num, object, i);
      if (story) return { story, storyKind: 'catalogue', source };
    }
    const edition =
      prefix === 'NGC'
        ? [
            '1888 年的新总表',
            'the New General Catalogue of 1888',
            'Новый общий каталог 1888 года',
            'le Nouveau Catalogue général de 1888',
          ][i]
        : num <= 1529
          ? [
              '收录 1888–1894 年新增报告的第一份补编',
              'the first Index Catalogue of objects reported in 1888–1894',
              'первый Индексный каталог с сообщениями за 1888–1894 годы',
              'le premier Index Catalogue, consacré aux signalements de 1888 à 1894',
            ][i]
          : [
              '汇集 1895–1907 年报告的第二份补编',
              'the second Index Catalogue of reports from 1895–1907',
              'второй Индексный каталог с сообщениями за 1895–1907 годы',
              'le second Index Catalogue, consacré aux signalements de 1895 à 1907',
            ][i];
    const src = prefix + ' ' + n;
    const reading = [
      `德雷尔在${edition}中使用了 ${src} 这个编号。`,
      `Dreyer listed ${src} in ${edition}.`,
      `Обозначение ${src} восходит к изданию Дрейера — ${edition}.`,
      `Le numéro ${src} remonte à un recueil compilé par Dreyer, ${edition}.`,
    ][i];
    const extension = suffix
      ? [
          `现代目录用后缀 ${suffix} 区分 ${id} 所指的分项。`,
          ` The modern suffix ${suffix} singles out the entry ${id}.`,
          ` Современный суффикс ${suffix} уточняет запись ${id}.`,
          ` Le suffixe moderne ${suffix} précise l’entrée ${id}.`,
        ][i]
      : '';
    const page = printedPage
      ? [
          `可在原刊第 ${printedPage} 页查到这个编号。`,
          ` The printed entry is on page ${printedPage}.`,
          ` Исходная запись находится на странице ${printedPage}.`,
          ` L’entrée se retrouve à la page ${printedPage} de l’original.`,
        ][i]
      : '';
    const angle = object.positionAngleDeg;
    const size = object.angularSizeArcmin;
    const orientation =
      Number.isFinite(angle) && size?.[0] > size?.[1] && size[1] > 0
        ? [
            `现代星表还量出它的长轴位置角约 ${angle}°，从天北向东量起，可用来把旧图和今日影像转到同一方向。`,
            ` The modern catalogue measures its long axis at about ${angle}°, east from celestial north. This angle helps align an old chart with an image.`,
            ` Современная оценка угла большой оси — около ${angle}° от небесного севера к востоку. По этому углу можно сопоставить ориентацию старой карты и снимка.`,
            ` Le catalogue moderne donne au grand axe un angle d’environ ${angle}°, mesuré du nord céleste vers l’est. Il permet d’orienter une ancienne carte comme l’image.`,
          ][i]
        : '';
    const position = modernDeepSkyPosition(object, i);
    return {
      story: [reading + page + extension + orientation, position]
        .filter(Boolean)
        .join(i === 0 ? '' : ' '),
      storyKind: 'catalogue',
      source,
    };
  }
  return null;
}
