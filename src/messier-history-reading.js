import { messierObservingLog, printedMessierSource } from './messier-observing-log-reading.js';
import { messierObservationNotes } from './messier-observation-notes.js';
import { messierReading } from './messier-reading-data.js';

export const messier1781 = {
  name: 'C. Messier · 1781',
  url: 'https://onepagepapers.com/messier-catalogue/read/',
};
const locale = ['zh', 'en', 'ru', 'fr'];
const formatters = locale.map(
  (l) => new Intl.DateTimeFormat(l, { dateStyle: 'long', timeZone: 'UTC' })
);
const previousStories = new Set([
  1, 2, 6, 13, 18, 21, 22, 23, 24, 25, 26, 29, 34, 36, 37, 38, 39, 40, 41, 44, 47, 48, 50, 52, 71,
  73, 80, 91, 92, 93, 97, 102, 103, 105,
]);
// Individually documented early observations preceding Messier’s position measurement.
const cheseaux = [
  '德谢索',
  'Jean-Philippe Loys de Chéseaux',
  'Жан-Филипп Луа де Шезо',
  'Jean-Philippe Loys de Chéseaux',
];
const koehler = [
  '克勒',
  'Johann Gottfried Koehler',
  'Иоганн Готфрид Кёлер',
  'Johann Gottfried Koehler',
];
const lacaille = [
  '拉卡伊',
  'Nicolas-Louis de Lacaille',
  'Никола Луи де Лакайль',
  'Nicolas-Louis de Lacaille',
];
const earlier = {
  4: [cheseaux, 1746],
  5: [['戈特弗里德·基尔希', 'Gottfried Kirch', 'Готфрид Кирх', 'Gottfried Kirch'], 1702],
  8: [
    [
      '霍迪尔纳',
      'Giovanni Battista Hodierna',
      'Джованни Баттиста Годиерна',
      'Giovanni Battista Hodierna',
    ],
    1654,
  ],
  11: [['戈特弗里德·基尔希', 'Gottfried Kirch', 'Готфрид Кирх', 'Gottfried Kirch'], 1681],
  16: [cheseaux, '1745–1746'],
  17: [cheseaux, '1745–1746'],
  35: [cheseaux, 1745],
  53: [['约翰·波德', 'Johann Elert Bode', 'Иоганн Боде', 'Johann Elert Bode'], 1775],
  59: [koehler, 1779],
  60: [koehler, 1779],
  61: [['巴尔纳巴·奥里亚尼', 'Barnaba Oriani', 'Барнаба Ориани', 'Barnaba Oriani'], 1779],
  67: [koehler, 1779],
  83: [lacaille, 1752],
};
const special = {
  1: [
    '1731 年，约翰·贝维斯观测到金牛座牛角旁一片微光。1758 年寻找彗星的梅西耶又遇到了它，在笔记里把那团淡白的长斑比作烛光。彗星会在背景星间移动，这团光却留在原处。为了让往后的搜寻者能认出这种容易误会的目标，他把它列为目录第一项。',
    'John Bevis observed a glow near a horn of Taurus in 1731. Hunting comets in 1758, Charles Messier met the same pale, elongated patch and likened its light to a candle. A comet would move between the stars, but this glow stayed put. It became the first entry in his list of objects that might mislead another comet hunter.',
    'В 1731 году Джон Бевис заметил свечение у рога Тельца. В поисках комет в 1758 году Шарль Мессье увидел то же вытянутое бледное пятно и сравнил его со светом свечи. Комета смещалась бы среди звёзд, а пятно оставалось на месте. Оно открыло список объектов, способных ввести наблюдателя комет в заблуждение.',
    'En 1731, John Bevis observa une lueur près d’une corne du Taureau. En cherchant des comètes en 1758, Charles Messier retrouva cette tache pâle et allongée et compara sa lumière à celle d’une bougie. Une comète se serait déplacée parmi les étoiles. La lueur fixe ouvrit sa liste des objets susceptibles de tromper un observateur.',
  ],
  31: [
    '公元 964 年，波斯天文学家苏菲在《恒星之书》中记下仙女座的这团淡光，凭肉眼就能看到它。人们还要等近千年才知道它有多远。1923 年，哈勃比较多张底片，从中认出一颗按周期变亮变暗的造父变星。借这颗星量出的距离，把仙女座星系放到了银河系之外。',
    'In 964 the Persian astronomer Abd al-Rahman al-Sufi recorded this naked-eye glow in his Book of Fixed Stars. Nearly a thousand years passed before its distance became clear. In 1923 Edwin Hubble compared photographic plates and recognised a pulsing Cepheid in Andromeda. The distance measured from that star placed the galaxy beyond the Milky Way.',
    'В 964 году персидский астроном Абд ар-Рахман ас-Суфи описал видимое глазом пятно в «Книге неподвижных звёзд». Прошло почти тысячу лет, прежде чем выяснилось расстояние до него. В 1923 году Эдвин Хаббл сравнил фотопластинки и опознал в Андромеде пульсирующую цефеиду. Полученное по ней расстояние вывело галактику далеко за пределы Млечного Пути.',
    'En 964, l’astronome persan Abd al-Rahman al-Soufi consigna cette lueur visible à l’œil nu dans son Livre des étoiles fixes. Près d’un millénaire plus tard, en 1923, Edwin Hubble compara des plaques photographiques et reconnut une céphéide dans Andromède. La distance mesurée grâce à cette étoile pulsante plaça la galaxie au-delà de la Voie lactée.',
  ],
  42: [
    '1769 年梅西耶给猎户座剑上的这片亮云定位时，选取其中的 θ 星作为参照，还特别提到贴近它的三颗星。星云没有一道清楚的边界，换台望远镜便可能看到更远的云边。用一个可认出的星点作锚，别的观测者才知道他画的是哪里。',
    'For his 1769 position of Orion’s bright sword nebula, Messier chose Theta Orionis as a reference and mentioned three nearby stars. A cloud has no sharp edge, and different telescopes reveal different amounts of it. A recognisable star anchored his map for other observers.',
    'Для координат яркой туманности в мече Ориона в 1769 году Мессье выбрал ориентиром θ Ориона и отметил рядом ещё три звезды. У облака нет чёткой кромки, и разные телескопы показывают его по-разному. Опорная звезда помогала узнать место на рисунке.',
    'Pour situer en 1769 la nébuleuse de l’épée d’Orion, Messier prit Thêta Orionis comme repère et mentionna trois étoiles voisines. Un nuage n’a pas de bord net et son étendue visible dépend de l’instrument. Une étoile reconnaissable fixait la carte pour les autres observateurs.',
  ],
  45: [
    '在新西兰奥特亚罗瓦，许多毛利社群称昴星团为 Matariki。南半球冬天，它重新出现在黎明前的天空，提醒人们聚会、缅怀逝者并迎接新年。不同地区看重的星与仪式各有差异，这片星群因此既是季节的标记，也承载着地方传统。',
    'In Aotearoa New Zealand many Māori communities know the Pleiades as Matariki. Their return to the pre-dawn sky in the southern winter marks a time to gather, remember those who have died and welcome the new year. Which stars are recognised and how people observe the occasion vary by region.',
    'В Аотеароа, Новой Зеландии, многие общины маори называют Плеяды Матарики. Их возвращение на предрассветное зимнее небо отмечает время собраться, вспомнить ушедших и встретить новый год. В разных местах различаются и выделяемые звёзды, и местные обряды.',
    'En Aotearoa Nouvelle-Zélande, de nombreuses communautés māories appellent les Pléiades Matariki. Leur retour dans le ciel avant l’aube en hiver austral invite à se réunir, à se souvenir des morts et à accueillir l’année nouvelle. Les étoiles reconnues et les rites varient selon les régions.',
  ],
  51: [
    '1845 年，罗斯伯爵在爱尔兰用巨型反射望远镜观察这团星云，画出了从中央向外盘绕的旋臂。梅西耶当年记录的是一个很难看清的暗斑。后来人们讨论“旋涡星云”究竟是什么时，M51 已经有了一张可以互相传阅的形状图。',
    'In 1845 Lord Rosse used a giant reflecting telescope in Ireland to draw arms coiling away from the centre of M51. The same object had looked like a dim patch to Messier. When astronomers debated the nature of spiral nebulae, they could now pass around a drawing of an actual spiral.',
    'В 1845 году лорд Росс в Ирландии увидел в большой рефлектор и зарисовал рукава M51, закрученные вокруг центра. У Мессье это было лишь слабое пятно. В спорах о природе спиральных туманностей теперь можно было обратиться к рисунку реальной спирали.',
    'En 1845, en Irlande, lord Rosse dessina au grand télescope des bras s’enroulant autour du centre de M51. Messier n’y avait vu qu’une faible tache. Les débats sur les nébuleuses spirales disposaient désormais d’un dessin que les astronomes pouvaient confronter à leurs observations.',
  ],
  87: [
    '1781 年 3 月 18 日，梅西耶在室女座一颗八等星的正南方记录了一片微光，星与微光有相同的赤经。他分不出光斑中有单颗恒星，觉得它和同夜所见的 M84、M86 差不多亮。目录把这片光列在第 87 项，今天我们知道它是一座巨椭圆星系。',
    'On 18 March 1781 Messier recorded a patch of light due south of an eighth-magnitude star in Virgo, at the same right ascension. He could distinguish no stars in the glow and judged it about as bright as M84 and M86, seen that same night. The patch he listed at number 87 is a giant elliptical galaxy.',
    '18 марта 1781 года Мессье заметил в Деве пятно прямо к югу от звезды восьмой величины, на том же прямом восхождении. В пятне не различались отдельные звёзды. Оно казалось примерно таким же ярким, как M84 и M86, наблюдавшиеся той же ночью. В каталоге эта гигантская эллиптическая галактика получила номер 87.',
    'Le 18 mars 1781, Messier nota une lueur dans la Vierge au sud d’une étoile de huitième grandeur, à la même ascension droite. Il n’y distinguait aucune étoile et lui trouvait à peu près l’éclat de M84 et M86, observées la même nuit. La tache inscrite au numéro 87 est une galaxie elliptique géante.',
  ],
  104: [
    '1781 年，寻找彗星的梅尚在室女座一带记录了这个目标。梅西耶目录的 1781 年印本止于 103 项，今天熟悉的草帽星系排在后续增补的开头。编号的先后记录着目录的编订经过，和星系本身的年龄无关。',
    'The comet hunter Pierre Méchain recorded this object in Virgo in 1781. Messier’s printed catalogue that year ended at 103. The Sombrero now opens the later additions, its place in the numbering preserving an episode in the history of the list.',
    'В 1781 году охотник за кометами Пьер Мешен отметил этот объект в Деве. Печатный каталог Мессье того года завершался номером 103. Теперь Сомбреро открывает позднейшие дополнения, и её номер хранит историю издания.',
    'En 1781, le chasseur de comètes Pierre Méchain releva cet objet dans la Vierge. Le catalogue imprimé de Messier s’arrêtait alors à 103. Le Sombrero ouvre aujourd’hui les ajouts ultérieurs et son numéro garde la trace de cette histoire éditoriale.',
  ],
  106: [
    '梅尚在 1781 年记录了这座位于猎犬座的星系。当时可记录的是一团微光及其位置。现代射电望远镜在它核心的水分子脉泽上测量运动，竟能用轨道几何求出星系距离。两代测量瞄准同一目标，使用的尺度却大不相同。',
    'Pierre Méchain observed this galaxy in 1781 as a patch of light in Canes Venatici. Modern radio telescopes tracked water masers orbiting its centre and measured the galaxy’s distance geometrically. Two eras of position measurements addressed the same object on very different scales.',
    'В 1781 году Пьер Мешен наблюдал галактику как пятно в Гончих Псах. Современные радиотелескопы проследили движение водяных мазеров в её ядре и геометрически измерили расстояние. Две эпохи измерений связаны с одним объектом, но в совершенно разных масштабах.',
    'En 1781, Pierre Méchain observa cette galaxie comme une tache dans les Chiens de chasse. Des radiotélescopes modernes ont suivi les masers d’eau en orbite autour du centre et mesuré sa distance par la géométrie. Les deux époques ont mesuré des positions à des échelles très différentes.',
  ],
  107: [
    '1782 年，梅尚发现了这团位于蛇夫座的微光。次年威廉·赫歇尔也独立记录了它。梅西耶在 1781 年已经刊出目录，因此 M107 这个编号是在整理旧记录时补进来的。今天查找这个星团，能遇见两条独立的观测线索。',
    'Pierre Méchain found this faint patch in Ophiuchus in 1782. William Herschel recorded it independently the following year. Messier’s printed catalogue was already out, so the number M107 came later. Today the cluster can be traced through two independent observations.',
    'В 1782 году Пьер Мешен нашёл слабое пятно в Змееносце. Год спустя Уильям Гершель независимо наблюдал его. Каталог 1781 года уже был напечатан, и номер M107 появился позднее. Историю скопления можно проследить по двум независимым записям.',
    'En 1782, Pierre Méchain découvrit une lueur dans Ophiuchus. William Herschel la releva indépendamment l’année suivante. Le catalogue imprimé de 1781 était déjà paru et le numéro M107 vint plus tard. Deux témoignages indépendants documentent ainsi cet amas.',
  ],
  108: [
    '1781 年梅尚在记录猫头鹰星云三天后，又在附近找到了 M108。它在早期观测者中已有记录，却直到 1953 年才由欧文·金格里奇把它列为梅西耶目录的正式增补项。在宽视场内找这两个外形截然不同的目标，正好能重走他当时扫过的星野。',
    'Méchain found M108 in 1781, three days after finding the nearby Owl Nebula. The observation survived, and Owen Gingerich formally added it to the catalogue in 1953. A wide field containing these two very different objects retraces a small part of Méchain’s search.',
    'Мешен нашёл M108 в 1781 году, через три дня после соседней туманности Сова. Запись сохранилась, и в 1953 году Оуэн Гингерич добавил объект в каталог. Широкое поле с двумя столь разными объектами позволяет проследить часть пути наблюдателя.',
    'Méchain trouva M108 en 1781, trois jours après la nébuleuse du Hibou toute proche. Le relevé fut conservé et Owen Gingerich ajouta l’objet au catalogue en 1953. Un champ large réunissant ces deux objets très différents retrace une partie de la recherche de Méchain.',
  ],
  109: [
    '梅西耶在 1781 年观测过大熊座这一带的星系，刊行的目录却没有把今天的 M109 作为独立编号列入。1953 年它才正式取得这个位置。看见、记录和入编可以相隔很久，这里隔了将近两个世纪。',
    'Messier observed this galaxy in Ursa Major in 1781, but his printed catalogue gave it no separate number. M109 was formally added in 1953. Nearly two centuries separated the recorded observation from the familiar number used today.',
    'Мессье наблюдал эту галактику в Большой Медведице в 1781 году, но в печатном каталоге отдельного номера у неё не было. Номер M109 был официально добавлен в 1953 году. Запись наблюдения и привычное обозначение разделяют почти два столетия.',
    'Messier observa cette galaxie de la Grande Ourse en 1781 sans lui donner de numéro distinct dans l’édition imprimée. M109 fut officiellement ajouté en 1953. Près de deux siècles séparent ainsi le signalement de son numéro actuel.',
  ],
  110: [
    '1773 年，梅西耶观测到仙女座大星云旁边这片微光，后来还把它画在邻近大星云的图上。他的印本却没有给它编上号码。后世把它纳入目录时排到了第 110 位，因此目录末尾的天体其实早已被绘进星图。',
    'In 1773 Messier observed this patch beside the Andromeda galaxy and subsequently drew it in a view of its larger neighbour. His printed list gave it no number. Later cataloguers placed it at 110, so the last object on the modern list had already appeared on an early drawing.',
    'В 1773 году Мессье наблюдал это пятно рядом с Андромедой и позднее нанёс его на рисунок большой соседки. В печатном списке номера у него не было. Позднее объект поставили на 110-е место, хотя он уже присутствовал на раннем рисунке.',
    'En 1773, Messier observa cette tache près de la galaxie d’Andromède et la dessina ensuite auprès de sa grande voisine. Sa liste imprimée ne lui attribuait aucun numéro. Les compilateurs ultérieurs lui donnèrent le dernier, 110, alors qu’elle figurait déjà sur un ancien dessin.',
  ],
};
const more = {
  31: {
    name: 'NASA · Hubble and V1',
    url: 'https://science.nasa.gov/missions/hubble/hubble-views-the-star-that-changed-the-universe/',
  },
  45: {
    name: 'Museum of New Zealand Te Papa Tongarewa',
    url: 'https://www.tepapa.govt.nz/digital-museum/explore-digital-museum/matariki-maori-new-year/what-and-who-matariki/what-matariki',
  },
  51: { name: 'Birr Castle Observatory', url: 'https://birrcastle.com/the-great-telescope/' },
  87: {
    name: 'Event Horizon Telescope',
    url: 'https://eventhorizontelescope.org/press-release-april-10-2019-astronomers-capture-first-image-black-hole',
  },
  106: { name: 'J. R. Herrnstein et al. · Nature', url: 'https://www.nature.com/articles/22972' },
};
const blackHoleStory = {
  label: [
    'M87 中央黑洞的第一张影像',
    'The first image of M87’s central black hole',
    'Первое изображение центральной чёрной дыры M87',
    'La première image du trou noir central de M87',
  ],
  text: [
    '2019 年，事件视界望远镜团队发表了 M87 中心黑洞阴影的第一张影像。地球上相距很远的射电望远镜同时接收毫米波，再把记录合并，才分辨出中央暗区周围的亮环。从一大片柔和星光到黑洞附近的一个天区，研究者跨过了极大的尺度。',
    'In 2019 the Event Horizon Telescope team published the first image of the shadow of M87’s central black hole. Widely separated radio telescopes recorded millimetre waves at the same time. Combining the recordings resolved a bright ring around a dark centre deep inside this broad patch of starlight.',
    'В 2019 году команда Event Horizon Telescope опубликовала первое изображение тени центральной чёрной дыры M87. Удалённые друг от друга радиотелескопы одновременно записали миллиметровые волны. Объединение записей выявило яркое кольцо вокруг тёмной середины галактики.',
    'En 2019, l’équipe de l’Event Horizon Telescope publia la première image de l’ombre du trou noir central de M87. Des radiotélescopes très éloignés enregistrèrent simultanément les ondes millimétriques. Leur combinaison révéla un anneau brillant autour d’un centre sombre au cœur de la galaxie.',
  ],
};
export function messierHistory(id, i) {
  const n = Number(id.slice(1));
  if (!messierReading[id]) return null;
  if (special[n]) {
    const relatedStory =
      n === 87
        ? {
            kind: 'history',
            label: blackHoleStory.label[i],
            text: blackHoleStory.text[i],
            links: [more[87]],
          }
        : undefined;
    return {
      story: special[n][i],
      storyKind: n === 45 ? 'tradition' : 'history',
      source: n === 87 ? printedMessierSource(n) : more[n] || printedMessierSource(n),
      further: n !== 87 && more[n] ? printedMessierSource(n) : undefined,
      relatedStory,
      usesExisting: previousStories.has(n),
    };
  }
  const usesExisting = previousStories.has(n);
  const note = usesExisting ? messierReading[id][i] : messierObservationNotes[n][i];
  const row = messierObservingLog[n];
  if (!row)
    return { story: note, storyKind: 'history', source: printedMessierSource(n), usesExisting };
  const [rawDate, ra] = row.split('|');
  const [iso, last] = rawDate.split('..');
  const date = formatters[i].format(new Date(iso + 'T00:00:00Z'));
  const secondDate = last
    ? formatters[i].format(new Date(iso.slice(0, 8) + last.padStart(2, '0') + 'T00:00:00Z'))
    : '';
  const printedDate = secondDate ? date + ['和', ' and ', ' и ', ' et '][i] + secondDate : date;
  const record = [
    `1781 年版目录把 M${n} 的这次观测标在 ${printedDate}，赤经一栏写作 ${ra}。`,
    `For M${n}, the 1781 catalogue dates the observation to ${printedDate} and records a right ascension of ${ra}.`,
    `В каталоге 1781 года у M${n} указаны дата наблюдения (${printedDate}) и прямое восхождение ${ra}.`,
    `Pour M${n}, le catalogue de 1781 indique la date d’observation (${printedDate}) et une ascension droite de ${ra}.`,
  ][i];
  const early = earlier[n];
  let observer = '';
  if (early) {
    const [names, year] = early;
    const name = names[i];
    observer = [
      `${year} 年已有${name}的观测记录。`,
      `An earlier observation in ${year} was made by ${name}.`,
      `Среди более ранних наблюдений — запись за ${year} г. (${name}).`,
      `Une observation antérieure, en ${year}, est due à ${name}.`,
    ][i];
  }
  return {
    story: [observer, note, record].filter(Boolean).join(i === 0 ? '' : ' '),
    storyKind: 'history',
    source: printedMessierSource(n),
    usesExisting,
  };
}
