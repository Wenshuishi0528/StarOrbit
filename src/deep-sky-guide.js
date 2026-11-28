import chart from '../assets/star-chart.json' with { type: 'json' };
import { describeSkyObject, describeSurveyImage } from './sky-object-reading.js';

const languages = ['zh', 'en', 'ru', 'fr'];
const messier =
  'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/';
const openNGC =
  'https://github.com/mattiaverga/OpenNGC/tree/be3cd6c5498806a2fbb2f7e0452ef802dbb02be0';
const originals = {
  M1: [
    '1054 年，中国天文学家在金牛座方向记录了一颗白天也能看见的“客星”。今天在这个位置找到的蟹状星云，就是那次超新星爆发留下的遗迹。爆炸抛出的气体铺成细丝，中心仍有一颗飞快自转的中子星，为星云内部的辉光供能。',
    'In 1054 Chinese astronomers recorded a guest star bright enough to see by day in the direction of Taurus. The Crab Nebula is the remnant of that explosion. Gas thrown out by the star now forms a web of filaments around the glow powered by a rapidly spinning neutron star at its heart.',
    'В 1054 году китайские астрономы записали появление в Тельце звезды-гостьи, видимой даже днём. Крабовидная туманность осталась на месте той вспышки сверхновой. Выброшенный газ образует волокна вокруг внутренней области, свечение которой питает быстро вращающаяся нейтронная звезда.',
    'En 1054, des astronomes chinois ont décrit dans le Taureau une étoile invitée visible même en plein jour. La nébuleuse du Crabe est le vestige de cette explosion. Le gaz éjecté forme un réseau de filaments autour d’une lueur entretenue par une étoile à neutrons qui tourne très vite sur elle-même.',
  ],
  M8: [
    '礁湖星云位于人马座方向。年轻恒星的紫外光使周围的气体电离并发光，前方一条浓密的尘埃带遮住部分亮区，在影像上留下像水道一样的暗纹，“礁湖”由此得名。把视场放宽一些，就能同时看到发光云气和附近成群的年轻星点。',
    'Look into Sagittarius for the Lagoon Nebula. Ultraviolet light from young stars makes the surrounding gas glow. A lane of dust in front absorbs part of that light and draws the dark channel that gives the nebula its name. A wide field takes in both the bright cloud and the neighbouring young stars.',
    'Туманность Лагуна находится в Стрельце. Ультрафиолет молодых звёзд заставляет окружающий газ светиться. Пыль перед ним поглощает часть света и образует тёмную полосу, которой туманность обязана названием. В широком поле видны и облако, и соседние молодые звёзды.',
    'Dans le Sagittaire, les jeunes étoiles de la nébuleuse de la Lagune ionisent le gaz qui brille autour d’elles. Une bande de poussière absorbe une partie de cette lumière et dessine le chenal sombre à l’origine de son nom. Un champ assez large montre le nuage et les jeunes étoiles voisines.',
  ],
  M20: [
    '三叶星云的名字来自人马座这片云气中的几道暗纹。尘埃挡住了后面的辉光，把明亮的发射星云分成几瓣。较宽的光学照片还能拍到旁边颜色偏蓝的反射区。沿两区交界观察，一幅图里便能比较气体发光、尘埃散射和遮光三种现象。',
    'Dark dust lanes divide the luminous part of the Trifid Nebula in Sagittarius into lobes and give it its name. A wider optical image also picks up the neighbouring bluish reflection nebula. Across the field you can compare three different effects: glowing gas, dust that scatters starlight and dust that blocks light from behind.',
    'Тёмные пылевые полосы делят яркую часть Тройной туманности в Стрельце на несколько долей и объясняют её название. В широком поле заметна и соседняя голубоватая отражательная область. На одном снимке можно сравнить свечение газа, рассеяние звёздного света пылью и поглощение света тёмными полосами.',
    'Les bandes sombres de la nébuleuse Trifide, dans le Sagittaire, découpent sa partie brillante en lobes qui lui ont donné son nom. Un champ plus large englobe aussi une zone de réflexion bleuâtre. On peut y comparer le gaz lumineux, les poussières qui diffusent la lumière des étoiles et celles qui la masquent.',
  ],
  M27: [
    '哑铃星云在狐狸座方向，明亮的中央部分像一只两头宽、中间窄的哑铃。中心恒星在演化晚期抛出了外层，留下的炽热星核照亮了正在扩散的气体。先辨认明亮的两端，再对照较深的照片，就能看出熟悉的轮廓周围还有更暗的气体。',
    'The bright middle of the Dumbbell Nebula in Vulpecula looks broad at either end and pinched in between. Its central star shed its outer layers late in life. The exposed hot core lights up the expanding gas. Find the two bright lobes first, then look at a deep exposure for the fainter material around them.',
    'У туманности Гантель в Лисичке заметны две широкие доли и узкая перемычка. К концу жизни центральная звезда сбросила наружные слои. Её горячее ядро теперь освещает расширяющийся газ. Найдите сначала две яркие доли, а на глубоком снимке поищите более слабую внешнюю оболочку.',
    'Dans le Petit Renard, la nébuleuse de l’Haltère présente deux lobes lumineux resserrés au milieu. Son étoile centrale a perdu ses couches externes en fin de vie. Le cœur chaud mis à nu éclaire maintenant le gaz en expansion. Repérez les deux lobes puis cherchez leur enveloppe plus faible sur une pose profonde.',
  ],
  M82: [
    '从大熊座的 M81 稍稍挪动视线，就会见到雪茄星系 M82 的狭长亮身。它和邻居的引力相互作用促成了剧烈的恒星诞生。深曝光照片中，气体细丝从中央区域向星系盘两侧伸出；留足画幅，还能把这对外形迥异的邻居放在一起比较。',
    'Close to M81 in Ursa Major lies the narrow streak of M82, the Cigar Galaxy. Encounters with its neighbour have helped trigger an intense burst of star formation. Deep images reveal filaments emerging from the central region above and below the disc. A wider field puts the two very different galaxies side by side.',
    'Неподалёку от M81 в Большой Медведице видна узкая полоска M82, галактики Сигара. Гравитационное взаимодействие с соседкой способствовало бурной вспышке звездообразования. На глубоких снимках из центральной части над диском и под ним тянутся волокна газа. В широком поле удобно сравнить обе галактики.',
    'Près de M81 dans la Grande Ourse, M82 se présente comme un fuseau étroit, d’où son nom de galaxie du Cigare. Les interactions avec sa voisine ont favorisé une flambée de formation d’étoiles. Les poses profondes montrent des filaments de gaz sortant du centre de part et d’autre du disque. Un grand champ permet de comparer les deux galaxies.',
  ],
  M101: [
    '风车星系在大熊座方向，星盘几乎正对地球，旋臂因此特别适合辨认。从明亮的中心向外追踪，旋臂上散布着由年轻恒星照亮的成星区。广角构图能留住稀薄的外围旋臂；只放大核心，反而容易错过让它得名的风车轮廓。',
    'The Pinwheel Galaxy in Ursa Major faces us almost squarely, making its spiral structure easy to trace. Follow the arms out from the nucleus and look for bright star-forming regions lit by young stars. Leave room in the frame for the faint outer arms that give the galaxy its pinwheel outline.',
    'Галактика Вертушка в Большой Медведице обращена к нам почти плашмя, поэтому удобно прослеживать её спираль. Вдоль рукавов видны области звездообразования, освещённые молодыми звёздами. Оставьте в кадре место для слабых наружных рукавов, образующих знакомый силуэт.',
    'Dans la Grande Ourse, la galaxie du Moulinet présente son disque presque de face. Depuis le noyau, suivez les bras parsemés de régions de formation stellaire éclairées par de jeunes étoiles. Laissez assez de champ autour du centre pour conserver les faibles bras externes qui dessinent le moulinet.',
  ],
  HCG92: [
    '在飞马座这个小小的视场里，斯蒂芬五重星系把五个明亮星系挤在了同一幅图上。其中四个处在相近距离，引力碰撞与拉扯在它们之间留下潮汐结构。另一个成员 NGC 7320 位于前景，离我们近得多。这幅构图也提醒人们，天球上的邻居可能相隔很远。',
    'Stephan’s Quintet puts five bright galaxies into a small field in Pegasus. Four lie at roughly the same distance, where encounters have pulled tidal structures out of their stars and gas. NGC 7320 is much nearer to us. This little group makes a striking illustration of how sky position and distance tell different parts of the story.',
    'В маленьком поле Пегаса Квинтет Стефана собирает сразу пять ярких галактик. Четыре из них находятся примерно на одном расстоянии. Сближения вытянули из них приливные структуры. Пятая, NGC 7320, лежит гораздо ближе к нам. По такому кадру хорошо видно, как проекция сближает далёкие друг от друга объекты.',
    'Le Quintette de Stephan réunit cinq galaxies brillantes dans un petit champ de Pégase. Quatre d’entre elles se trouvent à des distances comparables et leurs rencontres ont étiré des structures de marée. NGC 7320, au premier plan, est beaucoup plus proche de nous. Leur voisinage apparent illustre l’effet de la projection sur le ciel.',
  ],
};

const deg = Math.PI / 180;
const landmarks = chart.stars.filter((s) => s.hasProperName && s.mag <= 2.5);
const compass = [
  ['北', '东北', '东', '东南', '南', '西南', '西', '西北'],
  ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
  ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'],
  ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'],
];
function landmarkSentence(object, i) {
  if (!Number.isFinite(object.ra) || !Number.isFinite(object.dec)) return '';
  const dec = object.dec * deg;
  let best = -1,
    nearest;
  for (const star of landmarks) {
    const d = star.dec * deg,
      offset = (object.ra - star.ra) * deg;
    const dot = Math.sin(dec) * Math.sin(d) + Math.cos(dec) * Math.cos(d) * Math.cos(offset);
    if (dot > best) {
      best = dot;
      nearest = star;
    }
  }
  const distance = Math.acos(Math.min(1, best)) / deg;
  if (!nearest || distance < 0.15 || distance > 22.5) return '';
  const d = nearest.dec * deg,
    offset = (object.ra - nearest.ra) * deg;
  const angle =
    Math.atan2(
      Math.sin(offset) * Math.cos(dec),
      Math.cos(d) * Math.sin(dec) - Math.sin(d) * Math.cos(dec) * Math.cos(offset)
    ) / deg;
  const dir = compass[i][(Math.round(angle / 45) + 8) % 8],
    name = nearest[languages[i]] || nearest.en;
  const n = distance.toLocaleString(languages[i], { maximumFractionDigits: 1 });
  return [
    `认星时可以先找亮星${name}，再从它向${dir}约 ${n}° 寻找这个目标。`,
    `To find this field, start at the bright star ${name} and look about ${n}° to its ${dir}.`,
    `Ориентир на карте — яркая звезда ${name}. От неё до объекта около ${n}° в направлении на ${dir}.`,
    `Pour retrouver ce champ, partez de l’étoile brillante ${name}, puis parcourez environ ${n}° vers ${dir === 'est' || dir === 'ouest' ? 'l’' + dir : 'le ' + dir} sur la carte.`,
  ][i];
}

export function describeDeepSkySubject(object, language = 'zh') {
  if (!object) return '';
  const i = Math.max(0, languages.indexOf(language));
  return (
    originals[object.id]?.[i] ||
    [describeSkyObject(object, languages[i]), landmarkSentence(object, i)]
      .filter(Boolean)
      .join(i === 0 ? '' : ' ')
  );
}

export function readDeepSkyObject(object, language = 'zh') {
  if (!object) return null;
  const i = Math.max(0, languages.indexOf(language)),
    lang = languages[i];
  const dedicated = originals[object.id]?.[i];
  const description =
    dedicated ||
    [
      describeSkyObject(object, lang),
      describeSurveyImage(object, 'dss', lang).look,
      landmarkSentence(object, i),
    ]
      .filter(Boolean)
      .join(i === 0 ? '' : ' ');
  let link;
  if (object.id === 'HCG92')
    link = {
      name: 'NASA / ESA / CSA · Webb',
      url: 'https://science.nasa.gov/asset/webb/stephans-quintet-nircam-and-miri-composite-image/',
    };
  else if (
    /^M\d+$/.test(object.id) &&
    (dedicated ||
      ['M31', 'M51', 'M16', 'M42', 'M45', 'M57', 'M104', 'M13', 'M33'].includes(object.id))
  )
    link = { name: 'NASA · Hubble', url: messier + 'messier-' + object.id.slice(1) + '/' };
  else if (object.source === 'openngc') link = { name: 'OpenNGC', url: openNGC };
  else if (object.sourceUrl)
    link = {
      name: object.source === 'esa-webb-avm' ? 'ESA/Webb' : object.source,
      url: object.sourceUrl,
    };
  else if (object.source === 'heasarc-messier')
    link = {
      name: 'NASA / HEASARC · Messier',
      url: 'https://heasarc.gsfc.nasa.gov/W3Browse/all/messier.html',
    };
  return { description, link };
}
