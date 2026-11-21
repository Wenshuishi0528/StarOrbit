import notes from './sky-artwork-facts.json' with { type: 'json' };
import { featuredArtworkReading } from './sky-artwork-featured.js';
import { highlightReading } from './sky-artwork-highlights.js';

// Keep the same vocabulary across individual captions, including when reading offline.
const languages = { zh: 0, en: 1, fr: 2, ru: 3 };
const cues = {
  lightEcho: ['光回声', 'a light echo', 'un écho lumineux', 'световое эхо'],
  greatdark: [
    '行星上的暗斑',
    'a dark atmospheric vortex',
    'un tourbillon sombre',
    'тёмный атмосферный вихрь',
  ],
  plume: ['喷出的物质', 'plumes of material', 'des panaches de matière', 'выбросы вещества'],
  ice: ['表面的冰', 'surface ice', 'la glace de surface', 'лёд на поверхности'],
  impactor: ['彗星碎片', 'comet fragments', 'des fragments de comète', 'фрагменты кометы'],
  terminator: [
    '昼夜交界线',
    'the boundary between day and night',
    'la limite entre le jour et la nuit',
    'граница дня и ночи',
  ],
  faceon: [
    '近乎正面的视角',
    'a nearly face-on orientation',
    'une orientation presque de face',
    'вид почти плашмя',
  ],
  edgeon: [
    '近乎侧面的视角',
    'a nearly edge-on orientation',
    'une orientation presque par la tranche',
    'вид почти с ребра',
  ],
  lobes: ['两侧的叶状结构', 'a pair of lobes', 'deux lobes', 'две лопасти'],
  halo: ['外围的恒星晕', 'the stellar halo', 'le halo stellaire', 'звёздное гало'],
  bulge: ['中心隆起的核球', 'the central bulge', 'le bulbe central', 'центральное утолщение'],
  core: [
    '密集或明亮的核心',
    'the central concentration',
    'la concentration centrale',
    'центральное сгущение',
  ],
  redgiants: ['红巨星', 'red giants', 'des géantes rouges', 'красные гиганты'],
  bluestars: ['蓝色恒星', 'blue stars', 'des étoiles bleues', 'голубые звёзды'],
  redstars: ['红色恒星', 'red stars', 'des étoiles rouges', 'красные звёзды'],
  darkpatch: ['暗云或暗斑', 'dark patches', 'des zones sombres', 'тёмные участки'],
  lanespiral: ['弯曲的旋臂', 'curving arms', 'des bras incurvés', 'изогнутые рукава'],
  ringgal: ['环状的恒星分布', 'a ring of stars', 'un anneau d’étoiles', 'кольцо звёзд'],
  merger: ['星系之间的并合', 'a galaxy merger', 'une fusion de galaxies', 'слияние галактик'],
  hii: [
    '恒星形成区',
    'sites of star formation',
    'des régions de formation stellaire',
    'области звездообразования',
  ],
  xray: ['X 射线辐射', 'X-ray emission', 'une émission en rayons X', 'рентгеновское излучение'],
  lens: [
    '引力透镜效应',
    'gravitational lensing',
    'un effet de lentille gravitationnelle',
    'гравитационное линзирование',
  ],
  galgroup: ['星系团', 'a cluster of galaxies', 'un amas de galaxies', 'скопление галактик'],
  deepgal: ['遥远的星系', 'distant galaxies', 'des galaxies lointaines', 'далёкие галактики'],
  diskgal: ['星系的盘面', 'the galactic disc', 'le disque galactique', 'галактический диск'],
  dustgas: ['气体与尘埃', 'gas and dust', 'du gaz et de la poussière', 'газ и пыль'],
  ionized: ['发光的气体', 'glowing gas', 'du gaz lumineux', 'светящийся газ'],
  wind: ['恒星风', 'stellar winds', 'des vents stellaires', 'звёздный ветер'],
  burst: [
    '活跃的恒星形成',
    'rapid star formation',
    'une formation stellaire intense',
    'вспышка звездообразования',
  ],
  protostars: ['仍在形成的原恒星', 'protostars', 'des protoétoiles', 'протозвёзды'],
  whitedwarf: ['白矮星', 'a white dwarf', 'une naine blanche', 'белый карлик'],
  supernova: ['超新星爆发', 'a stellar explosion', 'une explosion stellaire', 'взрыв звезды'],
  variable: ['亮度变化的恒星', 'a variable star', 'une étoile variable', 'переменная звезда'],
  quasar: ['类星体', 'a quasar', 'un quasar', 'квазар'],
  protoplanet: [
    '行星的形成',
    'planet formation',
    'la formation de planètes',
    'формирование планет',
  ],
  surface: ['表面纹理', 'surface markings', 'des détails de surface', 'детали поверхности'],
  clouds: [
    '大气层中的结构',
    'atmospheric structure',
    'des structures atmosphériques',
    'структура атмосферы',
  ],
  clusterstars: [
    '密集的恒星',
    'the stellar population',
    'la population stellaire',
    'звёздное население',
  ],
  pillars: [
    '气体与尘埃组成的柱体',
    'pillars of gas and dust',
    'des piliers de gaz et de poussière',
    'столпы газа и пыли',
  ],
  aurora: ['极光', 'auroral light', 'des aurores polaires', 'полярные сияния'],
  impact: ['撞击留下的痕迹', 'impact scars', 'des traces d’impact', 'следы ударов'],
  spot: ['木星大红斑', 'the Great Red Spot', 'la Grande Tache rouge', 'Большое Красное Пятно'],
  polar: ['极冠', 'polar caps', 'des calottes polaires', 'полярные шапки'],
  rings: ['环状结构', 'ring structure', 'une structure en anneaux', 'кольцевая структура'],
  belts: ['大气云带', 'cloud bands', 'des bandes nuageuses', 'облачные полосы'],
  tail: ['彗尾', 'a comet tail', 'une queue cométaire', 'хвост кометы'],
  knots: ['聚集成结的物质', 'knots of material', 'des nœuds de matière', 'сгустки вещества'],
  shell: ['气体壳层', 'gaseous shells', 'des enveloppes de gaz', 'газовые оболочки'],
  shock: ['激波前沿', 'shock fronts', 'des fronts de choc', 'фронты ударных волн'],
  jet: ['向外延伸的喷流', 'jets of matter', 'des jets de matière', 'струи вещества'],
  spirals: ['向外弯曲的旋臂', 'spiral arms', 'des bras spiraux', 'спиральные рукава'],
  bar: ['中心的棒状结构', 'a central bar', 'une barre centrale', 'центральная перемычка'],
  lanes: [
    '遮住星光的尘带',
    'lanes of obscuring dust',
    'des bandes de poussière obscurcissante',
    'полосы поглощающей пыли',
  ],
  tidal: ['潮汐拉出的物质流', 'tidal streams', 'des traînées de marée', 'приливные потоки'],
  companion: ['伴星系', 'a companion galaxy', 'une galaxie compagne', 'галактика-спутник'],
  nucleus: ['星系中心', 'the galactic nucleus', 'le noyau galactique', 'ядро галактики'],
  arcs: [
    '被引力拉长的光弧',
    'gravitationally stretched arcs',
    'des arcs étirés par la gravitation',
    'дуги гравитационного линзирования',
  ],
  diffraction: [
    '亮星周围的衍射尖刺',
    'diffraction spikes around bright stars',
    'des aigrettes de diffraction autour des étoiles brillantes',
    'дифракционные лучи вокруг ярких звёзд',
  ],
  filaments: ['细丝状结构', 'fine filaments', 'de fins filaments', 'тонкие волокна'],
  bubbles: ['气体构成的泡状结构', 'bubbles of gas', 'des bulles de gaz', 'газовые пузыри'],
  dust: ['尘埃云', 'clouds of dust', 'des nuages de poussière', 'пылевые облака'],
  clusters: ['成团分布的恒星', 'star clusters', 'des amas stellaires', 'звёздные скопления'],
  young: ['年轻恒星', 'young stars', 'de jeunes étoiles', 'молодые звёзды'],
  background: [
    '背景星系',
    'background galaxies',
    'des galaxies en arrière-plan',
    'фоновые галактики',
  ],
  globules: [
    '小而密的尘团',
    'dense dust globules',
    'des globules denses de poussière',
    'плотные пылевые глобулы',
  ],
  starfield: [
    '密布的星点',
    'a dense star field',
    'un champ stellaire dense',
    'густое звёздное поле',
  ],
  disks: [
    '孕育行星的盘状物质',
    'planet-forming discs',
    'des disques protoplanétaires',
    'протопланетные диски',
  ],
  streamers: [
    '向外延伸的物质细流',
    'streamers of material',
    'des traînées de matière',
    'струящиеся полосы вещества',
  ],
  hotspots: ['明亮的团块', 'bright knots', 'des nœuds brillants', 'яркие сгустки'],
  redshift: [
    '高红移星系',
    'high-redshift galaxies',
    'des galaxies à grand décalage vers le rouge',
    'галактики с большим красным смещением',
  ],
};

const subjects = {
  debris: [
    '星周碎屑盘由绕恒星运行的尘埃和碎屑组成；小天体碰撞可以补充其中的尘埃。',
    'A circumstellar debris disc contains dust and fragments in orbit around a star. Collisions between small bodies can replenish its dust.',
    'Un disque de débris circumstellaire contient de la poussière et des fragments en orbite autour d’une étoile. Des collisions entre petits corps peuvent renouveler sa poussière.',
    'Околозвёздный диск обломков состоит из пыли и фрагментов на орбитах вокруг звезды. Столкновения малых тел могут пополнять запас пыли.',
  ],
  globular: [
    '球状星团把大量恒星聚在近似球形的空间里，中心通常最密。',
    'A globular cluster holds a roughly spherical swarm of stars, usually most crowded at its centre.',
    'Un amas globulaire rassemble des étoiles en une sphère, généralement plus dense au centre.',
    'Шаровое скопление состоит из множества звёзд. Обычно к центру они расположены всё плотнее.',
  ],
  open: [
    '疏散星团的成员诞生于同一片气体云，分布较为松散。',
    'The stars of an open cluster formed in the same gas cloud and remain loosely grouped.',
    'Les étoiles d’un amas ouvert sont nées dans le même nuage de gaz et forment un groupe peu dense.',
    'Звёзды рассеянного скопления родились в одном газовом облаке и образуют рыхлую группу.',
  ],
  galcluster: [
    '星系团由许多星系组成，其引力还能使更远处星系的光发生偏折。',
    'A galaxy cluster groups many galaxies together. Its gravity can bend light from galaxies far behind it.',
    'Un amas de galaxies regroupe de nombreuses galaxies. Sa gravité peut dévier la lumière de galaxies plus lointaines.',
    'Скопление объединяет множество галактик. Его гравитация может отклонять свет более далёких галактик.',
  ],
  starcluster: [
    '星团是聚在一起的一群恒星，成员通常有共同的形成历史。',
    'A star cluster is a group of stars that usually share a common formation history.',
    'Un amas stellaire réunit des étoiles qui ont généralement une origine commune.',
    'Звёздное скопление объединяет звёзды, у которых обычно общее происхождение.',
  ],
  superrem: [
    '超新星遗迹由爆炸抛出的物质和被激波扫过的周围气体组成。',
    'A supernova remnant contains material ejected in a stellar explosion and surrounding gas swept up by its shock wave.',
    'Un rémanent de supernova contient de la matière éjectée par l’explosion et du gaz environnant balayé par son onde de choc.',
    'Остаток сверхновой состоит из выброшенного при взрыве вещества и окружающего газа, захваченного ударной волной.',
  ],
  supernova: [
    '超新星是恒星演化末期发生的爆炸，亮度会在短时间内大幅上升。',
    'A supernova is an explosion at the end of a star’s life that briefly produces an enormous increase in brightness.',
    'Une supernova est une explosion en fin de vie stellaire qui produit une brève et forte hausse de luminosité.',
    'Сверхновая — взрыв в конце жизни звезды, при котором её яркость резко возрастает.',
  ],
  planetary: [
    '行星状星云由晚年恒星抛出的气体形成。中心炽热的星核照亮了外层气体。',
    'A planetary nebula forms from gas shed by an ageing star. The hot stellar core lights up the expelled gas.',
    'Une nébuleuse planétaire se forme avec le gaz rejeté par une étoile en fin de vie. Son cœur chaud illumine l’enveloppe.',
    'Планетарная туманность образуется из газа, сброшенного стареющей звездой. Его освещает горячее звёздное ядро.',
  ],
  starform: [
    '恒星形成区中含有稠密的冷气体和尘埃。局部云团在引力作用下收缩，孕育新的恒星。',
    'Star-forming regions contain cold gas and dust. Dense pockets of this material can collapse under gravity to form new stars.',
    'Les régions de formation stellaire contiennent du gaz froid et de la poussière. Des poches denses peuvent s’effondrer pour former des étoiles.',
    'В областях звездообразования есть холодный газ и пыль. В плотных сгустках под действием гравитации рождаются звёзды.',
  ],
  reflection: [
    '反射星云中的尘埃散射附近恒星的光，使星际云显现出来。',
    'In a reflection nebula, dust scatters the light of nearby stars and reveals the interstellar cloud.',
    'Dans une nébuleuse par réflexion, la poussière diffuse la lumière des étoiles voisines et rend le nuage visible.',
    'Пыль в отражательной туманности рассеивает свет соседних звёзд, благодаря чему межзвёздное облако становится видимым.',
  ],
  dustdisk: [
    '年轻恒星周围的气体和尘埃可形成旋转的盘，盘中物质可以聚成行星。',
    'Gas and dust can form a rotating disc around a young star. Material in the disc can grow into planets.',
    'Autour d’une jeune étoile, le gaz et la poussière peuvent former un disque en rotation où naissent des planètes.',
    'Вокруг молодой звезды газ и пыль могут образовать вращающийся диск. Из его вещества формируются планеты.',
  ],
  quasar: [
    '类星体的明亮核心由落向超大质量黑洞的物质供能，光芒可以盖过整个宿主星系。',
    'A quasar is powered by material falling towards a supermassive black hole. Its bright core can outshine its host galaxy.',
    'Un quasar est alimenté par de la matière qui tombe vers un trou noir supermassif. Son noyau peut briller davantage que toute la galaxie hôte.',
    'Квазар питается веществом, падающим к сверхмассивной чёрной дыре. Его ядро может затмить всю родительскую галактику.',
  ],
  active: [
    '星系的活跃核心由落向中心黑洞的物质供能，能够在多个波段发出辐射。',
    'An active galactic nucleus is powered by matter falling towards a central black hole and can emit across many wavelengths.',
    'Un noyau galactique actif tire son énergie de la matière qui tombe vers un trou noir central et rayonne à de nombreuses longueurs d’onde.',
    'Вещество, падающее к центральной чёрной дыре, питает активное ядро галактики. Оно излучает в разных диапазонах.',
  ],
  lensing: [
    '引力透镜会改变背景天体的光路，让遥远的天体显得更亮、变形，有时还会形成多个像。',
    'A gravitational lens bends light from a background object. It can magnify, stretch or produce multiple images of that object.',
    'Une lentille gravitationnelle dévie la lumière d’un objet lointain. Elle peut l’amplifier, l’étirer ou en produire plusieurs images.',
    'Гравитационная линза искривляет лучи от далёкого объекта и может усилить, растянуть или размножить его изображение.',
  ],
  interacting: [
    '星系彼此靠近时，引力会改变恒星和气体的轨道，使星系的外形发生变化。',
    'As galaxies pass near each other, gravity alters the paths of stars and gas, changing the shapes of the galaxies.',
    'Quand des galaxies se rapprochent, la gravité modifie les trajectoires du gaz et des étoiles et déforme les galaxies.',
    'При сближении галактик тяготение меняет орбиты звёзд и газа и тем самым форму самих галактик.',
  ],
  barred: [
    '棒旋星系的核心横贯着一条恒星构成的棒，旋臂通常从棒的两端伸出。',
    'In a barred spiral galaxy, a bar of stars crosses the centre. The spiral arms usually begin near its ends.',
    'Dans une galaxie spirale barrée, une barre d’étoiles traverse le centre. Les bras partent souvent de ses extrémités.',
    'В спиральной галактике с перемычкой центр пересекает звёздный бар. Спиральные рукава обычно начинаются у его концов.',
  ],
  spiral: [
    '旋涡星系有旋转的星盘，盘中气体和恒星勾勒出弯曲的旋臂。',
    'A spiral galaxy has a rotating disc. Stars and gas trace curved arms within it.',
    'Une galaxie spirale possède un disque en rotation où les étoiles et le gaz dessinent des bras courbes.',
    'У спиральной галактики вращающийся диск. Газ и звёзды образуют в нём изогнутые рукава.',
  ],
  elliptical: [
    '椭圆星系的星光通常平滑地向外减弱，恒星的运动方向各不相同。',
    'An elliptical galaxy generally has a smooth light profile that fades outwards. Its stars move in many different directions.',
    'La lumière d’une galaxie elliptique décroît généralement vers les bords. Ses étoiles se déplacent dans des directions très variées.',
    'Свет эллиптической галактики обычно плавно ослабевает к краям. Её звёзды движутся в разных направлениях.',
  ],
  lenticular: [
    '透镜状星系有明亮的核球和扁平的盘，旋臂通常很难分辨。',
    'A lenticular galaxy has a central bulge and a flattened disc with little visible spiral structure.',
    'Une galaxie lenticulaire possède un bulbe central et un disque aplati dont la structure spirale est peu apparente.',
    'У линзовидной галактики есть центральное утолщение и плоский диск со слабовыраженной спиральной структурой.',
  ],
  irregular: [
    '不规则星系中恒星与气体的分布不对称，外形可以很不均匀。',
    'The stars and gas in an irregular galaxy have an asymmetric distribution that gives it an uneven outline.',
    'Les étoiles et le gaz d’une galaxie irrégulière se répartissent de façon asymétrique, donnant un contour inégal.',
    'Звёзды и газ в неправильной галактике распределены несимметрично, поэтому её очертания неровные.',
  ],
  dwarf: [
    '矮星系的质量较小，所含恒星通常比银河系这样的巨型星系少得多。',
    'A dwarf galaxy has relatively little mass and typically far fewer stars than a giant galaxy such as the Milky Way.',
    'Une galaxie naine est peu massive et contient généralement bien moins d’étoiles qu’une grande galaxie comme la Voie lactée.',
    'У карликовой галактики небольшая масса и обычно гораздо меньше звёзд, чем у такой крупной галактики, как Млечный Путь.',
  ],
  deep: [
    '深场是长时间观测的一小块天空，用来发现微弱而遥远的天体。',
    'A deep field is a small patch of sky observed for a long time to reveal very faint, distant objects.',
    'Un champ profond est une petite région du ciel observée longuement pour révéler des objets lointains et très faibles.',
    'Глубокое поле — небольшой участок неба, где длительные наблюдения выявляют слабые далёкие объекты.',
  ],
  starburst: [
    '星暴星系正在经历一段密集形成恒星的时期，大量气体被用来孕育新星。',
    'A starburst galaxy is undergoing a period of unusually rapid star formation, drawing on its supply of gas.',
    'Une galaxie à sursaut de formation stellaire connaît une période où ses réserves de gaz produisent des étoiles à un rythme inhabituellement élevé.',
    'В галактике со вспышкой звездообразования из запасов газа необычно быстро формируются новые звёзды.',
  ],
  comet: [
    '彗星含有冰和尘埃。接近太阳时，受热逸出的物质可以形成彗发和彗尾。',
    'Comets contain ice and dust. Near the Sun, escaping material can form a coma and a tail.',
    'Les comètes contiennent de la glace et de la poussière. Près du Soleil, la matière libérée peut former une chevelure et une queue.',
    'Кометы содержат лёд и пыль. При приближении к Солнцу выделяющееся вещество может образовать кому и хвост.',
  ],
  asteroid: [
    '小行星是绕太阳运行的小天体，其成分、形状和自转速度各有不同。',
    'Asteroids are small bodies orbiting the Sun. Their composition, shape and rotation rates vary widely.',
    'Les astéroïdes sont de petits corps en orbite autour du Soleil. Leur composition, leur forme et leur rotation varient beaucoup.',
    'Астероиды — малые тела на орбите вокруг Солнца. Их состав, форма и скорость вращения сильно различаются.',
  ],
  moon: [
    '天然卫星在引力作用下绕行星或其他小天体运行。',
    'A natural satellite is held by gravity in orbit around a planet or a smaller body.',
    'Un satellite naturel reste en orbite autour d’une planète ou d’un autre corps sous l’effet de la gravité.',
    'Естественный спутник удерживается тяготением на орбите вокруг планеты или другого тела.',
  ],
  dwarfplanet: [
    '矮行星绕太阳运行，自身引力使其近似球形，轨道附近仍有其他小天体。',
    'A dwarf planet orbits the Sun and is nearly rounded by its own gravity. It shares its orbital neighbourhood with other bodies.',
    'Une planète naine orbite autour du Soleil. Sa gravité lui donne une forme presque ronde et elle partage son voisinage orbital avec d’autres corps.',
    'Карликовая планета обращается вокруг Солнца. Её тяготение придало ей почти округлую форму, а вблизи её орбиты остаются другие тела.',
  ],
  planet: [
    '从地球附近观察行星时，它的距离和朝向随轨道运动而变；不同日期的影像适合用来对照。',
    'A planet’s distance and viewing geometry change as it travels around the Sun. Observations on different dates offer different views.',
    'La distance et l’angle de vue d’une planète changent au fil de son orbite. On peut comparer des images prises à différentes dates.',
    'Расстояние до планеты и ракурс меняются при движении по орбите. Это можно проследить на снимках разных дат.',
  ],
  exoplanet: [
    '系外行星位于太阳系之外。天文学家可通过成像、测光或光谱研究这些遥远的世界。',
    'Exoplanets lie outside the Solar System. Astronomers study them using images, brightness measurements and spectra.',
    'Les exoplanètes se trouvent hors du Système solaire. Les astronomes les étudient par imagerie, photométrie et spectroscopie.',
    'Экзопланеты находятся за пределами Солнечной системы. Их изучают по изображениям, измерениям яркости и спектрам.',
  ],
  binary: [
    '双星系统中的两颗恒星受引力束缚，围绕共同的质心运动。',
    'The two stars in a binary system are bound by gravity and orbit their common centre of mass.',
    'Les deux étoiles d’un système binaire sont liées par la gravité et tournent autour de leur centre de masse commun.',
    'В двойной системе две звезды связаны тяготением и обращаются вокруг общего центра масс.',
  ],
  variable: [
    '变星的亮度会随时间改变。比较不同时刻的测量，可以找出变化的节奏。',
    'A variable star changes brightness over time. Repeated measurements can reveal a pattern in the changes.',
    'L’éclat d’une étoile variable change avec le temps. Des mesures répétées peuvent en révéler le rythme.',
    'Яркость переменной звезды меняется со временем. Повторные измерения позволяют проследить характер этих изменений.',
  ],
  protostar: [
    '原恒星是正在形成的恒星，仍在从周围的气体和尘埃中吸积物质。',
    'A protostar is a star still forming and accreting material from the surrounding gas and dust.',
    'Une protoétoile est une étoile en formation qui accumule encore du gaz et de la poussière de son environnement.',
    'Протозвезда — формирующаяся звезда, которая ещё набирает вещество из окружающего газа и пыли.',
  ],
  blackhole: [
    '黑洞周围的物质可以发出强烈辐射，让天文学家研究黑洞附近的环境。',
    'Matter close to a black hole can emit intense radiation, allowing astronomers to study its surroundings.',
    'La matière proche d’un trou noir peut émettre un rayonnement intense qui permet d’en étudier l’environnement.',
    'Вещество вблизи чёрной дыры может ярко излучать. По этому излучению астрономы изучают её окрестности.',
  ],
  star: [
    '恒星发出的光携带着温度和化学组成的信息，颜色与光谱是研究它们的线索。',
    'Starlight carries information about temperature and chemical composition. Astronomers read these clues in the colour and spectrum.',
    'La lumière stellaire renseigne sur la température et la composition chimique. Ces indices se lisent dans la couleur et le spectre.',
    'Свет звёзд несёт сведения о температуре и химическом составе. Эти признаки проявляются в цвете и спектре.',
  ],
  nebula: [
    '星云是星际空间中的气体或尘埃云，可以发光、反射星光，也可以遮住背景光。',
    'A nebula is a cloud of interstellar gas or dust. It can glow, reflect starlight or obscure the light behind it.',
    'Une nébuleuse est un nuage interstellaire de gaz ou de poussière. Elle peut rayonner, réfléchir la lumière ou masquer l’arrière-plan.',
    'Туманность — межзвёздное облако газа или пыли. Оно может излучать, отражать звёздный свет или заслонять фон.',
  ],
  galaxy: [
    '星系由引力维系，汇集了恒星、星际物质和暗物质。不同星系的外形与恒星分布各不相同。',
    'Gravity holds together a galaxy’s stars, interstellar material and dark matter. Galaxies vary greatly in shape and in the distribution of their stars.',
    'La gravité lie les étoiles, le milieu interstellaire et la matière noire d’une galaxie. La forme et la répartition des étoiles varient beaucoup.',
    'Тяготение удерживает вместе звёзды, межзвёздное вещество и тёмную материю галактики. Форма и распределение звёзд бывают разными.',
  ],
  cosmology: [
    '远方天体的光需要时间才能到达我们。观察距离各异的天体，可以研究宇宙在不同年代的样貌。',
    'Light from distant objects takes time to reach us. Objects at different distances therefore reveal different eras of the Universe.',
    'La lumière des objets lointains met du temps à nous parvenir. Des distances différentes donnent ainsi accès à différentes époques de l’Univers.',
    'Свет далёких объектов идёт до нас долго. Наблюдения на разных расстояниях показывают Вселенную в разные эпохи.',
  ],
  solar: [
    '太阳系内天体的位置随轨道运动变化。比较不同日期的影像，可以跟踪它们的运动。',
    'Solar System objects change position along their orbits. Observations on different dates can trace that motion.',
    'Les corps du Système solaire se déplacent sur leurs orbites. Des observations à différentes dates permettent de suivre leur mouvement.',
    'Тела Солнечной системы меняют положение на орбите. Наблюдения разных дат позволяют проследить это движение.',
  ],
  field: [
    '这个天区包含同一视线方向上的天体，它们到地球的距离可能不同。',
    'Objects in this patch of sky share a line of sight but can be at different distances from Earth.',
    'Les objets de ce champ partagent la même direction dans le ciel et peuvent se trouver à différentes distances de la Terre.',
    'Объекты в этом поле видны в одном направлении, хотя могут находиться на разных расстояниях от Земли.',
  ],
};

const layouts = {
  parallel: [
    '这是与目标相邻的平行观测天区。',
    'This is a parallel observation of a neighbouring field.',
    'Cette observation parallèle porte sur un champ voisin de la cible.',
    'Это соседнее поле параллельного наблюдения.',
  ],
  screenshot: [
    '这是官方节目中的一帧画面。',
    'This frame comes from the official programme.',
    'Il s’agit d’une image tirée du programme officiel.',
    'Это кадр официальной программы.',
  ],
  spectrum: [
    '这幅图把接收到的光按波长展开，曲线或条带对应不同波长的信号。',
    'The spectrum separates the recorded light by wavelength, showing the signal in each part of the spectrum.',
    'Le spectre sépare la lumière enregistrée selon sa longueur d’onde et montre le signal dans chaque bande.',
    'В спектре зарегистрированный свет разложен по длинам волн, чтобы показать сигнал в каждой части диапазона.',
  ],
  curve: [
    '这张光变曲线记录亮度随时间的变化。',
    'This light curve follows the change in brightness over time.',
    'Cette courbe de lumière suit les variations d’éclat au fil du temps.',
    'Эта кривая блеска показывает, как яркость меняется со временем.',
  ],
  annotated: [
    '标注帮助辨认原图中的位置和结构。',
    'The annotations identify locations or structures in the frame.',
    'Les annotations situent les éléments à repérer dans le champ.',
    'Подписи помогают найти отдельные участки и структуры на кадре.',
  ],
  comparison: [
    '这幅对照图将多个视图放在一起，方便逐处比较。',
    'This comparison places several views together so their details can be examined side by side.',
    'Cette comparaison rapproche plusieurs vues pour en examiner les détails côte à côte.',
    'Несколько видов представлены рядом, чтобы можно было сопоставить их детали.',
  ],
  sequence: [
    '按顺序对照各幅画面，可以观察目标随时间的变化。',
    'Follow the sequence to trace how the target changed over time.',
    'La séquence permet de suivre l’évolution de la cible au fil du temps.',
    'Последовательность кадров позволяет проследить изменения объекта со временем.',
  ],
  mosaic: [
    '相邻的观测视场拼成了这幅全景。',
    'Neighbouring fields of view were joined into this mosaic.',
    'Des champs d’observation voisins ont été assemblés pour former cette mosaïque.',
    'Соседние поля наблюдений соединены в мозаику.',
  ],
  crop: [
    '这个版本选取了较小的区域，可以集中观察局部细节。',
    'This close view frames a smaller area for examining its details.',
    'Ce cadrage resserré permet d’examiner les détails d’une région plus petite.',
    'В этом крупном плане показана небольшая область, детали которой удобно рассматривать.',
  ],
};
const bands = {
  Optical: ['可见光', 'visible light', 'lumière visible', 'видимый свет'],
  Infrared: ['红外', 'infrared', 'infrarouge', 'инфракрасное излучение'],
  Ultraviolet: ['紫外', 'ultraviolet', 'ultraviolet', 'ультрафиолет'],
  'X-ray': ['X 射线', 'X-rays', 'rayons X', 'рентгеновское излучение'],
  Radio: ['射电', 'radio', 'radio', 'радиоизлучение'],
  Millimeter: ['毫米波', 'millimetre waves', 'ondes millimétriques', 'миллиметровые волны'],
};
const namedBodies = {
  Saturn: ['土星', 'Saturn', 'Saturne', 'Сатурн'],
  Jupiter: ['木星', 'Jupiter', 'Jupiter', 'Юпитер'],
  Uranus: ['天王星', 'Uranus', 'Uranus', 'Уран'],
  Neptune: ['海王星', 'Neptune', 'Neptune', 'Нептун'],
  Mars: ['火星', 'Mars', 'Mars', 'Марс'],
  Pluto: ['冥王星', 'Pluto', 'Pluton', 'Плутон'],
  Io: ['木卫一', 'Io', 'Io', 'Ио'],
  Europa: ['木卫二', 'Europa', 'Europe', 'Европа'],
  Titan: ['土卫六', 'Titan', 'Titan', 'Титан'],
  Ganymede: ['木卫三', 'Ganymede', 'Ganymède', 'Ганимед'],
};
const featuredInstruments = {
  NIRCam: [
    '近红外相机 NIRCam',
    'the near-infrared camera NIRCam',
    'la caméra proche infrarouge NIRCam',
    'камера ближнего ИК-диапазона NIRCam',
  ],
  MIRI: [
    '中红外仪器 MIRI',
    'the mid-infrared instrument MIRI',
    'l’instrument moyen infrarouge MIRI',
    'прибор среднего ИК-диапазона MIRI',
  ],
};
const facilityNames = {
  'Hubble Space Telescope': ['哈勃', 'Hubble', 'Hubble', '«Хаббл»'],
  'James Webb Space Telescope': ['韦伯', 'Webb', 'Webb', '«Уэбб»'],
};
function workName(work, fact, index) {
  if (Object.hasOwn(fact, 'name')) return fact.name;
  const entries = (work.aliases || []).filter(Boolean);
  const catalogueId = entries.find((n) =>
    /^(?:M(?:essier)?\s*\d+|NGC\s*\d+|IC\s*\d+|Arp\s*\d+|MACS\s*J)/i.test(n)
  );
  const name = catalogueId || entries[0];
  return namedBodies[name]?.[index] || name || '';
}

const viewingTips = [
  [
    [
      'galaxy',
      'spiral',
      'barred',
      'elliptical',
      'irregular',
      'lenticular',
      'dwarf',
      'starburst',
      'active',
      'interacting',
    ],
    [
      '先找最亮的区域，再往外看，比较星光的分布和轮廓的变化。',
      'Start at the brightest region and work outwards, comparing how the starlight is distributed across the frame.',
      'Partez de la zone la plus lumineuse et suivez la répartition de la lumière vers les bords.',
      'Начните с самой яркой области и двигайтесь к краям, сравнивая распределение звёздного света.',
    ],
  ],
  [
    ['globular', 'open', 'starcluster'],
    [
      '从恒星密集处向外围看，比较相邻星点之间的间距。',
      'Move from the crowded regions towards the outskirts and compare the spacing between stars.',
      'Partez des zones denses vers la périphérie et comparez l’espacement entre les étoiles.',
      'Двигайтесь от густых участков к краям и сравните расстояния между звёздными точками.',
    ],
  ],
  [
    [
      'planetary',
      'superrem',
      'nebula',
      'starform',
      'reflection',
      'dustdisk',
      'debris',
      'protostar',
    ],
    [
      '先分辨星点和弥散的光，再沿着明暗交界寻找物质的轮廓。',
      'Separate the points of starlight from the diffuse glow, then trace the boundaries between light and dark.',
      'Distinguez les étoiles ponctuelles de la lumière diffuse, puis suivez les limites entre zones claires et sombres.',
      'Отделите звёздные точки от рассеянного свечения, затем проследите границы светлых и тёмных областей.',
    ],
  ],
  [
    ['galcluster', 'deep', 'lensing', 'cosmology', 'quasar', 'blackhole'],
    [
      '比较画面里不同光源的大小及轮廓，区分点状光源和有延展的亮斑。',
      'Compare the sizes and outlines of sources in the field, distinguishing point-like lights from extended patches.',
      'Comparez les tailles et les contours des sources pour distinguer les points lumineux des taches étendues.',
      'Сравните размеры и контуры источников, отделяя точечные огни от протяжённых пятен.',
    ],
  ],
  [
    ['comet', 'planet', 'moon', 'asteroid', 'dwarfplanet', 'solar'],
    [
      '对照同一目标在其他日期的观测时，注意它的朝向和背景星点的位置。',
      'When comparing other dates, check the target’s orientation and its position relative to background stars.',
      'Pour comparer des dates différentes, observez l’orientation de la cible et sa position par rapport aux étoiles de fond.',
      'При сравнении снимков разных дат учитывайте ориентацию объекта и его положение относительно фоновых звёзд.',
    ],
  ],
  [
    ['star', 'supernova', 'variable', 'binary', 'exoplanet'],
    [
      '与同一天区的其他影像对照，先借助周围星点的排列辨认位置，再比较目标的亮度。',
      'Use the pattern of nearby stars to identify the same position in other views, then compare the target’s brightness.',
      'Repérez la même position sur d’autres images grâce aux étoiles voisines, puis comparez l’éclat de la cible.',
      'По рисунку соседних звёзд найдите то же место на других снимках, затем сравните яркость объекта.',
    ],
  ],
];
function observingTip(kind, index) {
  return viewingTips.find(([kinds]) => kinds.includes(kind))?.[1][index];
}

function imageText(work, fact, name, index) {
  const shape = layouts[fact.layout]?.[index] || '';
  const features = (fact.cues || [])
    .map((key) => cues[key]?.[index])
    .filter(Boolean)
    .join(['、', ' and ', ' et ', ' и '][index]);
  const lead = name
    ? [
        `这幅影像的目标是 ${name}。`,
        `This view features ${name}. `,
        `Cette vue porte sur ${name}. `,
        `Объект наблюдений — ${name}. `,
      ][index]
    : '';
  if (features) {
    const detail = [
      `读图时可以从${features}入手。`,
      `Features discussed in the caption include ${features}.`,
      `La légende attire l’attention sur ${features}.`,
      `В описании снимка отмечаются ${features}.`,
    ][index];
    return (lead + (shape ? shape + (index ? ' ' : '') : '') + detail).trim();
  }
  if (shape) return (lead + shape).trim();
  const tip = observingTip(fact.kind, index);
  if (tip) return (lead + tip).trim();
  if (fact.size) {
    const size = fact.size
      .map((n) => n.toLocaleString(['zh-CN', 'en', 'fr', 'ru'][index]))
      .join(' × ');
    return (
      lead +
      [
        `完整画幅为 ${size} 像素。`,
        `The full frame measures ${size} pixels.`,
        `Le cadre complet mesure ${size} pixels.`,
        `Размер полного кадра — ${size} пикселей.`,
      ][index]
    ).trim();
  }
  return lead.trim() || subjects.field[index];
}

function captureText(work, fact, index) {
  const list = (vals) => [...new Set(vals.filter(Boolean))].join(['、', ', ', ', ', ', '][index]);
  const filters = work.filters || [];
  const cameras = fact.inst || work.instruments || [];
  const instrument = list(cameras.map((k) => featuredInstruments[k]?.[index] || k));
  const wavelengths = list(
    filters
      .map((f) => f[4])
      .filter((x) => /^\d+(?:[.,]\d+)?\s*(?:[munμµ]m|Å)$/i.test(x))
      .slice(0, 3)
  );
  const light = list(work.bands?.split(/\s*\/\s*/).map((b) => bands[b]?.[index]) || []);
  const facilities = list(
    filters
      .map((f) => f[0])
      .filter((name) => name && !/^(?:other|unknown|none|-)$/i.test(name))
      .map((name) => facilityNames[name]?.[index] || name)
  );
  const telescope = facilities || (work.source === 'hubble' ? 'ESA/Hubble' : 'ESA/Webb');
  if (fact.layout === 'screenshot')
    return [
      '画面截自官方科普节目，保留了节目中的构图。',
      'This still preserves the framing of the official educational programme.',
      'Cette image fixe reprend le cadrage du programme de vulgarisation officiel.',
      'Это кадр официальной научно-популярной программы с оригинальной композицией.',
    ][index];
  if (work.source === 'recent' && instrument) {
    return [
      `观测使用了${instrument}，分别记录相应波段的光。`,
      `This work uses data from ${instrument}. Each channel measures the light reaching the detector within its wavelength band.`,
      `Cette image a été obtenue avec ${instrument}. Chaque canal mesure la lumière dans sa bande spectrale.`,
      `Для этой работы использованы данные следующих инструментов: ${instrument}. Каждый канал регистрирует свет в своей полосе длин волн.`,
    ][index];
  }
  if (wavelengths) {
    return [
      `${telescope}的观测记录包含${wavelengths} 等波长${instrument ? '，使用的仪器有 ' + instrument : ''}。滤镜分别选出这些波段的光。`,
      `${telescope} observations include wavelengths of ${wavelengths}${instrument ? ' using ' + instrument : ''}. The filters isolate light in the corresponding bands.`,
      `Les observations (${telescope}) couvrent notamment ${wavelengths}${instrument ? ' avec ' + instrument : ''}. Les filtres isolent la lumière de chaque bande.`,
      `В наблюдениях (${telescope}) выделены длины волн ${wavelengths}${instrument ? '. Инструменты: ' + instrument : ''}. Фильтры пропускают свет в соответствующих полосах.`,
    ][index];
  }
  if (light || instrument) {
    return [
      `成像资料来自${telescope}。${instrument ? '观测仪器包括 ' + instrument + '。' : ''}${light ? '记录的波段包括' + light + '。' : ''}`,
      `The image uses observations from ${telescope}.${instrument ? ' Instrumentation includes ' + instrument + '.' : ''}${light ? ' Recorded bands include ' + light + '.' : ''}`,
      `L’image utilise des observations de ${telescope}.${instrument ? ' Instruments utilisés : ' + instrument + '.' : ''}${light ? ' Bandes enregistrées : ' + light + '.' : ''}`,
      `Изображение основано на наблюдениях (${telescope}).${instrument ? ' Инструменты: ' + instrument + '.' : ''}${light ? ' Диапазоны: ' + light + '.' : ''}`,
    ][index];
  }
  return [
    `官方将这幅作品列为${telescope}观测，发布页保留了原图及其署名。`,
    `The archive identifies this as an observation from ${telescope}. Its source page gives the published frame and credit.`,
    `Les archives attribuent cette observation à ${telescope}. La page source fournit le cadre publié et les crédits.`,
    `Архив указывает источник наблюдения: ${telescope}. Опубликованный кадр и авторство приведены на странице источника.`,
  ][index];
}

export function artworkNotes(work, language = 'zh') {
  const lang = String(language).split('-')[0];
  const index = languages[lang] ?? languages.zh;
  const fact = notes[work.source]?.[work.id] || {};
  const featured = featuredArtworkReading(work.source, work.id, index);
  const name = workName(work, fact, index);
  return {
    image:
      highlightReading(work.source, work.id, lang) ||
      featured.image ||
      imageText(work, fact, name, index),
    method: featured.method || captureText(work, fact, index),
    subject: (subjects[fact.kind] || subjects.field)[index],
  };
}
