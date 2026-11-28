import {
  gaiaObservationCount,
  hipEntriesForHD,
  hipObservations,
  tychoObservations,
} from './stellar-observing-records.js';

const hipparcos = {
  name: 'ESA · Hipparcos Catalogue (1997)',
  url: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/hipparcos.html',
};
const inputCatalogue = {
  name: 'ESA · Hipparcos Input Catalogue',
  url: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/hic.html',
};
const gaia = {
  name: 'ESA · Gaia DR3',
  url: 'https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html',
};
const tycho = {
  name: 'Høg et al. · Tycho-2 (2000)',
  url: 'https://archive.eso.org/ASTROM/TYC-2/docs/aa2000a.pdf',
};

// These describe the identifying patterns of each class, rather than a
// measurement of any particular absorption line in the historical plate.
const spectra = {
  O: [
    'O 型光谱的识别线索之一，是电离氦留下的谱线。',
    'Lines from ionized helium help identify an O-type spectrum.',
    'Линии ионизованного гелия помогают узнать спектр класса O.',
    'Les raies de l’hélium ionisé aident à reconnaître un spectre de type O.',
  ],
  B: [
    'B 型星的光谱里可以辨认出中性氦的谱线。',
    'Lines of neutral helium are characteristic of B-type spectra.',
    'В спектрах класса B характерны линии нейтрального гелия.',
    'Les raies de l’hélium neutre caractérisent les spectres de type B.',
  ],
  A: [
    'A 型星有个好认的特征，氢吸收星光留下的一排暗线格外显眼。',
    'A-type stars are recognizable by the prominent dark lines where hydrogen absorbs starlight.',
    'Звёзды класса A легко узнать по заметным тёмным линиям поглощения водорода.',
    'Les étoiles de type A se reconnaissent aux raies sombres bien marquées où l’hydrogène absorbe la lumière.',
  ],
  F: [
    'F 型星的光谱上，除氢线外，还能辨认电离钙的两条强线。',
    'Alongside hydrogen, two strong lines of ionized calcium stand out in F-type spectra.',
    'Наряду с водородом в спектрах класса F заметны две сильные линии ионизованного кальция.',
    'Dans les spectres de type F, deux fortes raies du calcium ionisé accompagnent celles de l’hydrogène.',
  ],
  G: [
    'G 型星的光谱上可以找到钙等多种金属元素留下的暗线。',
    'Calcium and other metals leave identifiable dark lines in G-type spectra.',
    'Кальций и другие металлы оставляют характерные тёмные линии в спектре класса G.',
    'Dans un spectre de type G, le calcium et d’autres métaux laissent des raies sombres reconnaissables.',
  ],
  K: [
    'K 型星的光谱里，中性金属原子吸收星光留下的暗线很多。',
    'Many dark lines in K-type spectra are made by neutral metal atoms absorbing starlight.',
    'Многие тёмные линии в спектре класса K возникают при поглощении света нейтральными атомами металлов.',
    'De nombreuses raies sombres des spectres de type K sont dues aux atomes métalliques neutres qui absorbent la lumière.',
  ],
  M: [
    'M 型星的外层较冷，氧化钛等分子能在那里存在，并在光谱上留下一条条宽带。',
    'The outer layers of M stars are cool enough for molecules such as titanium oxide to leave broad bands in their spectra.',
    'В прохладных наружных слоях звёзд класса M сохраняются молекулы, например оксид титана, оставляющие в спектре широкие полосы.',
    'Les couches externes des étoiles M sont assez froides pour que des molécules comme l’oxyde de titane laissent de larges bandes dans le spectre.',
  ],
};

function hipHistory(id, lang, i) {
  const [, hd, spectrum, count, median] = hipObservations(id) || [];
  const sources = [hipparcos];
  let origin;
  if (spectrum) {
    origin = [
      `编写《亨利·德雷珀星表》及其续编时，安妮·坎农和同事借助照相底片上的谱线给恒星分类。翻到 HD ${hd} 这一项，可以看到当时记下的光谱型是 ${spectrum}。`,
      `For the Henry Draper Catalogue and its extension, Annie Jump Cannon and her colleagues classified stars by the lines in their photographic spectra. Look up HD ${hd} and you can see the spectral type they recorded for this entry, ${spectrum}.`,
      `Энни Джамп Кэннон и её коллеги составляли каталог Генри Дрэпера и его продолжение по линиям в звёздных спектрах на фотопластинках. Для объекта HD ${hd} в этом каталоге указан спектральный класс ${spectrum}.`,
      `Pour le catalogue Henry Draper et son extension, Annie Jump Cannon et ses collègues classaient les étoiles d’après les raies de leurs spectres photographiques. À l’entrée HD ${hd}, on peut lire le type spectral indiqué à l’époque, ${spectrum}.`,
    ][i];
    if (/^[OBAFGKM](?:\d|$)/.test(spectrum)) {
      origin += (lang === 'zh' ? '' : ' ') + spectra[spectrum[0]][i];
      sources.push({
        name: 'OpenStax · Astronomy 2e · 17.3',
        url: 'https://openstax.org/books/astronomy-2e/pages/17-3-the-spectra-of-stars-and-brown-dwarfs',
      });
    }
  } else if (hd) {
    origin = [
      `这颗星的档案里还有一个早期编号 HD ${hd}，沿用自亨利·德雷珀光谱星表系列。把它和依巴谷的编号对照，就能连起地面观测和后来的卫星记录。`,
      `This entry also carries the earlier number HD ${hd} from the Henry Draper series of spectral catalogues. The cross-identification connects a ground-based record with the later satellite observations.`,
      `В этой записи сохранился и старый номер HD ${hd} из серии спектральных каталогов Генри Дрэпера. Он связывает наземные наблюдения с более поздними спутниковыми данными.`,
      `La fiche porte aussi le numéro HD ${hd} de la série de catalogues spectraux Henry Draper. Cette correspondance relie les observations au sol aux mesures ultérieures du satellite.`,
    ][i];
  } else {
    origin = [
      '依巴谷卫星的观测计划是在地面上编好的。研究人员先汇集已知恒星的位置和亮度，卫星在 1989 至 1993 年间扫过天空，为星表上的光点留下了多个时刻的测量。',
      'The Hipparcos observing programme began on the ground. A team assembled positions and brightnesses of known stars. As the satellite scanned the sky between 1989 and 1993 it recorded them at many different times.',
      'Программа наблюдений Hipparcos началась на Земле. Астрономы собрали положения и величины известных звёзд. В 1989–1993 годах спутник многократно наблюдал их при сканировании неба.',
      'Le programme d’observation d’Hipparcos a commencé au sol. Une équipe a rassemblé les positions et les éclats d’étoiles déjà connues. Entre 1989 et 1993, le satellite les a mesurées à plusieurs reprises en balayant le ciel.',
    ][i];
    sources.push(inputCatalogue);
  }
  if (hd) {
    const hips = hipEntriesForHD(hd);
    if (hips.length > 1) {
      const entries = hips.map((hip) => 'HIP ' + hip).join(' / ');
      origin += [
        `后来的依巴谷星表把这个 HD 编号列在两条记录下，分别是 ${entries}。`,
        ` The later Hipparcos catalogue lists this HD number under two entries, ${entries}.`,
        ` В более позднем каталоге Hipparcos этот номер HD отнесён к двум записям, ${entries}.`,
        ` Le catalogue Hipparcos reprend ce numéro HD dans deux entrées, ${entries}.`,
      ][i];
    }
    const table = hd <= 272150 ? 'III/135A/catalog' : 'III/182/catalog';
    sources.push({
      name:
        'HD ' +
        hd +
        ' · ' +
        (hd <= 272150 ? 'Henry Draper Catalogue' : 'Henry Draper Extension Charts'),
      url:
        'https://vizier.cfa.harvard.edu/viz-bin/VizieR?' +
        new URLSearchParams({ '-source': table, HD: String(hd) }),
    });
  }
  const value = median?.toLocaleString(lang, { maximumFractionDigits: 3 });
  const observation =
    count && value
      ? [
          `1997 年公布的 HIP ${id} 条目采用了依巴谷卫星的 ${count} 次测光。将这些读数排序，取中位数，就得到了它在卫星 Hp 波段的典型亮度，约为 ${value} 等。`,
          `The 1997 entry for HIP ${id} uses ${count} Hipparcos brightness measurements. Arranging those readings in order gives a median magnitude of about ${value} in the satellite’s Hp band.`,
          `В опубликованной в 1997 году записи HIP ${id} число использованных измерений блеска со спутника Hipparcos составляет ${count}. Из упорядоченных значений получили медианную звёздную величину в полосе Hp — около ${value}.`,
          `L’entrée HIP ${id} publiée en 1997 réunit ${count} mesures d’éclat du satellite Hipparcos. Une fois classées, ces mesures donnent une magnitude médiane d’environ ${value} dans la bande Hp du satellite.`,
        ][i]
      : [
          `1997 年出版的依巴谷主星表把这个目标记为 HIP ${id}。用这个编号能查回卫星给这片天空留下的资料。`,
          `The Hipparcos Catalogue published in 1997 identifies this entry as HIP ${id}. That number leads back to the satellite record for this point on the sky.`,
          `В каталоге Hipparcos, опубликованном в 1997 году, запись имеет номер HIP ${id}. По нему можно найти спутниковые данные для этой точки неба.`,
          `Le catalogue Hipparcos de 1997 répertorie cette entrée sous le numéro HIP ${id}, qui permet de retrouver les données publiées pour ce point du ciel.`,
        ][i];
  return {
    story: origin + (lang === 'zh' ? '' : ' ') + observation,
    storyKind: 'catalogue',
    sources,
  };
}

export function stellarCatalogueObservations(family, id, lang, i) {
  if (family === 'hip') return hipHistory(id, lang, i);
  let story;
  if (family === 'gaia') {
    const count = gaiaObservationCount(id);
    story = [
      `盖亚卫星扫过这片天空时，星光会依次落在焦平面上的感光芯片上。第三次数据发布把这个光源记作 Gaia DR3 ${id}。` +
        (count
          ? `这一行的 G 波段亮度合用了 ${count} 次芯片测量。一次扫过可以留下好几个读数，星表把它们汇成了今天查到的平均亮度。`
          : ''),
      `As Gaia scanned this field, starlight crossed a succession of detectors in its focal plane. Data Release 3 identifies the source as Gaia DR3 ${id}.` +
        (count
          ? ` Its mean G-band brightness combines ${count} CCD measurements. One passage can yield several readings that contribute to the catalogue entry.`
          : ''),
      `Когда Gaia сканировала эту область неба, свет звезды последовательно попадал на детекторы в фокальной плоскости. В третьем выпуске источник обозначен Gaia DR3 ${id}.` +
        (count
          ? ` Число измерений на ПЗС-матрицах, использованных для среднего блеска в полосе G, составляет ${count}. Одно прохождение может дать несколько отсчётов.`
          : ''),
      `Lorsque Gaia balayait ce champ, la lumière de l’étoile traversait une succession de détecteurs dans le plan focal. La troisième publication identifie la source comme Gaia DR3 ${id}.` +
        (count
          ? ` Son éclat moyen dans la bande G réunit ${count} mesures sur les capteurs CCD. Un passage de l’étoile peut fournir plusieurs mesures.`
          : ''),
    ][i];
  } else {
    const row = tychoObservations(id);
    const name = row && 'TYC ' + row.slice(0, 3).join('-');
    const n = row?.[3];
    story = [
      '依巴谷卫星上的巡星仪靠星光辨认卫星的朝向，也记录了恒星在两个波段的亮度。2000 年，埃里克·赫格等人发表《第谷第二星表》，把卫星测到的星位与早年的地面星表放在同一套坐标里。' +
        (n
          ? `${name} 这一项用到了 ${n} 份位置记录。相隔多年的星位让人能量出它在天空中移动得有多快。`
          : ''),
      'The Hipparcos star mappers used starlight to determine the satellite’s pointing and also recorded stellar brightness in two colours. In 2000 Erik Høg and colleagues published Tycho-2, bringing satellite positions and older ground catalogues onto the same coordinate system.' +
        (n
          ? ` The solution for ${name} used ${n} positions. Comparing them across the years reveals the star’s motion on the sky.`
          : ''),
      'Звёздные датчики Hipparcos помогали ориентировать спутник и измеряли блеск звёзд в двух полосах. В 2000 году Эрик Хёг и его коллеги опубликовали каталог Tycho-2, приведя спутниковые измерения и старые наземные каталоги к одной системе координат.' +
        (n
          ? ` Для ${name} в расчёт вошло следующее число определений положения: ${n}. Разница эпох позволила измерить движение звезды по небу.`
          : ''),
      'Les repéreurs d’étoiles d’Hipparcos aidaient le satellite à s’orienter et enregistraient aussi l’éclat des étoiles dans deux bandes. En 2000, Erik Høg et ses collègues ont publié Tycho-2, en rapportant les positions du satellite et des anciens catalogues au sol au même système de coordonnées.' +
        (n
          ? ` Pour ${name}, ils ont utilisé ${n} positions. L’écart entre les époques a permis de mesurer le mouvement de l’étoile sur le ciel.`
          : ''),
    ][i];
  }
  return { story, storyKind: 'catalogue', sources: [family === 'gaia' ? gaia : tycho] };
}
