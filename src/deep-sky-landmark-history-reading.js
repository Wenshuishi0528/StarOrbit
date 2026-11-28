import { modernDeepSkyPosition } from './deep-sky-catalogue-history-reading.js';

const openNGC = {
  name: 'OpenNGC',
  url: 'https://github.com/mattiaverga/OpenNGC/tree/be3cd6c5498806a2fbb2f7e0452ef802dbb02be0',
};
const nasaCaldwell = {
  name: 'NASA · Caldwell',
  url: 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/',
};
const webbCliffs = { name: 'ESA / Webb', url: 'https://esawebb.org/images/weic2205a/' };
const hcg = {
  name: 'P. Hickson · Compact groups of galaxies',
  url: 'https://ui.adsabs.harvard.edu/abs/1982ApJ...255..382H/abstract',
};
const catAndLobster = {
  name: 'ESO · NGC 6334 / NGC 6357',
  url: 'https://www.eso.org/public/news/eso1705/',
};
const cloudNames = {
  name: 'M. Dennefeld · ESO · The Messenger 181',
  url: 'https://www.eso.org/sci/publications/messenger/archive/no.181-sep20/messenger-no181-37-42.pdf',
};
const stories = {
  IC1613: {
    kind: 'discovery',
    source: {
      name: 'M. Wolf · Extended Nebula near 26 Ceti (1906)',
      url: 'https://doi.org/10.1093/mnras/67.1.91',
    },
    further: { name: 'ESO · IC 1613', url: 'https://www.eso.org/public/news/eso1603/' },
    text: [
      '1906 年，马克斯·沃尔夫在鲸鱼座 26 附近发现了一片很淡的光，并以这颗邻星为路标发表了报告。1928 年，沃尔特·巴德用威尔逊山的 2.5 米望远镜把微光分解成单颗恒星。原来这片不起眼的光斑是一座离银河系很近的矮星系。',
      'In 1906 Max Wolf found a faint glow near the star 26 Ceti and named his report after that landmark. In 1928 Walter Baade used the 2.5-metre telescope on Mount Wilson to separate individual stars in it. The once indistinct patch proved to be a dwarf galaxy in our neighbourhood.',
      'В 1906 году Макс Вольф обнаружил слабое пятно близ звезды 26 Кита и указал этот ориентир в заглавии своей работы. В 1928 году Вальтер Бааде различил в нём отдельные звёзды с помощью 2,5-метрового телескопа на Маунт-Вилсон. Невзрачное пятно оказалось соседней карликовой галактикой.',
      'En 1906, Max Wolf découvrit une pâle lueur près de l’étoile 26 de la Baleine, repère qu’il reprit dans le titre de son article. En 1928, Walter Baade y distingua des étoiles individuelles avec le télescope de 2,5 mètres du mont Wilson. La tache diffuse se révéla être une galaxie naine de notre voisinage.',
    ],
  },
  NGC2359: {
    kind: 'name',
    source: {
      name: 'NASA / JPL · NGC 2359',
      url: 'https://www.jpl.nasa.gov/images/pia13083-thors-helmet/',
    },
    text: [
      '约翰·赫歇尔在目镜里看到的明亮部分，像一尊半身像。今天的“雷神头盔”则要把更暗的两翼也看进去。头盔圆顶的弧线是一层被恒星 HD 56925 的强风推起的气体，轮廓弯折之处留下了星风与四周云气相遇的痕迹。',
      'The bright part suggested a sculpted bust to John Herschel at the eyepiece. Fainter extensions on either side complete the shape now known as Thor’s Helmet. The arc of the dome traces gas swept up by the wind of HD 56925. Its bent outline records where that wind met the surrounding cloud.',
      'Яркая часть туманности напоминала Джону Гершелю в окуляре скульптурный бюст. Более слабые выступы по бокам дополняют фигуру, которую теперь называют Шлемом Тора. Дугу купола очерчивает газ, подхваченный ветром звезды HD 56925. Изгибы показывают, где ветер встретил окружающее облако.',
      'À l’oculaire, la partie brillante évoquait pour John Herschel un buste sculpté. Les deux prolongements plus pâles complètent la silhouette appelée aujourd’hui Casque de Thor. L’arc du dôme dessine le gaz balayé par le vent de l’étoile HD 56925. Ses courbures marquent la rencontre de ce vent avec le nuage environnant.',
    ],
    related: {
      label: [
        '公众选中的观测目标',
        'A target chosen by the public',
        'Цель, выбранная зрителями',
        'Une cible choisie par le public',
      ],
      source: { name: 'ESO · VLT', url: 'https://www.eso.org/public/news/eso1238/' },
      text: [
        '2012 年，公众投票选出雷神头盔，作为欧洲南方天文台五十周年的拍摄目标。另一项竞赛的优胜者布丽吉特·巴约在帕拉纳尔天文台把甚大望远镜对准它，观测过程通过网络直播。',
        'In 2012 the public voted to point ESO’s Very Large Telescope at Thor’s Helmet for the observatory’s fiftieth anniversary. Brigitte Bailleul, winner of a second competition, made the observation at Paranal during a live webcast.',
        'В 2012 году зрители выбрали Шлем Тора целью Очень большого телескопа к пятидесятилетию ESO. Победительница другого конкурса Брижит Байё провела наблюдение в Паранале в прямом интернет-эфире.',
        'En 2012, le public choisit le Casque de Thor pour les cinquante ans de l’ESO. Brigitte Bailleul, lauréate d’un autre concours, pointa le Très Grand Télescope sur la nébuleuse à Paranal au cours d’une retransmission en direct.',
      ],
    },
  },
  NGC5139: {
    kind: 'history',
    source: {
      name: 'J. Dunlop · 1828 · № 440 · p. 136',
      url: 'https://archive.org/details/jstor-107841/page/n25/mode/1up',
    },
    text: [
      '托勒密把南天这处亮斑记作一颗星。1677 年，哈雷观察到它雾蒙蒙的外形。詹姆斯·邓洛普在澳大利亚用望远镜观察时，连中心也能分出一颗颗星。他在 1828 年星表第 440 项中记下八次观测，形容这些星聚成一团圆球，越往中央越密。',
      'Ptolemy listed this southern light as a star. In 1677 Edmond Halley saw a hazy object. From Australia, James Dunlop could resolve stars right into its centre. Entry 440 in his 1828 catalogue records eight observations and describes a globe of stars growing more crowded towards the middle.',
      'Птолемей занёс это светлое пятно южного неба в список звёзд. В 1677 году Эдмонд Галлей увидел туманное пятно. В Австралии Джеймс Данлоп различил отдельные звёзды до самого центра. Под номером 440 в каталоге 1828 года он отметил восемь наблюдений и описал шар из звёзд, всё более тесно расположенных к середине.',
      'Ptolémée comptait cette lueur australe parmi les étoiles. En 1677, Edmond Halley y vit une tache nébuleuse. Depuis l’Australie, James Dunlop distingua des étoiles jusqu’au centre. À l’entrée 440 de son catalogue de 1828, il consigna huit observations et décrivit une boule d’étoiles de plus en plus serrées vers le milieu.',
    ],
  },
  NGC6543: {
    kind: 'history',
    text: [
      '威廉·哈金斯把猫眼星云的光送进分光仪，发现亮光集中在少数谱线。大量恒星的合光通常会铺出连续的光谱。几根细窄亮线表明，望远镜里那点难辨的“雾”含有真正发光的气体。用颜色拆开光，比再放大一层更能认清它。',
      'William Huggins sent light from the Cat’s Eye through a spectroscope. Much of the light fell in a few bright lines, quite different from the continuous spectrum of combined starlight. Those narrow lines showed that the blur contained luminous gas. Dispersing the light revealed something magnification alone could not.',
      'Уильям Хаггинс пропустил свет Кошачьего Глаза через спектроскоп и увидел отдельные яркие линии. Совокупный звёздный свет обычно даёт непрерывный спектр. Линии показали, что пятно содержит светящийся газ. Разложение света дало ответ, которого не давало простое увеличение.',
      'William Huggins fit passer la lumière de l’Œil de chat dans un spectroscope. Elle se concentrait en quelques raies brillantes, bien différentes du spectre continu produit par des étoiles réunies. Ces raies révélèrent du gaz lumineux dans la tache. La dispersion montrait ce que le grossissement seul ne pouvait dévoiler.',
    ],
  },
  NGC253: {
    kind: 'discovery',
    source: {
      name: 'NASA · Sculptor Galaxy',
      url: 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-65/',
    },
    text: [
      '1783 年，卡罗琳·赫歇尔在搜寻彗星时发现了这片微光。把望远镜对准她找到的位置，今天仍能看见一条斜卧的亮带。哈勃把这道光分解成密布的蓝色年轻恒星和横穿星盘的暗尘丝，显出玉夫座星系正在大量形成恒星。',
      'Caroline Herschel found this patch of light in 1783 while searching for comets. It still shows up as a tilted streak in a telescope. Hubble resolves the streak into a disk crowded with young blue stars and threaded by dark dust, revealing the intense star formation in the Sculptor Galaxy.',
      'В 1783 году Каролина Гершель заметила это пятно света во время поисков комет. В телескоп галактика Скульптор видна как наклонная светлая полоска. «Хаббл» различил в ней множество молодых голубых звёзд и тёмные нити пыли. Так видны следы интенсивного рождения звёзд в её диске.',
      'En 1783, Caroline Herschel repéra cette lueur en cherchant des comètes. Elle apparaît encore au télescope comme une traînée oblique. Hubble y distingue des milliers de jeunes étoiles bleues et de sombres filaments de poussière qui traversent le disque. On y voit la vive activité de formation stellaire de la galaxie du Sculpteur.',
    ],
  },
  NGC6334: {
    kind: 'discovery',
    source: catAndLobster,
    text: [
      '1837 年 6 月，约翰·赫歇尔在南非好望角观察天蝎座，只在目镜里辨出了今天“猫爪”上最亮的一枚肉垫。几十年后，照片让另外几处圆形亮斑也浮现出来，整片云才像一串爪印。每枚肉垫都是一片氢气，附近刚诞生的大质量恒星使它发光。',
      'In June 1837, observing Scorpius from the Cape of Good Hope, John Herschel saw just the brightest pad of the Cat’s Paw. Photographs taken decades later revealed the other rounded patches and the resemblance to a paw print. Each pad is a region of hydrogen lit by massive newborn stars.',
      'В июне 1837 года Джон Гершель наблюдал Скорпиона с мыса Доброй Надежды. В окуляре он различил лишь самую яркую из «подушечек» Кошачьей Лапы. Спустя десятилетия на фотографиях проявились остальные округлые пятна и стал виден весь отпечаток. Каждая «подушечка» — это водород, светящийся под действием молодых массивных звёзд.',
      'En juin 1837, depuis le cap de Bonne-Espérance, John Herschel n’aperçut dans le Scorpion que le plus brillant des « coussinets » de la Patte de chat. Des décennies plus tard, la photographie révéla les autres taches arrondies et l’empreinte entière se dessina. Chaque coussinet est une région d’hydrogène éclairée par de jeunes étoiles massives.',
    ],
    related: {
      label: [
        '韦伯拍下的一枚“肉垫”',
        'One paw pad through Webb',
        'Одна «подушечка» глазами «Уэбба»',
        'Un « coussinet » vu par Webb',
      ],
      source: {
        name: 'NASA · Webb',
        url: 'https://science.nasa.gov/asset/webb/cats-paw-nebula-nircam-image/',
      },
      text: [
        '2025 年，韦伯团队选了猫爪的一小块天区，纪念科学观测三周年。在近红外相机的视场里，一枚“肉垫”展开成尘柱、年轻恒星和发亮的云壁。',
        'For Webb’s third science anniversary in 2025, the team framed a small part of the Cat’s Paw. One of the pads fills the near-infrared view with pillars of dust, young stars and bright cloud walls.',
        'В 2025 году к трёхлетию научной работы «Уэбба» команда выбрала небольшой участок Кошачьей Лапы. В ближнем инфракрасном свете внутри одной «подушечки» проявились пылевые столбы, молодые звёзды и светящиеся стенки облака.',
        'Pour les trois ans des observations scientifiques de Webb en 2025, l’équipe cadra une petite partie de la Patte de chat. Dans l’un des « coussinets », le proche infrarouge révèle des piliers de poussière, de jeunes étoiles et des parois lumineuses.',
      ],
    },
  },
  NGC7635: {
    kind: 'discovery',
    source: {
      name: 'W. Herschel · 1789 · IV.52 · p. 248',
      url: 'https://doi.org/10.1098/rstl.1789.0021',
    },
    text: [
      '1787 年 11 月 3 日，威廉·赫歇尔在仙后座发现了气泡星云。他在记录里写下的是一颗约九等的星，四周带着一小片极淡的雾光。今天能看清这层雾光的轮廓，也能看出吹胀气泡的恒星偏在一旁。气壳的一侧遇到更稠密的气体，向那个方向膨胀得慢些。',
      'William Herschel discovered the Bubble Nebula in Cassiopeia on 3 November 1787. His observing entry describes a ninth-magnitude star in a small patch of very faint haze. Images now trace the shell around it and show the star that blows the bubble sitting off-centre. On one side the expanding shell runs into denser gas and advances more slowly.',
      '3 ноября 1787 года Уильям Гершель открыл туманность Пузырь в Кассиопее. В его записи — звезда девятой величины с небольшим пятном очень слабого тумана вокруг. Теперь на снимках заметно, что звезда, раздувающая оболочку, смещена к её краю. С одной стороны оболочка встречает более плотный газ и расширяется медленнее.',
      'Le 3 novembre 1787, William Herschel découvrit la nébuleuse de la Bulle dans Cassiopée. Il nota une étoile de neuvième magnitude entourée d’une petite nébulosité très faible. Les images révèlent aujourd’hui la coquille et l’étoile décentrée qui la gonfle. D’un côté, la coquille rencontre du gaz plus dense qui ralentit son expansion.',
    ],
    related: {
      label: [
        '哈勃拼出的气泡全景',
        'Hubble’s mosaic of the bubble',
        'Мозаика Пузыря от «Хаббла»',
        'La mosaïque de la Bulle par Hubble',
      ],
      source: {
        name: 'NASA · Hubble',
        url: 'https://science.nasa.gov/asset/hubble/bubble-nebula-ngc-7635/',
      },
      text: [
        '2016 年，哈勃团队为望远镜升空二十六周年拼出气泡全景。早年的两次哈勃观测只拍下了壳层的局部，新画面把分散的弧段接成了一个轮廓。',
        'For Hubble’s twenty-sixth anniversary in 2016, its team assembled a portrait of the whole bubble. Two earlier Hubble views covered smaller parts of the shell. The mosaic put the separate arcs into one outline.',
        'К двадцатишестилетию запуска «Хаббла» в 2016 году команда составила мозаику всего Пузыря. На двух прежних снимках были видны лишь части оболочки. В мозаике отдельные дуги сложились в единый контур.',
        'En 2016, pour les vingt-six ans de Hubble, l’équipe assembla une mosaïque de la Bulle entière. Deux vues antérieures de Hubble couvraient des portions de la coquille. La mosaïque raccorda les arcs en un seul contour.',
      ],
    },
  },
  NGC6357: {
    kind: 'discovery',
    source: catAndLobster,
    text: [
      '1837 年 6 月，约翰·赫歇尔在好望角巡看天蝎座的两个相邻天区，在相继的两夜记录下今天的猫爪星云和 NGC 6357。后来拍下的广域照片显出了 NGC 6357 向两旁伸出的亮弧，像一对螯，“龙虾星云”便成了它的绰号。新生大质量恒星正在照亮这些弧里的氢气。',
      'At the Cape of Good Hope in June 1837, John Herschel saw traces of the Cat’s Paw and NGC 6357 on consecutive nights in Scorpius. Wide photographs later showed luminous arcs reaching out on either side of NGC 6357 like a pair of claws, giving it the nickname Lobster Nebula. Massive young stars light the hydrogen in those arcs.',
      'В июне 1837 года у мыса Доброй Надежды Джон Гершель за две ночи подряд заметил в Скорпионе Кошачью Лапу и соседнюю NGC 6357. Позднее на широких снимках NGC 6357 проявились светлые дуги, расходящиеся как клешни. Отсюда прозвище Омар. Водород в дугах светится под действием молодых массивных звёзд.',
      'Au cap de Bonne-Espérance, en juin 1837, John Herschel aperçut la Patte de chat et sa voisine NGC 6357 deux nuits de suite dans le Scorpion. Les images à grand champ révélèrent ensuite les arcs lumineux qui s’étendent de chaque côté de NGC 6357 comme deux pinces, d’où le surnom de Homard. De jeunes étoiles massives éclairent l’hydrogène de ces arcs.',
    ],
  },
  NGC292: {
    kind: 'name',
    source: cloudNames,
    text: [
      '在南天肉眼可见的两片亮云里，这一片较小。拜耳在 1603 年星图的南天极图版上就用拉丁名 Nubecula Minor（小云）将它与另一片区别开来。航海者把这对亮云称作麦哲伦云。用望远镜看这片“小云”，里面可以辨出成群的恒星，它本身是一座邻近的矮星系。',
      'This is the smaller of two luminous clouds visible by eye in the southern sky. In 1603 Bayer labelled it Nubecula Minor, the smaller cloud, on his chart of the south celestial pole. Seafarers called the pair the Magellanic Clouds. A telescope resolves crowds of stars in the little cloud, a neighbouring dwarf galaxy.',
      'Из двух светлых облаков, видимых глазом на южном небе, это меньшее. В 1603 году Байер подписал его на карте южного полюса неба Nubecula Minor — Малое Облако. Моряки называли пару Магеллановыми Облаками. В телескоп Малое Облако распадается на множество звёзд соседней карликовой галактики.',
      'Des deux nuages lumineux visibles à l’œil nu dans le ciel austral, celui-ci est le plus petit. En 1603, sur sa carte du pôle céleste sud, Bayer le nomma Nubecula Minor, le Petit Nuage. Les marins appelaient la paire les Nuages de Magellan. Au télescope, ce petit nuage se résout en une multitude d’étoiles d’une galaxie naine voisine.',
    ],
    related: {
      label: [
        '勒维特在云中变星里发现的规律',
        'The pattern Leavitt found in the Cloud’s variable stars',
        'Закономерность, найденная Ливитт у переменных звёзд Облака',
        'La relation découverte par Leavitt parmi les étoiles variables du Nuage',
      ],
      source: {
        name: 'H. S. Leavitt · Harvard College Observatory',
        url: 'https://ui.adsabs.harvard.edu/abs/1912HarCi.173....1L/abstract',
      },
      text: [
        '亨丽埃塔·勒维特在哈佛的玻璃底片上逐颗比较小麦哲伦云里的变星。它们离地球的距离大致相同，因此亮暗差可以和各自的变光周期比较。她找出的周期与光度关系后来成为量距离的工具。天空中一片肉眼可见的云，由此帮助人们量到了别的星系。',
        'Henrietta Leavitt compared the variable stars of the Small Magellanic Cloud on Harvard glass plates. Their similar distances allowed her to compare their apparent brightnesses with their periods. The period–luminosity relation became a distance indicator. This naked-eye cloud helped astronomers reach other galaxies.',
        'Генриетта Ливитт сравнивала переменные звёзды Малого Магелланова Облака на гарвардских стеклянных пластинках. Их близкие расстояния позволили сопоставить блеск и периоды. Найденная зависимость стала мерой расстояний. Видимое глазом облако помогло астрономам добраться до других галактик.',
        'Henrietta Leavitt compara les étoiles variables du Petit Nuage de Magellan sur les plaques de verre de Harvard. Leurs distances semblables permettaient de rapprocher éclats et périodes. La relation période-luminosité devint un indicateur de distance. Ce nuage visible à l’œil nu aida à mesurer d’autres galaxies.',
      ],
    },
  },
  NGC3324: {
    'kind': 'name',
    'source': { 'name': 'ESO · NGC 3324', 'url': 'https://www.eso.org/public/news/eso1207/' },
    'text': [
      '有人把 NGC 3324 周围的云称为“加夫列拉·米斯特拉尔星云”，借的是智利诺贝尔文学奖诗人的名字。在宽视场照片里，一道气体与尘埃的边墙像侧脸，中间的突出仿佛鼻尖。这个绰号帮人找到的是从地球看去的一段轮廓，缩小视场便可能很难认出那张脸。',
      'A nickname for the region around NGC 3324 honours the Chilean Nobel Prize-winning poet Gabriela Mistral. On wider images an edge of gas and dust resembles a face in profile, with a protrusion for the nose. The name picks out an outline as seen from Earth. A tighter framing can lose the face altogether.',
      'Область вокруг NGC 3324 иногда называют в честь чилийской поэтессы, нобелевского лауреата Габриэлы Мистраль. На широком снимке край газопылевой стены напоминает профиль лица с выступающим носом. Это очертание видно с Земли, а в более тесном кадре лицо может исчезнуть.',
      'La région de NGC 3324 est parfois nommée en l’honneur de la poétesse chilienne et prix Nobel Gabriela Mistral. Sur une vue large, le bord du mur de gaz et de poussière évoque un visage de profil, avec une avancée figurant le nez. Le surnom désigne un contour vu depuis la Terre, qui peut disparaître si l’on resserre le cadre.',
    ],
  },
  B33: {
    kind: 'discovery',
    source: {
      name: 'Harvard College Observatory · Plate Stacks',
      url: 'https://platestacks.cfa.harvard.edu/williamina-fleming/variable-stars-and-nebula',
    },
    text: [
      '1888 年，威廉明娜·弗莱明检查哈佛天文台的玻璃底片，在猎户座亮星云边缘记录了一处缺口。底片能长时间累积微弱的光，那片“缺口”反而因此显形。后来人们把这个向外伸出的暗影认成一匹马的头。',
      'In 1888 Williamina Fleming examined a Harvard glass plate and recorded an indentation in a bright nebula in Orion. Long exposure accumulated the faint background glow and made the missing light stand out. Observers later came to recognise a horse’s head in the dark silhouette.',
      'В 1888 году Вильямина Флеминг изучала стеклянную пластинку Гарвардской обсерватории и отметила выемку у края светлой туманности в Орионе. Длинная экспозиция накопила слабый свет фона и проявила тёмный силуэт. В его очертаниях позднее увидели конскую голову.',
      'En 1888, Williamina Fleming releva sur une plaque de verre de Harvard une échancrure au bord d’une nébuleuse lumineuse d’Orion. La longue pose accumulait la faible lueur du fond et faisait ressortir la lumière manquante. On reconnut plus tard une tête de cheval dans ce profil sombre.',
    ],
  },
  C14: {
    kind: 'history',
    source: nasaCaldwell,
    text: [
      '用肉眼望向英仙座，可以留意一小片朦胧星光。望远镜把这片光分成两个稠密中心，NGC 编目时两团星分别取得 869 与 884 两个号。在帕特里克·穆尔的考德威尔观测表里，它们又以同一宽视场目标 C14 出现。同一处景观可以对应两个星团，也可以对应一次完整的观测。',
      'A faint patch in Perseus breaks into two dense centres through a telescope. The NGC gives the clusters separate numbers, 869 and 884. Patrick Moore’s Caldwell observing list brings them back together as C14. Two physical clusters make one wide-field telescopic sight.',
      'Телескоп делит слабое пятно в Персее на два густых центра. В NGC скопления получили отдельные номера 869 и 884, а наблюдательный список Колдуэлла Патрика Мура снова объединяет их в C14. Два физических скопления составляют один широкоугольный вид.',
      'Une pâle tache de Persée se résout en deux concentrations au télescope. Le NGC donne aux amas les numéros 869 et 884. La liste d’observation Caldwell de Patrick Moore les réunit sous C14. Deux amas physiques composent ainsi un seul spectacle en grand champ.',
    ],
  },
  C9: {
    kind: 'name',
    source: nasaCaldwell,
    text: [
      '洞穴星云的名字抓住了人眼先注意到的形状。明亮的云边绕过一块暗区，看起来像洞口。帕特里克·穆尔为观测者编排考德威尔表时，把这里列为 C9。换用能穿透尘埃的波段，那个似乎空着的地方还藏着物质。',
      'The Cave Nebula takes its nickname from a bright rim curving around a dark patch like the mouth of a cavern. Patrick Moore included it as C9 in his list for observers. At wavelengths that penetrate dust, the apparently hollow part of the picture still contains material.',
      'Название Пещера возникло из-за светлой дуги вокруг тёмного участка, похожей на вход в пещеру. Патрик Мур включил туманность под номером C9 в свой список для наблюдателей. На длинах волн, проходящих сквозь пыль, видно, что «пустота» содержит вещество.',
      'Le nom de la Grotte évoque un rebord lumineux qui entoure une zone sombre comme une entrée de caverne. Patrick Moore l’inscrivit sous C9 dans sa liste d’observation. Aux longueurs d’onde qui traversent la poussière, la cavité apparente contient encore de la matière.',
    ],
  },
  C41: {
    kind: 'name',
    source: {
      name: 'NASA · Hyades',
      url: 'https://science.nasa.gov/solar-system/skywatching/night-sky-network/spot-the-young-stars-of-the-hyades-and-pleiades/',
    },
    text: [
      '指南里常用一张 V 字形的牛脸来找毕星团，橙色的毕宿五恰好落在一只眼睛的位置。测量距离和共同运动以后，才知道这颗抢眼的星位于星团前面。古人用图形传授的找星方法依然好用，图案里的“眼睛”和牛脸却不在同一层空间。',
      'Observers have long found the Hyades by the V that outlines the Bull’s face. Orange Aldebaran looks like an eye set into it. Distances and motions show that the bright eye lies in front of the cluster. The familiar picture still works as a guide even though its points occupy different depths.',
      'Гиады находят по букве V, очерчивающей морду Тельца. Оранжевый Альдебаран кажется его глазом. Расстояния и движения показали, что эта яркая звезда ближе скопления. Узор удобен как ориентир, хотя его детали находятся на разной глубине.',
      'Le V des Hyades dessine la tête du Taureau, où la brillante Aldébaran orangée paraît tenir lieu d’œil. Les mesures de distance et de mouvement situent cet œil en avant de l’amas. La figure demeure un bon repère alors que ses points se trouvent à différentes profondeurs.',
    ],
  },
  C99: {
    kind: 'name',
    source: { name: 'ESO · Coalsack', url: 'https://www.eso.org/public/images/b06/' },
    text: [
      '煤袋得名于南十字座旁一块肉眼可见的暗斑。在银河洒满星光的背景上，观测者曾用日常生活中装煤的袋子来形容它。这里的星云靠遮住背后的星光显形，越是把天区放宽，那个给它取名的反差越容易看出来。',
      'Beside the Southern Cross a patch of darkness is visible by eye against the star-filled Milky Way. Observers likened it to an everyday sack of coal. The nebula appears by blocking background starlight. A wide field restores the contrast that gave the object its nickname.',
      'Рядом с Южным Крестом глаз замечает тёмное пятно на звёздном фоне Млечного Пути. Наблюдатели сравнили его с мешком угля. Туманность видна по свету, который она поглощает, а широкое поле возвращает контраст, породивший её название.',
      'Près de la Croix du Sud, une tache sombre se distingue à l’œil nu sur la Voie lactée. Les observateurs la comparèrent à un sac de charbon. Le nuage dessine sa forme en masquant les étoiles de fond, et le grand champ retrouve le contraste qui a inspiré son nom.',
    ],
  },
  Cl399: {
    kind: 'name',
    source: openNGC,
    text: [
      '把视场转到狐狸座，几颗星排成一条横梁，弯起的另一列像挂钩，所以观测者叫它“衣架”。旧目录把这幅图案作为 Collinder 399 收入星团清单。沿视线测量成员的距离后，这个一眼可认的衣架仍留在星图上，代表的是星空中的投影图形。',
      'In Vulpecula a line of stars forms a crossbar, while a curving group makes a hook. Observers called it the Coathanger. Collinder 399 entered an old cluster catalogue under that impression. Stellar distances later clarified why the recognisable outline is best treated as a pattern on the sky.',
      'В Лисичке ряд звёзд образует перекладину, а дуга похожа на крючок. Так возникло название Вешалка. В каталоге Коллиндера фигура оказалась под номером 399 среди скоплений. Расстояния до звёзд объяснили, почему знакомый рисунок описывают как проекцию на небо.',
      'Dans le Petit Renard, une ligne d’étoiles figure une barre et quelques autres se recourbent en crochet. Les observateurs l’ont appelé le Cintre. Collinder 399 figura dans un catalogue d’amas. Les distances stellaires ont ensuite éclairci la nature de ce dessin projeté sur le ciel.',
    ],
  },
  HCG92: {
    kind: 'discovery',
    source: { name: 'ESA / Webb · Stephan’s Quintet', url: 'https://esawebb.org/news/weic2208/' },
    text: [
      '1877 年，爱德华·斯蒂芬在马赛观测到这组相邻的小片星光，因此留下“五重星系”的名字。随着人们能测出各星系的距离，看起来同场的五座星系里，有一座原来近得多。这个名字保留的是最初在目镜里所见的集体肖像。',
      'In 1877 Édouard Stephan observed the small neighbouring patches from Marseille, giving Stephan’s Quintet its name. Distance measurements later showed that one of the five lies much nearer than the others. The familiar name preserves the group portrait as it first appeared in the eyepiece.',
      'В 1877 году Эдуар Стефан в Марселе наблюдал несколько соседних пятен, давших название Квинтету Стефана. Позднее измерения показали, что одна из пяти галактик значительно ближе. Старинное название сохранило групповой портрет, каким он представлялся в окуляре.',
      'En 1877, Édouard Stephan observa à Marseille ces petites taches voisines, d’où le nom de Quintette de Stephan. Les distances révélèrent ensuite qu’une des cinq galaxies est bien plus proche. Le nom a gardé le portrait de groupe tel qu’il se présentait à l’oculaire.',
    ],
  },
  HCG79: {
    kind: 'name',
    source: {
      name: 'NASA · Seyfert’s Sextet',
      url: 'https://science.nasa.gov/asset/hubble/seyferts-sextet-four-colliding-galaxies-and-two-bystanders/',
    },
    text: [
      '20 世纪 40 年代末，卡尔·塞弗特在巨蛇座辨认出六团挨得很近的微光，这就是“塞弗特六重星系”名字的来历。他已经怀疑其中一团是从星系里扯出来的尾巴。后来的观测认出四座彼此相互作用的星系、一座更远的背景星系，以及那条由恒星组成的潮汐尾。',
      'In the late 1940s Carl Seyfert identified six patches close together in Serpens, hence Seyfert’s Sextet. He already suspected that one was a tail torn from a galaxy. Later observations distinguish four interacting galaxies, a more distant background galaxy, and the tidal stream of stars that makes up the sixth patch.',
      'В конце 1940-х Карл Сейферт выделил в Змее шесть соседних пятен, откуда название Секстет Сейферта. Уже тогда он предположил, что одно из них — хвост, вырванный из галактики. Последующие наблюдения различили четыре взаимодействующие галактики, далёкую фоновую галактику и приливной хвост из звёзд.',
      'À la fin des années 1940, Carl Seyfert reconnut six taches très proches dans le Serpent, d’où le nom de Sextette de Seyfert. Il soupçonnait déjà que l’une était une traînée arrachée à une galaxie. Les observations ultérieures distinguent quatre galaxies en interaction, une galaxie bien plus lointaine et une queue de marée formée d’étoiles.',
    ],
  },
  PGC143: {
    kind: 'name',
    source: {
      name: 'ESO · Wolf–Lundmark–Melotte',
      url: 'https://www.eso.org/public/news/eso9633/',
    },
    text: [
      '这座矮星系常写作 WLM。1909 年，马克斯·沃尔夫在海德堡天文台拍摄的玻璃底片上发现了它。1926 年，克努特·伦德马克和菲利贝尔·梅洛特认出那片微光是一座星系。W、L、M 分别取自三人的姓，记下了拍到这个天体和认清它身份的两段经历。',
      'The dwarf galaxy PGC 143 is usually called WLM. In 1909 Max Wolf spotted it on photographic plates taken at Heidelberg Observatory. Knut Lundmark and Philibert Melotte recognised the faint patch as a galaxy in 1926. The three initials preserve the names behind the sighting and the later identification.',
      'Карликовую галактику PGC 143 обычно называют WLM. В 1909 году Макс Вольф нашёл её на фотопластинках Гейдельбергской обсерватории. В 1926 году Кнут Лундмарк и Филибер Мелотт распознали в слабом пятне галактику. Три инициала сохранили имена наблюдателя и двух астрономов, установивших её природу.',
      'La galaxie naine PGC 143 est couramment appelée WLM. En 1909, Max Wolf la repéra sur des plaques photographiques de l’observatoire de Heidelberg. En 1926, Knut Lundmark et Philibert Melotte reconnurent une galaxie dans cette faible tache. Les trois initiales gardent la trace du repérage puis de l’identification.',
    ],
  },
  'ESO097-013': {
    kind: 'discovery',
    source: {
      name: 'University of Queensland · Circinus',
      url: 'https://news.uq.edu.au/1998-06-26-scientists-discover-galactic-mystery',
    },
    text: [
      '圆规座星系离我们相当近，却藏在银河盘明亮而多尘的方向。肯·弗里曼在一张巡天底片上注意到一抹模糊的光，1977 年他和同事发表了观测。前景恒星和尘埃掩住了星系的大部分光，底片上的小斑点原来是隔着银河系看到的另一座旋涡星系。',
      'The Circinus Galaxy is nearby but sits behind a dusty, star-filled part of the Milky Way. Ken Freeman noticed a smudge on a photographic plate, and his team published their observations in 1977. Much of the galaxy’s light is obscured in that direction. The mark on the plate was a spiral galaxy seen through our own.',
      'Галактика Циркуля находится сравнительно близко, но видна сквозь богатую пылью и звёздами полосу Млечного Пути. Кен Фримен заметил пятнышко на фотопластинке и с коллегами опубликовал наблюдения в 1977 году. За пылью нашей Галактики обнаружилась другая спиральная галактика.',
      'La galaxie du Compas est proche, dans une direction où abondent poussières et étoiles de la Voie lactée. Ken Freeman remarqua une tache sur une plaque photographique et son équipe publia ses observations en 1977. Une grande partie de sa lumière est masquée. La tache se révéla une galaxie spirale vue à travers la nôtre.',
    ],
  },
  'ESO270-017': {
    kind: 'discovery',
    source: {
      name: 'Fourcade et al. · El objeto Fourcade–Figueroa',
      url: 'https://sedici.unlp.edu.ar/handle/10915/98033',
    },
    text: [
      '1971 年发表的报告讲到，智利托洛洛山天文台用柯蒂斯施密特相机拍摄的底片上，出现了一道细长而弥散的光迹。研究者逐张比对，在当时的星表里也找不到对应记录。这个目标以福尔卡德和菲格罗亚的姓氏闻名，南天巡天编号是 ESO 270-017。',
      'A report published in 1971 described an elongated, diffuse mark on Curtis Schmidt plates from Cerro Tololo in Chile. Comparing the plates and existing catalogues, the observers found no matching entry. The galaxy is known by the surnames Fourcade and Figueroa and by the southern survey number ESO 270-017.',
      'В сообщении 1971 года описана вытянутая размытая полоска на пластинках камеры Шмидта Кёртиса в Серро-Тололо, Чили. Сопоставив снимки и тогдашние каталоги, наблюдатели не нашли подходящей записи. Галактика носит фамилии Фуркаде и Фигероа и номер южного обзора ESO 270-017.',
      'Un rapport publié en 1971 décrit une traînée allongée et diffuse sur des plaques de la chambre de Schmidt Curtis du Cerro Tololo, au Chili. Après comparaison des clichés et des catalogues existants, les observateurs ne trouvèrent aucune entrée correspondante. La galaxie porte les noms de Fourcade et Figueroa et le numéro ESO 270-017.',
    ],
  },
  PGC88608: {
    kind: 'discovery',
    source: {
      name: 'M. J. Irwin et al. · Sextans (1990)',
      url: 'https://ui.adsabs.harvard.edu/abs/1990MNRAS.244P..16I/abstract',
    },
    text: [
      '1990 年，迈克尔·欧文等人在研究六分仪座方向的巡天底片时，发现一小片天空里暗星比四周更密。剑桥的自动底片测量仪使研究者能逐点计数，把这点差别从背景中分离出来。这片稀疏的星群就是六分仪座矮椭球星系，银河系的一颗卫星星系。',
      'In 1990 Michael Irwin and colleagues reported an excess of faint stars on a survey plate in Sextans. The automated plate measuring facility at Cambridge let them count the points and pick out a slight concentration against the surrounding field. Those scattered stars belong to the Sextans dwarf spheroidal satellite of the Milky Way.',
      'В 1990 году Майкл Ирвин с коллегами обнаружил на обзорной фотопластинке в Секстанте избыток слабых звёзд. Автоматическая измерительная машина в Кембридже позволила их пересчитать и выделить небольшое сгущение на фоне соседних полей. Эти редкие звёзды принадлежат карликовой сфероидальной галактике Секстант, спутнику Млечного Пути.',
      'En 1990, Michael Irwin et ses collègues signalèrent un excès d’étoiles faibles sur une plaque de relevé dans le Sextant. La machine de mesure automatique de Cambridge permit de les compter et de distinguer une légère concentration sur le fond du ciel. Ces étoiles éparses forment la galaxie naine sphéroïdale du Sextant, satellite de la Voie lactée.',
    ],
  },
  'JWST-CARINA-2022': {
    kind: 'history',
    source: webbCliffs,
    text: [
      '2022 年 7 月，韦伯望远镜首批公布的科学影像里出现了这幅“宇宙悬崖”。近红外相机越过部分遮光尘埃，把新生恒星和发光气体分别显露出来。图中的色彩用来呈现不可见的红外波段。取景框标出这一次摄影选择的区域，实际星云还延伸到框外。',
      'The Cosmic Cliffs were among Webb’s first science images released in July 2022. Its near-infrared camera looked through some of the dust to reveal young stars and luminous gas. Assigned colours make the invisible infrared bands visible. The frame records one photographic choice within a larger nebula.',
      '«Космические скалы» вошли в число первых научных снимков «Уэбба» в июле 2022 года. Камера ближнего ИК-диапазона увидела молодые звёзды и светящийся газ сквозь часть пыли. Видимые цвета передают невидимые полосы, а рамка выделяет лишь участок большой туманности.',
      'Les Falaises cosmiques figuraient parmi les premières images scientifiques de Webb diffusées en juillet 2022. La caméra proche infrarouge a révélé de jeunes étoiles et du gaz à travers une partie de la poussière. Les couleurs traduisent des bandes invisibles et le cadre délimite un choix photographique dans une nébuleuse plus vaste.',
    ],
  },
  LMC: {
    kind: 'name',
    source: cloudNames,
    text: [
      '南天的人们早已认识这两片肉眼可见的亮云。1603 年，拜耳的星图在较大的一片旁标出拉丁名 Nubecula Major，意思是“大云”。航海者把两片云和麦哲伦的远航联系起来，哈雷在 1679 年的星表附录里就记下了水手对它们的称呼。水手的名字后来也进入了天文学。',
      'People under southern skies knew the two luminous clouds by eye. In his 1603 atlas Bayer labelled the larger one Nubecula Major, Latin for the larger cloud. Sailors connected the pair with Magellan’s voyage. Halley recorded their name in a catalogue appendix in 1679, long before it became common in astronomical writing.',
      'Жители Южного полушария давно знали два видимых глазом светлых облака. На карте Байера 1603 года большее подписано по-латыни Nubecula Major — Большое Облако. Моряки связывали пару с плаванием Магеллана. Галлей в приложении к каталогу 1679 года записал это морское название, позднее вошедшее и в астрономию.',
      'Les habitants des régions australes connaissaient de longue date ces deux lueurs visibles à l’œil nu. En 1603, Bayer inscrivit près de la plus grande le nom latin Nubecula Major, le Grand Nuage. Les marins associaient les deux taches au voyage de Magellan. Halley consigna leur appellation en 1679, bien avant sa diffusion dans les écrits astronomiques.',
    ],
    related: {
      label: [
        '1987 年云中的超新星',
        'The 1987 supernova in the Cloud',
        'Сверхновая 1987 года в Облаке',
        'La supernova de 1987 dans le Nuage',
      ],
      source: {
        name: 'NASA · Hubble / SN 1987A',
        url: 'https://science.nasa.gov/asset/hubble/supernova-1987a-2/',
      },
      text: [
        '1987 年 2 月，大麦哲伦云中突然出现了一颗肉眼可见的新亮点，这就是超新星 1987A。哈勃升空后，天文学家继续跟踪爆发周围的气体环，看见环上原来就分布不均的物质。邻近星系中的一次爆发，从当晚的意外，变成了跨越数十年的连续观测。',
        'In February 1987 a new point of light appeared in the Large Magellanic Cloud, bright enough to be seen by eye. It was Supernova 1987A. After Hubble’s launch, images resolved clumps in a ring of gas around the explosion. One night’s surprise in a neighbouring galaxy grew into a record spanning decades.',
        'В феврале 1987 года в Большом Магеллановом Облаке появилась видимая глазом точка — сверхновая 1987A. После запуска «Хаббла» снимки различили неоднородности в газовом кольце вокруг взрыва. Неожиданность одной ночи в соседней галактике превратилась в ряд наблюдений длиной в десятилетия.',
        'En février 1987, un point assez brillant pour être vu à l’œil nu apparut dans le Grand Nuage de Magellan. C’était la supernova 1987A. Après le lancement de Hubble, les images révélèrent des amas de matière dans un anneau de gaz autour de l’explosion. La surprise d’un soir devint une série d’observations sur des décennies.',
      ],
    },
  },
};
export function landmarkHistory(id, i) {
  const record = stories[id];
  if (!record) return null;
  return {
    story: record.text[i],
    storyKind: record.kind,
    source: record.source,
    further: record.further,
    relatedStory: record.related && {
      kind: 'history',
      label: record.related.label[i],
      text: record.related.text[i],
      links: [record.related.source],
    },
  };
}
const familySources = {
  ESO: {
    name: 'Lauberts · ESO/Uppsala · NASA/HEASARC',
    url: 'https://heasarc.gsfc.nasa.gov/W3Browse/all/esouppsala.html',
  },
  Mel: {
    name: 'P. J. Melotte · 1915',
    url: 'https://ui.adsabs.harvard.edu/abs/1915MmRAS..60..175M/abstract',
  },
  HCG: hcg,
  MWSC: {
    name: 'N. Kharchenko et al. · MWSC',
    url: 'https://ui.adsabs.harvard.edu/abs/2013A%26A...558A..53K/abstract',
  },
  PGC: {
    name: 'G. Paturel et al. · Catalogue of Principal Galaxies',
    url: 'https://ui.adsabs.harvard.edu/abs/1989A%26AS...80..299P/abstract',
  },
  UGC: {
    name: 'P. Nilson · Uppsala General Catalogue of Galaxies',
    url: 'https://ui.adsabs.harvard.edu/abs/1973UGC...C......0N/abstract',
  },
};
// Number, name in the published MWSC table, membership aperture (degrees), and
// number of their most probable members inside that radius. Kharchenko et al. 2013,
// table catalog, columns MWSC, Name, r2 and N1sr2. These are survey selections.
const clusterMeasurements = {
  Mel71: [1287, 'Melotte 71', 0.34, 330],
  Mel72: [1293, 'Melotte 72', 0.22, 143],
  Mel101: [1840, 'Melotte 101', 0.23, 248],
  Mel105: [1933, 'Melotte 105', 0.16, 178],
  H05: [2033, 'Collinder 258', 0.195, 318],
  H13: [2523, 'Harvard 13', 0.11, 84],
  H20: [3198, 'Harvard 20', 0.135, 123],
  H21: [3774, 'Harvard 21', 0.06, 40],
  MWSC3156: [3156, 'Terzan 8', 0.11, 41],
  MWSC3171: [3171, 'Palomar 11', 0.15, 48],
  MWSC3561: [3561, 'Palomar 12', 0.09, 9],
};

export function otherCatalogueHistory(object, i) {
  const id = object.id;
  const cluster = clusterMeasurements[id];
  if (cluster) {
    const [number, name, radius, count] = cluster;
    const angle =
      radius.toLocaleString(['zh', 'en', 'ru', 'fr'][i], { maximumFractionDigits: 3 }) + '°';
    return {
      storyKind: 'catalogue',
      source: {
        name: 'Kharchenko et al. · MWSC ' + number,
        url:
          'https://vizier.cfa.harvard.edu/viz-bin/VizieR?-source=J/A%2BA/558/A53/catalog&MWSC=' +
          number,
      },
      story: [
        `2013 年发表的银河系星团巡天把 ${name} 列为 MWSC ${number}。研究团队比较恒星在天空中的运动和近红外亮度，在星团中心周围半径 ${angle} 内选出了 ${count} 颗最有可能属于它的恒星。`,
        `The 2013 Milky Way Star Clusters survey lists ${name} as MWSC ${number}. Comparing the stars’ motions across the sky and their near-infrared brightnesses, the team selected ${count} stars as its most probable members within ${angle} of the cluster centre.`,
        `В обзоре звёздных скоплений Млечного Пути 2013 года ${name} значится под номером MWSC ${number}. Авторы сравнили собственные движения и блеск звёзд в ближнем инфракрасном диапазоне. Число наиболее вероятных членов скопления в радиусе ${angle} от центра составило ${count}.`,
        `Le relevé des amas de la Voie lactée publié en 2013 recense ${name} sous le numéro MWSC ${number}. L’équipe a comparé les mouvements des étoiles sur le ciel et leurs éclats dans le proche infrarouge. Dans un rayon de ${angle} autour du centre, elle a retenu ${count} étoiles comme membres les plus probables de l’amas.`,
      ][i],
    };
  }
  const field = /^ESO(\d+)-(\d+)$/.exec(id);
  const family = /^[A-Za-z]+/.exec(id)?.[0];
  const number = id.slice(family?.length || 0);
  const narrative = field
    ? [
        `ESO ${field[1]}-${field[2]} 的两段数字可以直接用来翻查南天巡天底片。第一段指向第 ${Number(field[1])} 号天区，第二段是在这片天区登记的第 ${Number(field[2])} 项。劳贝茨编的 1982 年目录来自对南天蓝光底片的逐区检查。`,
        `The two numbers in ESO ${field[1]}-${field[2]} lead back to a southern survey plate. The first denotes field ${Number(field[1])}, the second entry ${Number(field[2])} in that field. Lauberts’s 1982 catalogue was compiled by inspecting blue photographic plates field by field.`,
        `Обозначение ESO ${field[1]}-${field[2]} читается по номерам южного обзора. Первый указывает поле ${Number(field[1])}, второй — запись ${Number(field[2])} внутри этого поля. Каталог Лаубертса 1982 года основан на просмотре синих фотопластинок южного неба.`,
        `Les deux nombres de ESO ${field[1]}-${field[2]} permettent de remonter aux plaques du relevé austral. Le premier désigne le champ ${Number(field[1])}, le second l’entrée ${Number(field[2])} de ce champ. Le catalogue publié par Lauberts en 1982 repose sur l’examen des plaques du ciel austral en lumière bleue.`,
      ]
    : {
        Mel: [
          `梅洛特在 1915 年发表了从富兰克林–亚当斯星图底片上整理的星团目录，这群星列在第 ${number} 项。照相底片把相距较远的成员收入同一幅星野，便于看出整团在天空中占多大范围。`,
          `Melotte listed this cluster as entry ${number} in his 1915 survey of the Franklin-Adams photographic charts. The plates brought its widely spaced stars into one field, showing the extent of the whole grouping on the sky.`,
          `У Мелотта это скопление значится под номером ${number} в каталоге 1915 года, составленном по фотографическим картам Франклина-Адамса. На пластинке широко расставленные звёзды умещались в одном поле, показывая протяжённость всей группы.`,
          `Melotte a inscrit cet amas au numéro ${number} de son catalogue de 1915, établi sur les plaques photographiques de Franklin-Adams. Ces vues réunissaient ses étoiles espacées dans un même champ et rendaient visible l’étendue du groupe entier.`,
        ],
        PGC: [
          `帕蒂雷尔等人在 1989 年发表的《主要星系目录》用 PGC ${number} 索引这座星系。他们将以往各巡天采用的名称、位置和外形记录相互核对，使观测者可以把不同波段的资料归到同一个目标。`,
          `PGC ${number} is this galaxy’s identifier in the Catalogue of Principal Galaxies published by Paturel and colleagues in 1989. They matched names, positions and descriptions across surveys so that observations at different wavelengths could be traced to a common target.`,
          `PGC ${number} — обозначение галактики в Каталоге основных галактик, опубликованном Патюрелем и коллегами в 1989 году. Авторы сверили имена, координаты и описания из разных обзоров, чтобы соотнести наблюдения в разных диапазонах с одним объектом.`,
          `PGC ${number} est l’identifiant de cette galaxie dans le Catalogue des galaxies principales publié par Paturel et ses collègues en 1989. Les auteurs ont rapproché noms, positions et descriptions de plusieurs relevés pour relier à une même cible des observations à différentes longueurs d’onde.`,
        ],
        UGC: [
          `尼尔松在 1973 年发表的《乌普萨拉星系总表》中把这座星系列为 UGC ${number}。他检查帕洛马巡天的摄影底片，记录了星系在底片上的轮廓和视大小。`,
          `Nilson listed this galaxy as UGC ${number} in the 1973 Uppsala General Catalogue of Galaxies. He examined Palomar sky survey plates to record the shapes and apparent sizes of the galaxies on those photographs.`,
          `В Уппсальском общем каталоге галактик, изданном Нильсоном в 1973 году, это объект UGC ${number}. Нильсон просматривал фотопластинки Паломарского обзора, чтобы описать форму и угловые размеры галактик на снимках.`,
          `Nilson a inscrit cette galaxie sous le numéro UGC ${number} dans son catalogue général d’Uppsala de 1973. Il examinait les plaques du relevé de Palomar pour y relever les formes et les dimensions apparentes des galaxies.`,
        ],
      }[family];
  const position = modernDeepSkyPosition(object, i);
  return {
    story: [narrative?.[i], position].filter(Boolean).join(i === 0 ? '' : ' '),
    storyKind: 'catalogue',
    source: familySources[family] || openNGC,
  };
}
