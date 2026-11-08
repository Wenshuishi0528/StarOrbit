// Original educational summaries. Source links and model limits are part of
// each topic; links into the sky use existing physical catalogue identities.
const text = (zh, en, ru, fr) => ({ zh, en, ru, fr });
const source = (title, url) => ({ title, url });
const crab = (kind) => ({
  id: 'deep-sky:m1',
  label: text(
    '蟹状星云 M1',
    'Crab Nebula · M1',
    'Крабовидная туманность · M1',
    'Nébuleuse du Crabe · M1'
  ),
  note:
    kind === 'remnant'
      ? text(
          '1054 年超新星的遗迹；定位今天的天区，不重放当年的爆发。',
          'Remnant of the 1054 supernova; locate its present sky field, not the historical explosion.',
          'Остаток сверхновой 1054 года; переход к современному полю неба, а не к древней вспышке.',
          'Vestige de la supernova de 1054 : localisation actuelle, sans reconstitution de l’explosion.'
        )
      : text(
          '定位脉冲星所在的遗迹天区；巡天不会把中心中子星渲染成可分辨圆面。',
          'Locate the remnant containing the pulsar; the finder does not resolve the neutron star’s surface.',
          'Переход к остатку, содержащему пульсар; видоискатель не разрешает поверхность нейтронной звезды.',
          'Localise le vestige contenant le pulsar ; le viseur ne résout pas la surface de l’étoile à neutrons.'
        ),
});
const starTypes = source('NASA · Stellar types', 'https://science.nasa.gov/universe/stars/types/');
const pulsars = source(
  'NASA / Hubble · Pulsars',
  'https://science.nasa.gov/mission/hubble/science/science-behind-the-discoveries/hubble-pulsars/'
);
const crabSource = source(
  'NASA / Hubble · Messier 1',
  'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-1/'
);

export const COSMIC_TOPICS = [
  {
    id: 'supernova',
    accent: '#ffab75',
    copy: {
      zh: {
        title: '超新星',
        subtitle: '从核心坍缩到扩张遗迹',
        summary: '拨动演化阶段，观察大质量恒星如何释放外层物质，并留下致密核心。',
        facts: [
          '超新星是一场爆发现象；爆发后扩张的气体才是超新星遗迹。',
          '这里演示核心坍缩支路。另一重要支路是白矮星参与的 Ia 型热核超新星。',
          '核心坍缩后的结局可为中子星或黑洞，不能仅凭动画判定；抛射物把多种元素带入星际空间。',
        ],
        modelNote: '分阶段教学示意：时间、尺寸和亮度分别压缩，不是特定超新星的实测光变或爆发预报。',
      },
      en: {
        title: 'Supernova',
        subtitle: 'From core collapse to an expanding remnant',
        summary:
          'Explore evolutionary stages as a massive star ejects its outer layers and leaves a compact core.',
        facts: [
          'A supernova is an explosive event; its expanding debris forms a supernova remnant.',
          'This model shows core collapse. Type Ia thermonuclear supernovae involving white dwarfs form another major branch.',
          'Core collapse can leave a neutron star or black hole; ejecta carry many elements into interstellar space.',
        ],
        modelNote:
          'Staged teaching model with separately compressed time, size and brightness; not an observed light curve or explosion forecast.',
      },
      ru: {
        title: 'Сверхновая',
        subtitle: 'От коллапса ядра к расширяющемуся остатку',
        summary:
          'Исследуйте стадии, на которых массивная звезда выбрасывает оболочку и оставляет компактное ядро.',
        facts: [
          'Сверхновая — взрывное событие; расширяющееся вещество образует остаток сверхновой.',
          'Здесь показан коллапс ядра. Другая важная ветвь — термоядерные сверхновые типа Ia с участием белых карликов.',
          'После коллапса может остаться нейтронная звезда или чёрная дыра; выбросы обогащают межзвёздную среду элементами.',
        ],
        modelNote:
          'Учебные стадии с отдельными масштабами времени, размера и яркости; не измеренная кривая блеска и не прогноз взрыва.',
      },
      fr: {
        title: 'Supernova',
        subtitle: 'De l’effondrement du cœur au vestige en expansion',
        summary:
          'Explorez les étapes où une étoile massive expulse ses couches externes et laisse un cœur compact.',
        facts: [
          'Une supernova est un événement explosif ; ses débris en expansion forment un vestige de supernova.',
          'Ce modèle illustre l’effondrement du cœur. Les supernovas thermonucléaires de type Ia impliquant des naines blanches forment une autre branche majeure.',
          'L’effondrement peut laisser une étoile à neutrons ou un trou noir ; les éjectas enrichissent le milieu interstellaire en éléments.',
        ],
        modelNote:
          'Étapes pédagogiques aux échelles de temps, de taille et de luminosité distinctes ; ni courbe de lumière mesurée, ni prévision d’explosion.',
      },
    },
    targets: [
      crab('remnant'),
      {
        id: 'deep-sky:ngc6960',
        label: text(
          '西面纱星云 NGC 6960',
          'Western Veil · NGC 6960',
          'Западная Вуаль · NGC 6960',
          'Dentelle occidentale · NGC 6960'
        ),
        note: text(
          '另一片超新星遗迹；定位目录方向，影像覆盖沿用当前星空来源。',
          'Another supernova remnant; locate the catalogue field using the current sky-imagery coverage.',
          'Ещё один остаток сверхновой; переход к каталожному полю с текущим источником изображений.',
          'Un autre vestige de supernova ; son champ utilise la couverture du fond de ciel sélectionné.'
        ),
      },
    ],
    sources: [
      source(
        'NASA / Hubble · Stellar explosions',
        'https://science.nasa.gov/mission/hubble/science/science-behind-the-discoveries/hubble-stellar-explosions/'
      ),
      source(
        'Chandra · Supernovas and remnants',
        'https://chandra.si.edu/xray_sources/supernovas.html'
      ),
      crabSource,
    ],
  },
  {
    id: 'neutron',
    accent: '#8fdef3',
    copy: {
      zh: {
        title: '中子星',
        subtitle: '恒星质量，城市尺度',
        summary: '改变质量和半径，比较平均密度与引力紧致程度，理解致密天体的尺度。',
        facts: [
          '中子星是部分大质量恒星核心坍缩留下的致密天体，质量可超过太阳，半径只有十余千米。',
          '平均密度由质量和体积计算；它不是从表面到核心都相同的真实密度。',
          '磁场、自转和观测方向决定它表现为何种天体；中子星、脉冲星并不是互不相关的类别。',
        ],
        modelNote:
          '质量与半径可独立探索；球体与磁力线为示意，并未求解内部物态方程，也不保证每组参数对应真实稳定中子星。',
      },
      en: {
        title: 'Neutron star',
        subtitle: 'Stellar mass, city-sized radius',
        summary:
          'Adjust mass and radius to compare mean density and compactness at the scale of a stellar remnant.',
        facts: [
          'Some massive stellar cores collapse into neutron stars: more than a solar mass can fit within a radius of roughly a dozen kilometres.',
          'Mean density comes from mass and volume; it is not the actual density at every depth.',
          'Magnetism, rotation and viewing direction affect what we observe; pulsars are related to neutron stars, not an unrelated class.',
        ],
        modelNote:
          'Mass and radius vary independently. The sphere and field lines are schematic; no internal equation of state or stability is solved.',
      },
      ru: {
        title: 'Нейтронная звезда',
        subtitle: 'Звёздная масса в масштабе города',
        summary:
          'Меняйте массу и радиус, сравнивая среднюю плотность и компактность звёздного остатка.',
        facts: [
          'Коллапс некоторых массивных звёзд создаёт нейтронную звезду: масса больше солнечной умещается в радиусе около десятка километров.',
          'Средняя плотность вычисляется по массе и объёму; плотность внутри настоящей звезды меняется с глубиной.',
          'Магнитное поле, вращение и направление наблюдения определяют вид объекта; пульсары связаны с нейтронными звёздами.',
        ],
        modelNote:
          'Масса и радиус меняются независимо. Сфера и силовые линии условны; внутреннее уравнение состояния и устойчивость не рассчитываются.',
      },
      fr: {
        title: 'Étoile à neutrons',
        subtitle: 'Une masse stellaire à l’échelle d’une ville',
        summary:
          'Modifiez masse et rayon pour comparer la densité moyenne et la compacité d’un résidu stellaire.',
        facts: [
          'Certains cœurs stellaires massifs s’effondrent en étoiles à neutrons : plus d’une masse solaire peut tenir dans un rayon d’une douzaine de kilomètres.',
          'La densité moyenne vient de la masse et du volume ; la densité réelle varie avec la profondeur.',
          'Champ magnétique, rotation et direction d’observation déterminent l’apparence ; les pulsars sont liés aux étoiles à neutrons.',
        ],
        modelNote:
          'Masse et rayon sont indépendants. Sphère et lignes de champ sont schématiques ; ni équation d’état interne ni stabilité ne sont calculées.',
      },
    },
    targets: [crab('core')],
    sources: [
      starTypes,
      source(
        'MPIfR · Neutron stars',
        'https://www.mpifr-bonn.mpg.de/research/fundamental/neutronstars'
      ),
      crabSource,
    ],
  },
  {
    id: 'pulsar',
    accent: '#b9a4ff',
    copy: {
      zh: {
        title: '脉冲星',
        subtitle: '用旋转光束读懂宇宙灯塔',
        summary: '调整转动周期、磁轴倾角和观察方向，看辐射束何时扫过观察者。',
        facts: [
          '脉冲星通常是旋转的磁化中子星；辐射束扫过视线时，我们接收到周期信号。',
          '脉冲不等于整颗恒星反复熄灭。光束若错过观察方向，信号可能很弱或没有脉冲。',
          '真实脉冲星可在射电、可见光、X 射线或伽马射线波段被观测；不同波段的脉冲形状并不相同。',
        ],
        modelNote:
          '双束与信号曲线是几何教学模型，动画慢放；不是接收的射电数据，也不是对某颗脉冲星的拟合。',
      },
      en: {
        title: 'Pulsar',
        subtitle: 'A cosmic lighthouse in rotation',
        summary:
          'Change the rotation period, magnetic tilt and viewing direction to see when a beam crosses the observer.',
        facts: [
          'Pulsars are usually rotating, magnetized neutron stars; a beam crossing our sightline creates a periodic signal.',
          'The whole star does not repeatedly switch off. A beam can miss us, producing a weak signal or no pulse.',
          'Pulsars are observed in radio, visible, X-ray or gamma-ray bands; pulse profiles differ between wavelengths.',
        ],
        modelNote:
          'The two beams and signal curve form a slowed geometric teaching model, not received radio data or a fitted pulsar.',
      },
      ru: {
        title: 'Пульсар',
        subtitle: 'Вращающийся космический маяк',
        summary:
          'Меняйте период, наклон магнитной оси и направление наблюдения, чтобы луч пересекал линию зрения.',
        facts: [
          'Пульсары обычно являются вращающимися намагниченными нейтронными звёздами; пересечение лучом линии зрения создаёт периодический сигнал.',
          'Звезда не гаснет целиком при каждом обороте. Луч может пройти мимо нас, не создав заметного импульса.',
          'Пульсары наблюдают в радио-, оптическом, рентгеновском и гамма-диапазонах; форма импульсов зависит от длины волны.',
        ],
        modelNote:
          'Два луча и кривая сигнала — замедленная геометрическая модель, а не принятые радиоданные и не модель конкретного пульсара.',
      },
      fr: {
        title: 'Pulsar',
        subtitle: 'Un phare cosmique en rotation',
        summary:
          'Modifiez période, inclinaison magnétique et direction d’observation pour voir le faisceau croiser l’observateur.',
        facts: [
          'Les pulsars sont généralement des étoiles à neutrons magnétisées en rotation ; un faisceau croisant notre regard produit un signal périodique.',
          'L’étoile entière ne s’éteint pas à chaque tour. Un faisceau peut nous manquer, sans impulsion visible.',
          'Les pulsars sont observés en radio, en lumière visible, en rayons X ou gamma ; le profil varie selon la longueur d’onde.',
        ],
        modelNote:
          'Les deux faisceaux et la courbe illustrent une géométrie ralentie ; ce ne sont ni des données radio reçues ni un ajustement à un pulsar précis.',
      },
    },
    targets: [crab('core')],
    sources: [
      pulsars,
      source(
        'NASA / HEASARC · Pulsar introduction',
        'https://heasarc.gsfc.nasa.gov/docs/objects/pulsars/pulsarstext.html'
      ),
      crabSource,
    ],
  },
  {
    id: 'meteor',
    accent: '#8cddcf',
    copy: {
      zh: {
        title: '流星',
        subtitle: '宇宙碎屑与地球大气相遇',
        summary: '改变入射速度和角度，观察流星体进入大气后的发光轨迹。',
        facts: [
          '在太空中它是流星体；进入大气形成的发光现象叫流星；落到地面的残余才叫陨石。',
          '流星雨来自具有共同来源的碎屑群。看似从辐射点散开，是平行轨迹的透视效果。',
          '天空中的流星发生在近地大气里，不在遥远星座之间；速度和入射角会影响路径与持续时间。',
        ],
        modelNote:
          '120→40 km 的恒速直线路径示意，角度相对当地水平面，亮度为示意包络；不计算减速或烧蚀，也不预测流星雨、落点或陨石存留。',
      },
      en: {
        title: 'Meteor',
        subtitle: 'Space debris meets the atmosphere',
        summary:
          'Change entry speed and angle to explore the luminous path of a meteoroid entering the atmosphere.',
        facts: [
          'A meteoroid travels through space; its atmospheric light phenomenon is a meteor, and surviving material on the ground is a meteorite.',
          'Meteor showers come from related debris streams. Perspective makes nearly parallel tracks appear to diverge from a radiant.',
          'Meteors occur in nearby air, not among distant constellations; speed and entry angle influence their paths and duration.',
        ],
        modelNote:
          'Constant-speed straight path from 120 to 40 km; angle above the local horizontal and a schematic brightness envelope. No deceleration, ablation or impact prediction.',
      },
      ru: {
        title: 'Метеор',
        subtitle: 'Космическое вещество встречает атмосферу',
        summary: 'Меняйте скорость и угол входа, наблюдая светящийся путь метеороида в атмосфере.',
        facts: [
          'В космосе это метеороид; световое явление в атмосфере — метеор; уцелевшее вещество на земле — метеорит.',
          'Метеорные потоки состоят из родственных частиц. Перспектива заставляет почти параллельные пути расходиться из радианта.',
          'Метеоры возникают в близкой атмосфере, а не среди далёких созвездий; скорость и угол входа влияют на путь и длительность.',
        ],
        modelNote:
          'Прямой путь 120→40 км с постоянной скоростью; угол от местного горизонта, яркость условна. Замедление, абляция и падение не рассчитываются.',
      },
      fr: {
        title: 'Météore',
        subtitle: 'Des débris spatiaux rencontrent l’atmosphère',
        summary:
          'Modifiez vitesse et angle d’entrée pour explorer la trajectoire lumineuse d’un météoroïde dans l’atmosphère.',
        facts: [
          'Dans l’espace, c’est un météoroïde ; sa lumière dans l’atmosphère est un météore ; le fragment au sol est une météorite.',
          'Les pluies de météores viennent de débris apparentés. La perspective fait diverger des trajectoires presque parallèles depuis un radiant.',
          'Les météores se produisent dans l’air proche, pas parmi les constellations lointaines ; vitesse et angle influencent trajet et durée.',
        ],
        modelNote:
          'Trajet rectiligne de 120 à 40 km à vitesse constante ; angle au-dessus de l’horizontale locale, luminosité schématique. Ni décélération, ni ablation, ni prévision de chute.',
      },
    },
    targets: [],
    sources: [
      source(
        'NASA · Meteors and meteorites',
        'https://science.nasa.gov/solar-system/meteors-meteorites/facts/'
      ),
      source(
        'NASA · Meteor questions',
        'https://www.nasa.gov/blogs/watch-the-skies/2026/03/26/its-fireball-season-answering-your-meteor-questions/'
      ),
      source(
        'NASA / JPL · Space-rock definitions',
        'https://www.jpl.nasa.gov/asteroid-watch/fast-facts/'
      ),
    ],
  },
  {
    id: 'blackhole',
    accent: '#f4bd82',
    copy: {
      zh: {
        title: '黑洞',
        subtitle: '看不见的视界，发光的周围物质',
        summary: '改变质量与观看角度，观察视界尺度、吸积盘和光线弯曲的示意。',
        facts: [
          '事件视界是光无法向外逃逸的边界；发光的是外部气体，不是黑洞表面。',
          '吸积盘远侧的光可以弯到视线上；视觉上拱起的盘像并不表示有第二个实体圆盘。',
          '影子与事件视界不是同一个尺度；没有发光物质的孤立黑洞也不一定带有明亮圆环。',
        ],
        modelNote:
          '以不旋转黑洞的视界公式计算尺度；盘面、光弯曲与颜色为教学近似，并非广义相对论光线追踪或 EHT 观测图像。',
      },
      en: {
        title: 'Black hole',
        subtitle: 'An unseen horizon, luminous surroundings',
        summary:
          'Change mass and viewing angle to explore horizon scale, an accretion disk and a schematic view of bent light.',
        facts: [
          'The event horizon bounds a region from which light cannot escape; glowing gas lies outside, not on a luminous black-hole surface.',
          'Light from the far side of a disk can bend into view; an arched image does not mean a second physical disk.',
          'The shadow and event horizon have different sizes. An isolated black hole need not have a bright ring.',
        ],
        modelNote:
          'Scale uses the non-rotating horizon formula. Disk, light bending and colours are teaching approximations, not relativistic ray tracing or EHT imagery.',
      },
      ru: {
        title: 'Чёрная дыра',
        subtitle: 'Невидимый горизонт, светящееся окружение',
        summary:
          'Меняйте массу и ракурс, исследуя масштаб горизонта, аккреционный диск и условное искривление света.',
        facts: [
          'Горизонт событий ограничивает область, откуда свет не может выйти; светится внешний газ, а не поверхность чёрной дыры.',
          'Свет дальней стороны диска может изгибаться к наблюдателю; дугообразное изображение не означает второй настоящий диск.',
          'Тень и горизонт имеют разные размеры. У изолированной чёрной дыры может не быть яркого кольца.',
        ],
        modelNote:
          'Масштаб задан формулой невращающегося горизонта. Диск, изгиб света и цвета условны; это не релятивистская трассировка и не снимок EHT.',
      },
      fr: {
        title: 'Trou noir',
        subtitle: 'Un horizon invisible, un entourage lumineux',
        summary:
          'Modifiez masse et angle de vue pour explorer l’échelle de l’horizon, le disque d’accrétion et une déviation schématique de la lumière.',
        facts: [
          'L’horizon délimite une région dont la lumière ne peut sortir ; le gaz extérieur brille, pas une surface lumineuse du trou noir.',
          'La lumière de l’arrière du disque peut se courber vers nous ; cette image en arche n’est pas un deuxième disque physique.',
          'L’ombre et l’horizon n’ont pas la même taille. Un trou noir isolé ne possède pas forcément d’anneau brillant.',
        ],
        modelNote:
          'L’échelle utilise la formule d’un horizon sans rotation. Disque, déviation et couleurs sont pédagogiques ; ni tracé relativiste ni image EHT.',
      },
    },
    targets: [
      {
        id: 'deep-sky:m87',
        label: text(
          '宿主星系 M87',
          'Host galaxy · M87',
          'Родительская галактика · M87',
          'Galaxie hôte · M87'
        ),
        note: text(
          'M87 中心存在超大质量黑洞；此按钮定位整座星系，不直接呈现黑洞视界。',
          'M87 hosts a supermassive black hole; this locates the galaxy, not a resolved horizon.',
          'В M87 находится сверхмассивная чёрная дыра; кнопка наводит на галактику, а не разрешённый горизонт.',
          'M87 abrite un trou noir supermassif ; ce bouton localise la galaxie, sans résoudre l’horizon.'
        ),
      },
      {
        id: 'deep-sky:ngc5128',
        label: text(
          '宿主星系 半人马座 A',
          'Host galaxy · Centaurus A',
          'Родительская галактика · Центавр A',
          'Galaxie hôte · Centaurus A'
        ),
        note: text(
          'NGC 5128 的活动核心与黑洞有关；巡天显示可用的星系天区。',
          'NGC 5128 has a black-hole-powered active nucleus; the finder shows the available galaxy field.',
          'Активное ядро NGC 5128 связано с чёрной дырой; видоискатель показывает доступное поле галактики.',
          'Le noyau actif de NGC 5128 est alimenté par un trou noir ; le viseur montre le champ galactique disponible.'
        ),
      },
    ],
    sources: [
      source('NASA · Black-hole anatomy', 'https://science.nasa.gov/universe/black-holes/anatomy/'),
      source(
        'NASA / Hubble · Messier 87',
        'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-87/'
      ),
      source('NASA · Centaurus A', 'https://science.nasa.gov/photojournal/ngc-5128-centaurus-a/'),
    ],
  },
];

export function cosmicTopic(id) {
  return COSMIC_TOPICS.find((topic) => topic.id === id) || COSMIC_TOPICS[0];
}

export function cosmicText(value, language = 'zh') {
  return typeof value === 'string' ? value : value?.[language] || value?.en || value?.zh || '';
}
