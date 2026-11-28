import { deepSkyLandmarks, deepSkyStories } from './deep-sky-featured-reading.js';
import { deepSkyReadingId } from './deep-sky-catalog.js';
import { SKY_CONSTELLATION_NAMES } from './deep-sky-openngc-data.js';

// Aligned with the four names in SKY_CONSTELLATION_NAMES. Each paragraph is
// written for its language; only catalogue measurements and identifiers are inserted.
const languages = ['zh', 'en', 'ru', 'fr'];
const languageIndex = (language) =>
  Math.max(0, languages.indexOf(String(language).toLowerCase().split('-')[0]));

// Basic descriptions explain the recorded class without inferring the identity,
// distance, colours or membership of individual points in a survey image.
const subjects = {
  'galaxy': [
    '$ 是一个星系。图中延展开来的微光，汇集了许多恒星的光。',
    '$ is a galaxy. Its extended glow combines the light of many stars.',
    '$ — галактика. Её протяжённое свечение складывается из света множества звёзд.',
    '$ est une galaxie. Sa lueur diffuse réunit la lumière d’un grand nombre d’étoiles.',
  ],
  'spiral': [
    '$ 是旋涡星系，旋臂沿着星盘向外弯曲。',
    '$ is a spiral galaxy, with arms that wind out through its disc.',
    '$ — спиральная галактика. От центра вдоль её диска закручиваются рукава.',
    '$ est une galaxie spirale. Ses bras s’enroulent dans le disque autour du centre.',
  ],
  'barred': [
    '$ 是棒旋星系，中央的恒星聚成棒状，旋臂从棒的两端向外延伸。',
    '$ is a barred spiral galaxy. A bar of stars crosses the centre, and spiral arms extend from its ends.',
    '$ — спиральная галактика с перемычкой. Её рукава отходят от концов вытянутой полосы звёзд в центре.',
    '$ est une galaxie spirale barrée. Une barre d’étoiles traverse le centre et les bras partent de ses extrémités.',
  ],
  'weak-bar': [
    '$ 是旋涡星系，星表记载它的中心有一道较弱的棒状结构。',
    '$ is a spiral galaxy catalogued as having a weak central bar of stars.',
    '$ — спиральная галактика. В каталоге у неё отмечена слабая звёздная перемычка в центре.',
    '$ est une galaxie spirale dont le catalogue signale une barre centrale peu marquée.',
  ],
  'elliptical': [
    '$ 是椭圆星系，恒星聚成一个光度由内向外渐变的椭球。',
    '$ is an elliptical galaxy. Its stars form a rounded or elongated body that fades towards the edges.',
    '$ — эллиптическая галактика. Её звёзды образуют округлую или вытянутую систему, яркость которой убывает к краям.',
    '$ est une galaxie elliptique. Ses étoiles forment un ensemble arrondi ou allongé dont l’éclat diminue vers les bords.',
  ],
  'lenticular': [
    '$ 是透镜状星系。恒星分布在中央隆起和包围它的星盘中。',
    '$ is a lenticular galaxy. Its stars form a central bulge surrounded by a disc.',
    '$ — линзовидная галактика. Её диск окружает центральное звёздное утолщение.',
    '$ est une galaxie lenticulaire. Ses étoiles forment un bulbe central entouré d’un disque.',
  ],
  'elliptical-lenticular': [
    '$ 的外形介于椭圆星系和透镜状星系之间。星表把它记为 E–S0。',
    '$ is classified between elliptical and lenticular galaxies, a combination catalogued as E–S0.',
    '$ занимает промежуточное положение между эллиптическими и линзовидными галактиками. В каталоге это обозначено E–S0.',
    '$ présente une morphologie intermédiaire entre une galaxie elliptique et une lenticulaire, classée E–S0.',
  ],
  'lenticular-spiral': [
    '$ 的外形介于透镜状星系和旋涡星系之间。这一类在星表中记为 S0/a。',
    '$ is classified as S0/a, between a lenticular galaxy and an early-type spiral.',
    '$ относится к типу S0/a — промежуточному между линзовидными и ранними спиральными галактиками.',
    '$ appartient au type S0/a, intermédiaire entre les galaxies lenticulaires et les spirales de type précoce.',
  ],
  'irregular': [
    '$ 是不规则星系，恒星和气体的分布并不对称。',
    '$ is an irregular galaxy, with an uneven distribution of stars and gas.',
    '$ — неправильная галактика с несимметричным распределением звёзд и газа.',
    '$ est une galaxie irrégulière. Ses étoiles et son gaz se répartissent de façon asymétrique.',
  ],
  'galaxy-group': [
    '$ 是星表中收在同一条目下的一组星系。每个星系本身都包含大量恒星。',
    '$ is a set of galaxies listed under one catalogue entry. Each galaxy contains its own population of stars.',
    '$ объединяет несколько галактик под одним каталожным обозначением. В каждой из них есть своё множество звёзд.',
    '$ regroupe plusieurs galaxies sous une même désignation. Chacune réunit sa propre population d’étoiles.',
  ],
  'open-cluster': [
    '$ 是疏散星团。它的成员星诞生在同一片气体和尘埃云中。',
    '$ is an open cluster. Its member stars formed in the same cloud of gas and dust.',
    '$ — рассеянное звёздное скопление. Его звёзды родились в одном газопылевом облаке.',
    '$ est un amas ouvert. Ses étoiles sont nées dans le même nuage de gaz et de poussière.',
  ],
  'globular-cluster': [
    '$ 是球状星团。众多恒星在引力作用下聚成一团，越靠近中心越密集。',
    '$ is a globular cluster, a roughly spherical swarm of stars held together by gravity and packed most densely near the centre.',
    '$ — шаровое скопление. Тяготение удерживает его звёзды вместе, а ближе к центру они расположены плотнее.',
    '$ est un amas globulaire. La gravité lie ses étoiles en un ensemble presque sphérique, plus dense au centre.',
  ],
  'stellar-association': [
    '$ 是星协，许多起源相关的恒星分散在一片较大的天区。',
    '$ is a stellar association. Stars with a common origin are spread over a broad region.',
    '$ — звёздная ассоциация. Звёзды общего происхождения рассеяны по обширной области.',
    '$ est une association stellaire. Des étoiles de même origine s’y répartissent sur une vaste région.',
  ],
  'nebula': [
    '$ 是星云，星与星之间的气体或尘埃在天空中勾勒出一片延展的云。',
    '$ is a nebula, an extended cloud of gas or dust between the stars.',
    '$ — туманность, протяжённое облако газа или пыли в межзвёздном пространстве.',
    '$ est une nébuleuse, un nuage de gaz ou de poussière étendu entre les étoiles.',
  ],
  'cluster-nebula': [
    '$ 这一条目包括星团及其周围的星云，可把恒星的分布与气体云的轮廓对照起来看。',
    '$ includes a star cluster and the surrounding nebula. Their positions let you compare the stars with the outline of the cloud.',
    '$ объединяет скопление звёзд и окружающую туманность. Можно сопоставить расположение звёзд с очертаниями облака.',
    '$ réunit un amas d’étoiles et la nébuleuse qui l’entoure. On peut comparer la disposition des étoiles aux contours du nuage.',
  ],
  'reflection-nebula': [
    '$ 是反射星云，尘埃把附近恒星发出的光散射到我们的视线中。',
    '$ is a reflection nebula. Dust scatters light from nearby stars towards us.',
    '$ — отражательная туманность. Её пыль рассеивает в нашу сторону свет соседних звёзд.',
    '$ est une nébuleuse par réflexion. Ses poussières diffusent vers nous la lumière des étoiles voisines.',
  ],
  'dark-nebula': [
    '$ 是暗星云。云里的尘埃遮住后方的星光，显出暗色剪影。',
    '$ is a dark nebula. Dust obscures the light behind the cloud and outlines its silhouette.',
    '$ — тёмная туманность. Её пыль заслоняет свет позади облака, очерчивая его силуэт.',
    '$ est une nébuleuse obscure. Ses poussières masquent la lumière à l’arrière-plan et dessinent sa silhouette.',
  ],
  'planetary-nebula': [
    '$ 是行星状星云。恒星在演化晚期抛出外层气体，留下的炽热星核照亮了这层气壳。',
    '$ is a planetary nebula. A star shed its outer layers late in life, and its hot exposed core lights up the gas.',
    '$ — планетарная туманность. Звезда сбросила внешние слои в конце своей эволюции, и её горячее ядро заставляет газ светиться.',
    '$ est une nébuleuse planétaire. Une étoile a expulsé ses couches externes en fin de vie et son cœur chaud fait briller le gaz.',
  ],
  'supernova-remnant': [
    '$ 是超新星遗迹。恒星爆炸抛出的物质向外扩张，冲击周围的星际气体。',
    '$ is a supernova remnant. Material expelled in a stellar explosion expands into the surrounding gas.',
    '$ — остаток сверхновой. Вещество, выброшенное при взрыве звезды, расширяется и сталкивается с окружающим газом.',
    '$ est un rémanent de supernova. La matière projetée lors de l’explosion d’une étoile se propage dans le gaz environnant.',
  ],
};

// Curated views for the gallery's featured destinations and easily confused sky fields.
// Messier entries: NASA Hubble Messier Catalog. Other sources: ESA/Hubble heic0514a,
// heic0603d and ESA/Webb weic2205a, weic2208a (Stephan's Quintet).
const featured = {
  M31: [
    [
      '仙女座星系（M31）是银河系最近的大型旋涡星系，距离我们约 250 万光年。它倾斜的星盘在天空中显出狭长的轮廓。',
      'Andromeda (M31) is the nearest large spiral galaxy to our Milky Way, about 2.5 million light-years away. We see its disc at a steep angle.',
      'Туманность Андромеды (M31) — ближайшая к Млечному Пути крупная спиральная галактика, примерно в 2,5 миллиона световых лет от нас. Её диск виден под большим наклоном.',
      'Andromède (M31) est la grande galaxie spirale la plus proche de la Voie lactée, à environ 2,5 millions d’années-lumière. Son disque nous apparaît très incliné.',
    ],
    [
      '从明亮的星系中心沿长轴向外看。盘面一侧的暗色尘带，为倾斜的星盘描出几道弧线。',
      'Start at the bright centre and follow the long axis outwards. Dark dust lanes trace arcs across one side of the tilted disc.',
      'Найдите яркий центр и проследите длинную ось диска. Вдоль одной стороны видны тёмные дуги пылевых полос.',
      'Partez du centre brillant et suivez le grand axe. Sur un côté du disque incliné, les bandes de poussière dessinent des arcs sombres.',
    ],
  ],
  M51: [
    [
      '涡状星系 M51 的主星系 NGC 5194 几乎正面朝向我们。较小的伴星系 NGC 5195 正与它发生引力相互作用。',
      'In the Whirlpool system M51, the main galaxy NGC 5194 presents its spiral disc almost face-on. Its smaller companion, NGC 5195, interacts with it through gravity.',
      'В системе Водоворот (M51) спираль главной галактики NGC 5194 видна почти плашмя. Рядом находится её меньший спутник NGC 5195, с которым она гравитационно взаимодействует.',
      'Dans le système du Tourbillon (M51), la galaxie principale NGC 5194 présente son disque presque de face. Sa gravité et celle de sa petite compagne NGC 5195 agissent l’une sur l’autre.',
    ],
    [
      '先找两个亮核，再从较大的一个追踪两条旋臂。其中一条在天空中一直延伸到伴星系附近。',
      'Find the two bright cores, then trace the two arms around the larger one. One arm appears to reach towards the companion.',
      'Найдите два ярких ядра и проследите два спиральных рукава вокруг большего. Один из них тянется в сторону галактики-спутника.',
      'Repérez les deux noyaux brillants, puis suivez les deux bras autour du plus grand. L’un d’eux semble rejoindre la petite galaxie compagne.',
    ],
  ],
  M16: [
    [
      '鹰状星云中的年轻星团 NGC 6611 是 M16 的核心。著名的「创生之柱」是附近几根由冷气体和尘埃构成的柱体。',
      'The young cluster NGC 6611 lies at the heart of M16, the Eagle Nebula. The nearby Pillars of Creation are columns of cold gas and dust.',
      'Молодое скопление NGC 6611 находится в сердце туманности Орёл (M16). Рядом возвышаются Столпы Творения — колонны холодного газа и пыли.',
      'Le jeune amas NGC 6611 se trouve au cœur de M16, la nébuleuse de l’Aigle. Les Piliers de la création, tout proches, sont des colonnes de gaz froid et de poussière.',
    ],
    [
      '先找成群的亮星，再看星团周围发亮的云气。相关作品中的柱体特写只覆盖这片天区的一小部分。',
      'Find the cluster of bright stars, then trace the surrounding glow. Close-ups of the Pillars cover a small part of this wider field.',
      'Найдите группу ярких звёзд и свечение вокруг неё. Крупные планы Столпов охватывают лишь малую часть этого поля.',
      'Repérez le groupe d’étoiles brillantes puis la lueur qui l’entoure. Les gros plans des Piliers couvrent une petite partie de ce champ plus vaste.',
    ],
  ],
  NGC346: [
    [
      'NGC 346 是小麦哲伦云中的年轻星团。团内炽热的大质量恒星照亮周围的 N66 星云，辐射也在侵蚀致密的云壁。',
      'NGC 346 is a young cluster in the Small Magellanic Cloud. Its hot, massive stars light up the surrounding nebula N66, and their radiation erodes the denser walls of the cloud.',
      'NGC 346 — молодое скопление в Малом Магеллановом Облаке. Его горячие массивные звёзды освещают туманность N66, а их излучение разрушает плотные стенки облака.',
      'NGC 346 est un jeune amas du Petit Nuage de Magellan. Ses étoiles chaudes et massives éclairent la nébuleuse N66 et leur rayonnement érode les parois denses du nuage.',
    ],
    [
      '先找到明亮的星团，再沿发光云气与暗处的交界移动视线。哈勃的近景能分辨云壁上更细的纹理。',
      'Locate the bright cluster, then follow the boundary between glowing gas and darker sky. Hubble close-ups resolve finer structure along that edge.',
      'Найдите яркое скопление и проследите границу светящегося газа и тёмных участков. На крупных планах «Хаббла» различимы более тонкие детали этой границы.',
      'Repérez l’amas brillant, puis suivez la limite entre le gaz lumineux et les zones sombres. Les gros plans de Hubble révèlent des détails plus fins le long de cette bordure.',
    ],
  ],
  M42: [
    [
      '猎户座大星云（M42）是一处恒星诞生地。中央的四边形星团里，炽热年轻的恒星照亮周围云气。',
      'The Orion Nebula (M42) is a stellar nursery. Hot young stars in the central Trapezium cluster light up the surrounding cloud.',
      'Туманность Ориона (M42) — область рождения звёзд. Горячие молодые звёзды в центральном скоплении Трапеция освещают окружающее облако.',
      'La nébuleuse d’Orion (M42) est une pouponnière d’étoiles. Les jeunes étoiles chaudes de l’amas du Trapèze illuminent le gaz alentour.',
    ],
    [
      '从最亮的中心向外看，发亮的云气展开成两翼，暗尘则切入明亮的背景。',
      'Follow the bright central region out into the two wings of glowing gas. Dark dust cuts into the luminous background.',
      'От яркого центра проследите два крыла светящегося газа. Тёмная пыль врезается в светлый фон.',
      'Suivez depuis le centre brillant les deux ailes de gaz lumineux. Des nuages de poussière sombre se découpent sur ce fond.',
    ],
  ],
  M45: [
    [
      '金牛座的昴星团（M45）也叫七姊妹星团。明亮的蓝白色恒星照亮附近的尘埃，形成反射星云。',
      'The Pleiades (M45), also called the Seven Sisters, are an open cluster in Taurus. Bright blue-white stars illuminate nearby dust, forming reflection nebulae.',
      'Плеяды (M45), или Семь Сестёр, — рассеянное скопление в Тельце. Его яркие бело-голубые звёзды освещают соседнюю пыль, создавая отражательные туманности.',
      'Les Pléiades (M45), ou Sept Sœurs, forment un amas ouvert dans le Taureau. Leurs étoiles blanc bleuté éclairent des poussières proches et forment des nébuleuses par réflexion.',
    ],
    [
      '拉远一点看亮星组成的图案，再在亮星之间寻找淡淡的雾状区域。',
      'Take in the pattern of bright stars first, then look between them for faint patches of nebulosity.',
      'Сначала рассмотрите узор ярких звёзд, а затем поищите между ними слабую дымку.',
      'Commencez par la figure tracée par les étoiles brillantes, puis cherchez entre elles de faibles voiles diffus.',
    ],
  ],
  M57: [
    [
      '天琴座的环状星云（M57）来自一颗晚年恒星抛出的气体。中心裸露的炽热星核使这团气体发光。',
      'The Ring Nebula (M57) in Lyra is gas shed by a star near the end of its life. Its exposed hot core makes the gas glow.',
      'Туманность Кольцо (M57) в Лире состоит из газа, сброшенного стареющей звездой. Её горячее обнажённое ядро заставляет газ светиться.',
      'La nébuleuse de la Lyre (M57), dite de l’Anneau, est formée du gaz expulsé par une étoile en fin de vie. Le cœur brûlant de l’étoile fait briller ce gaz.',
    ],
    [
      '放大天区中央的小光斑，比较较亮的椭圆环边和环内较暗的区域。',
      'Zoom in on the small central patch and compare the brighter oval rim with the fainter interior.',
      'Увеличьте маленькое пятно в центре поля и сравните яркий овальный ободок с более тёмной серединой.',
      'Agrandissez la petite tache au centre du champ et comparez son bord ovale lumineux avec son intérieur plus sombre.',
    ],
  ],
  M104: [
    [
      '草帽星系（M104）近乎侧面对着我们。一道尘带横在明亮的中央隆起前面，形成了它名字中的「帽檐」。',
      'The Sombrero Galaxy (M104) appears nearly edge-on. A lane of dust passes in front of its bright central bulge, giving the galaxy its broad brim.',
      'Галактика Сомбреро (M104) видна почти с ребра. Полоса пыли проходит перед её ярким центральным утолщением и напоминает поля шляпы.',
      'La galaxie du Sombrero (M104) se présente presque par la tranche. Une bande de poussière passe devant son bulbe lumineux et dessine le bord du chapeau.',
    ],
    [
      '沿着星系的长轴追踪细窄的暗线，再看暗线两侧鼓起的亮光。',
      'Trace the narrow dark lane along the long axis, then compare the light of the bulge on either side.',
      'Проследите узкую тёмную полосу вдоль большой оси и сравните свечение центрального утолщения по её сторонам.',
      'Suivez le mince ruban sombre le long du grand axe, puis comparez la lumière du bulbe de part et d’autre.',
    ],
  ],
  M13: [
    [
      '武仙座的 M13 是银河系中的球状星团。数十万颗恒星被引力聚在一起，中心尤其密集。',
      'M13 in Hercules is a globular cluster in our Milky Way. Gravity binds hundreds of thousands of stars into a particularly dense core and a looser envelope.',
      'M13 в Геркулесе — шаровое скопление Млечного Пути. Тяготение связывает сотни тысяч звёзд в плотное ядро с более разреженной периферией.',
      'M13, dans Hercule, est un amas globulaire de la Voie lactée. La gravité rassemble des centaines de milliers d’étoiles, particulièrement serrées au centre.',
    ],
    [
      '先从外围分得开的星点看起，再向中心移动，观察星点如何逐渐挤成一片亮光。',
      'Start with the separated stars at the edge, then move inward to see them crowd into a bright central glow.',
      'Начните с отдельных звёзд на краю и проследите, как к центру они сливаются в сплошное сияние.',
      'Partez des étoiles distinctes en périphérie et observez comment elles se resserrent en une lueur brillante au centre.',
    ],
  ],
  M33: [
    [
      '三角座星系（M33）和银河系、仙女座星系同属本星系群。它是一座旋涡星系，星盘里散布着孕育恒星的气体云。',
      'The Triangulum Galaxy (M33) belongs to the Local Group with the Milky Way and Andromeda. Clouds of star-forming gas dot its spiral disc.',
      'Галактика Треугольника (M33) вместе с Млечным Путём и Андромедой входит в Местную группу. По её спиральному диску разбросаны облака газа, где рождаются звёзды.',
      'La galaxie du Triangle (M33) fait partie du Groupe local avec la Voie lactée et Andromède. Des nuages de gaz où naissent des étoiles parsèment son disque spiral.',
    ],
    [
      '从不太突出的中央亮区沿着松散的旋臂向外看，留意盘面上斑驳的亮区。',
      'Trace the loosely wound arms out from the modest central glow and look for patches of light scattered across the disc.',
      'От небольшого центрального сгущения проследите раскрытые спиральные рукава и поищите светлые пятна в диске.',
      'Suivez les bras ouverts à partir de la modeste lueur centrale et cherchez les taches claires qui parsèment le disque.',
    ],
  ],
  LMC: [
    [
      '大麦哲伦云是银河系的近邻星系。一道明显的恒星棒横贯星系，周围散布着成群的年轻恒星和恒星形成区。',
      'The Large Magellanic Cloud is a neighbouring galaxy of the Milky Way. A prominent bar of stars crosses it, surrounded by young clusters and star-forming regions.',
      'Большое Магелланово Облако — соседняя с Млечным Путём галактика. Через неё проходит выраженная звёздная перемычка, вокруг которой разбросаны молодые скопления и области звездообразования.',
      'Le Grand Nuage de Magellan est une galaxie voisine de la Voie lactée. Une barre d’étoiles le traverse, entourée de jeunes amas et de régions où naissent des étoiles.',
    ],
    [
      '先用宽视野看贯穿星系的亮棒，再放大棒外侧的斑块。蜘蛛星云就在这一大片天区内。',
      'Use a wide field to pick out the bright bar, then zoom into the patches beyond it. The Tarantula Nebula lies within this wide region.',
      'Найдите яркую перемычку в широком поле, затем увеличьте пятнистые участки за её пределами. В этой обширной области находится и туманность Тарантул.',
      'En grand champ, repérez la barre brillante, puis agrandissez les taches au-delà. La nébuleuse de la Tarentule se trouve dans cette vaste région.',
    ],
  ],
  NGC3324: [
    [
      'NGC 3324 位于船底座。年轻大质量恒星的辐射和星风吹出一片空腔，「宇宙悬崖」展现的就是空腔的一段边缘。',
      'NGC 3324 lies in Carina. Radiation and winds from young massive stars carved out a cavity. The Cosmic Cliffs trace one stretch of its edge.',
      'NGC 3324 находится в созвездии Киля. Излучение и ветер молодых массивных звёзд образовали в газе полость. Космические скалы — участок её края.',
      'NGC 3324 se trouve dans la Carène. Le rayonnement et les vents de jeunes étoiles massives ont creusé une cavité. Les Falaises cosmiques en dessinent une portion du bord.',
    ],
    [
      '在较广的巡天画面中看星团与发光云气的位置，再对照韦伯图像里被放大的云壁。',
      'Use the wider survey field to place the cluster among the glowing gas, then compare it with the close-up of the cloud wall in Webb’s image.',
      'В широком поле обзора найдите скопление среди светящегося газа и сравните его с крупным планом стенки облака на снимке «Уэбба».',
      'Situez l’amas dans le gaz lumineux sur le champ large du relevé, puis comparez avec le gros plan de la paroi du nuage obtenu par Webb.',
    ],
  ],
};

const otherSubjects = {
  'JWST-CARINA-2022': [
    '“宇宙悬崖”是韦伯空间望远镜 2022 年拍摄的一幅影像。这条记录标出相机在船底座 NGC 3324 边缘拍到的那一块天空。照片里像山脊一样的边界，其实是年轻恒星吹出的空腔与致密云气相接的地方。',
    'The Cosmic Cliffs is a 2022 James Webb Space Telescope image. This entry marks the camera’s field at the edge of NGC 3324 in Carina. The apparent mountain ridge is where a cavity carved by young stars meets a dense cloud.',
    '«Космические скалы» — снимок телескопа «Джеймс Уэбб» 2022 года. Эта запись отмечает поле камеры у края NGC 3324 в созвездии Киля. Гребень на фотографии — граница между полостью, созданной молодыми звёздами, и плотным облаком.',
    'Les Falaises cosmiques sont une image obtenue en 2022 par le télescope James Webb. Cette entrée délimite le champ photographié au bord de NGC 3324 dans la Carène. La crête apparente marque la rencontre d’une cavité creusée par de jeunes étoiles avec un nuage dense.',
  ],
  M24: [
    'M24 是人马座方向的一片银河星野。透过前景尘埃之间的空隙，我们能看见这条视线上格外密集的恒星。',
    'M24 is a Milky Way star field in Sagittarius. A gap in foreground dust gives us a view of unusually dense background stars.',
    'M24 — звёздное поле Млечного Пути в Стрельце. Просвет в пыли переднего плана открывает вид на особенно густые россыпи звёзд.',
    'M24 est un champ stellaire de la Voie lactée dans le Sagittaire. Une trouée dans la poussière laisse voir une région particulièrement riche en étoiles.',
  ],
  M40: [
    '大熊座的 M40 由两颗在天空中靠得很近的恒星组成。它们离地球的距离不同，形成一对光学双星。',
    'M40 in Ursa Major is an optical double star. Its two stars appear close together on the sky but lie at different distances from Earth.',
    'M40 в Большой Медведице — оптическая двойная звезда. Два светила находятся на разном расстоянии от Земли и видны рядом на небе.',
    'M40, dans la Grande Ourse, est une double optique. Ses deux étoiles apparaissent proches sur le ciel et se trouvent à des distances différentes de la Terre.',
  ],
  M73: [
    '宝瓶座的 M73 是四颗恒星在天空中排列成的一个小图案，属于星群。',
    'M73 in Aquarius is an asterism, a small pattern formed by the apparent positions of four stars.',
    'M73 в Водолее — астеризм, небольшой рисунок из четырёх звёзд на небе.',
    'M73, dans le Verseau, est un astérisme, une petite figure dessinée sur le ciel par quatre étoiles.',
  ],
  Cl399: [
    '衣架星群位于狐狸座。几颗亮星在同一方向排成了衣架的横杆和弯钩。',
    'The Coathanger in Vulpecula is an asterism. Bright stars seen in the same direction outline a crossbar and hook.',
    'Вешалка в Лисичке — астеризм. Несколько ярких звёзд на небе очерчивают перекладину и крючок.',
    'Le Cintre, dans le Petit Renard, est un astérisme. Des étoiles brillantes dessinent une barre et un crochet sur le ciel.',
  ],
};

const surveyTips = {
  'image-field': [
    '先在宽视场中找准作品的覆盖范围，再打开韦伯影像，沿云壁起伏的亮边辨认细节。两幅图的视场和波段都可能不同。',
    'Place the footprint in a wide survey first, then open the Webb image and follow the bright, uneven edge of the cloud. The two views can differ in both field and wavelength.',
    'Найдите границы кадра на широком обзоре, затем откройте снимок «Уэбба» и проследите неровный светлый край облака. Поле зрения и диапазон волн у этих видов могут различаться.',
    'Situez d’abord l’emprise dans le relevé large, puis ouvrez l’image de Webb et suivez le bord lumineux et irrégulier du nuage. Le champ et les longueurs d’onde peuvent différer.',
  ],
  'galaxy': [
    '先找星系中较亮的位置，再向外观察星光逐渐融入背景的范围。',
    'Find the brighter part of the galaxy, then follow its light outwards until it blends into the sky.',
    'Найдите самую яркую часть галактики и проследите, где её слабое внешнее свечение сливается с фоном.',
    'Repérez la partie la plus brillante de la galaxie, puis suivez son éclat jusqu’à ce qu’il se fonde dans le fond du ciel.',
  ],
  'galaxy-group': [
    '寻找几团各有亮度中心的微光，比较它们的大小、间距和方向。',
    'Look for separate patches of light with their own centres. Compare their sizes, spacing and orientations.',
    'Поищите отдельные светлые пятна с собственными центрами. Сравните их размеры, взаимные расстояния и наклон.',
    'Cherchez des taches lumineuses ayant chacune leur propre centre. Comparez leurs tailles, leurs orientations et leurs espacements.',
  ],
  'open-cluster': [
    '比较星团附近和画面外围的星点分布，看哪些地方的恒星更密集。',
    'Compare the spacing of the stars near the cluster with the surrounding field to pick out the denser areas.',
    'Сравните расстояния между звёздами в скоплении и на окраинах поля, чтобы заметить сгущения.',
    'Comparez l’espacement des étoiles près de l’amas et dans le champ alentour pour repérer les concentrations.',
  ],
  'globular-cluster': [
    '从外围的星点看向中心，留意恒星变得越来越密集的过程。',
    'Work inwards from the stars at the edge and see how their light grows more concentrated towards the centre.',
    'Проследите от края к центру, как звёзды располагаются всё теснее и их свечение сгущается.',
    'Partez des étoiles en périphérie et observez comme leur lumière se concentre vers le cœur.',
  ],
  'stellar-association': [
    '用宽视野比较星点的间距，寻找散布在这片天区中的恒星群。',
    'Use a wide field to compare the spacing of the stars and pick out their loose groupings.',
    'В широком поле сравните расстояния между звёздами и поищите их разреженные группы.',
    'En grand champ, comparez l’espacement des étoiles pour repérer leurs groupements dispersés.',
  ],
  'nebula': [
    '沿着弥漫光斑的边缘移动视线，比较较亮的气体和周围较暗的天空。',
    'Follow the edges of the diffuse patches and compare the brighter gas with the darker sky around it.',
    'Проследите края размытых светлых пятен и сравните свечение газа с более тёмным фоном.',
    'Suivez les bords des plages diffuses et comparez le gaz lumineux au ciel plus sombre autour de lui.',
  ],
  'dark-nebula': [
    '看背景星光在哪里减弱或少了许多，沿明暗的交界勾出云的轮廓。',
    'Look for gaps in the background starlight and trace the edge where the field grows darker.',
    'Найдите участок, где фоновых звёзд видно меньше, и проследите его тёмный контур.',
    'Repérez les zones où les étoiles du fond se raréfient, puis suivez le contour de la partie sombre.',
  ],
  'reflection-nebula': [
    '寻找靠近亮星的微光，沿着弥漫区域观察它的形状和延伸方向。',
    'Look for faint light close to bright stars, then trace the shape and extent of the diffuse patches.',
    'Поищите слабое свечение вблизи ярких звёзд и проследите очертания размытых пятен.',
    'Cherchez un faible voile autour des étoiles brillantes et suivez les contours de ces plages diffuses.',
  ],
  'cluster-nebula': [
    '先找出一群密集的星点，再看看弥漫的云气相对于星团伸向哪里。',
    'Locate the concentration of stars, then trace where the diffuse cloud extends relative to the cluster.',
    'Найдите сгущение звёзд и проследите, в какую сторону от него простирается размытое облако.',
    'Repérez le regroupement d’étoiles, puis suivez les directions où le nuage diffus s’étend autour de lui.',
  ],
  'planetary-nebula': [
    '在目录中心附近找一小片延展的光，比较它的轮廓与附近点状恒星的差异。',
    'Near the catalogue position, look for a small extended glow and compare its outline with nearby point-like stars.',
    'Возле каталожного положения поищите небольшое протяжённое свечение и сравните его очертания с соседними точечными звёздами.',
    'Près de la position du catalogue, cherchez une petite lueur étendue et comparez son contour aux étoiles ponctuelles voisines.',
  ],
  'supernova-remnant': [
    '沿天区中可见的微弱云气寻找细丝或弧线。这些结构在不同波段的明暗会有变化。',
    'Look for filaments or arcs in the faint nebulosity. Their contrast can change from one wavelength to another.',
    'Поищите среди слабого свечения нити или дуги. Их контраст может меняться в разных диапазонах длин волн.',
    'Cherchez des filaments ou des arcs dans les faibles nébulosités. Leur contraste peut varier selon la longueur d’onde.',
  ],
  'star-cloud': [
    '先看连成一片的密集星光，再看周围有哪些方向被暗尘遮住。',
    'Take in the dense field of stars and look for places where dark dust cuts into it.',
    'Рассмотрите густое звёздное поле и найдите участки, в которых его заслоняет тёмная пыль.',
    'Parcourez ce champ riche en étoiles et cherchez les endroits où la poussière sombre le masque.',
  ],
  'double-star': [
    '放大目录中心附近的星点，辨认成对排列的两颗恒星。',
    'Zoom in near the central position and pick out the two stars that form the pair.',
    'Увеличьте участок рядом с центром и найдите две звезды, образующие пару.',
    'Agrandissez la zone centrale et repérez les deux étoiles qui forment la paire.',
  ],
  'asterism': [
    '找出几颗较亮的星，看看它们在天空中组成什么图案。',
    'Pick out the brighter stars and see what pattern their positions trace on the sky.',
    'Найдите более яркие звёзды и проследите, какую фигуру они образуют на небе.',
    'Repérez les étoiles les plus brillantes et suivez la figure qu’elles tracent sur le ciel.',
  ],
};

// Source of the colour recipes: DSSColor/properties and PanSTARRS/properties
// at the MAST endpoints already linked from assets/sky-detail/manifest.json.
const surveyMethods = {
  dss: [
    'DSS 将地面巡天望远镜拍下的照相底片扫描成数字图像。彩色底图通常取红、蓝两组底片，绿色通道由两者平均得到。',
    'DSS digitised photographic plates taken by ground-based survey telescopes. The colour map generally uses red and blue plates, averaging the two for the green channel.',
    'Для DSS оцифровали фотопластинки наземных обзорных телескопов. Обычно красный и синий каналы берут с соответствующих пластинок, а зелёный получают их усреднением.',
    'Le DSS a numérisé les plaques photographiques de télescopes de relevé au sol. La carte couleur utilise en général des plaques rouges et bleues et calcule le canal vert à partir de leur moyenne.',
  ],
  panstarrs: [
    '夏威夷的 Pan-STARRS1 望远镜通过不同滤镜多次拍摄天空。这幅彩色图将 i、r、g 三个波段分别放进红、绿、蓝通道。',
    'The Pan-STARRS1 telescope in Hawaii repeatedly imaged the sky through different filters. This colour map assigns the i, r and g bands to red, green and blue respectively.',
    'Телескоп Pan-STARRS1 на Гавайях многократно снимал небо через разные фильтры. На этой цветной карте полосам i, r и g соответствуют красный, зелёный и синий каналы.',
    'Le télescope Pan-STARRS1, à Hawaï, a observé le ciel à plusieurs reprises à travers différents filtres. Cette carte associe les bandes i, r et g respectivement au rouge, au vert et au bleu.',
  ],
};

function subjectClass(object) {
  if (object.type !== 'galaxy') return object.type;
  const code = object.morphology || '';
  // OpenNGC lists E? and S? as uncertain; leave these galaxies unqualified.
  if (code === 'S0-a') return 'lenticular-spiral';
  if (code === 'E-S0') return 'elliptical-lenticular';
  if (code === 'S0') return 'lenticular';
  if (code === 'E') return 'elliptical';
  if (/^I(?:B|AB)?$/.test(code)) return 'irregular';
  if (/^SAB[a-dm]/.test(code)) return 'weak-bar';
  if (/^SB[a-dm]/.test(code)) return 'barred';
  if (/^S[a-dm]/.test(code)) return 'spiral';
  return 'galaxy';
}

const genericSubject = [
  '$ 是深空目录收录的目标。',
  '$ is an object in the deep-sky catalogue.',
  '$ входит в каталог объектов дальнего космоса.',
  '$ figure au catalogue du ciel profond.',
];
const genericLook = [
  '对照中央目标与周围星野，观察亮度和形状的变化。',
  'Compare the target with the surrounding stars and look for changes in brightness and shape.',
  'Сравните объект с окружающим звёздным полем, обращая внимание на яркость и форму.',
  'Comparez la cible au champ d’étoiles qui l’entoure en observant les différences d’éclat et de forme.',
];

// These two records in the existing catalogue describe the same Pleiades cluster.
const featuredFor = (object) => featured[deepSkyReadingId(object.id)];

export function describeSkyObject(object, language = 'zh') {
  if (!object?.id) return '';
  const i = languageIndex(language);
  const curated =
    deepSkyStories[object.id] ||
    deepSkyLandmarks[object.id]?.intro ||
    featuredFor(object)?.[0] ||
    otherSubjects[object.id];
  if (curated) return curated[i];
  const constellation = SKY_CONSTELLATION_NAMES[object.constellation]?.[i];
  const id = object.id.replace(/^(NGC|IC)(\d)/, '$1 $2');
  const target = constellation
    ? i === 0
      ? `${id}（${constellation}）`
      : `${id} (${constellation})`
    : id;
  const placeholder = i === 0 && constellation ? '$ ' : '$';
  const identity = (subjects[subjectClass(object)] || genericSubject)[i].replace(
    placeholder,
    target
  );
  // The same angular extent can have very different physical sizes at different distances.
  // Use only the two measured axes, never infer a 3-D shape or a missing minor axis.
  const [major, minor] = object.angularSizeArcmin || [];
  if (!Number.isFinite(major) || !(minor > 0 && major / minor >= 1.5)) return identity;
  const ratio = (major / minor).toLocaleString(languages[i], { maximumFractionDigits: 1 });
  const shape = [
    `在天球上的轮廓较狭长，星表给出的长径约为短径的 ${ratio} 倍。`,
    `Its outline is elongated on the sky. The catalogue gives a long axis about ${ratio} times the short one.`,
    `На небе объект выглядит вытянутым. Отношение большой оси к малой по каталогу составляет около ${ratio}.`,
    `Sa silhouette est allongée sur le ciel. Au catalogue, le grand axe mesure environ ${ratio} fois le petit.`,
  ][i];
  return identity + (i === 0 ? '' : ' ') + shape;
}

export function catalogueExtentText(object, language) {
  const i = languageIndex(language);
  const [major, minor] = object.angularSizeArcmin || [];
  if (!(Number.isFinite(major) && major > 0)) return '';
  const large = major >= 60;
  const unit = large ? '°' : '′';
  const format = new Intl.NumberFormat(languages[i], { maximumFractionDigits: 2 });
  const dimension = (size) => format.format(large ? size / 60 : size) + unit;
  // The source repeats a single measured diameter on both axes.
  const extent =
    Number.isFinite(minor) && minor > 0 && minor !== major
      ? `${dimension(major)} × ${dimension(minor)}`
      : dimension(major);
  return [
    `星表记录的视大小约为 ${extent}。`,
    `Its catalogue angular size is about ${extent}.`,
    `Угловой размер по каталогу — около ${extent}.`,
    `Sa taille apparente au catalogue est d’environ ${extent}.`,
  ][i];
}

export function describeSurveyImage(object, source = 'dss', language = 'zh') {
  if (!object?.id) return { look: '', method: '' };
  const i = languageIndex(language);
  const look = describeObjectAppearance(object, language);
  const extent = catalogueExtentText(object, language);
  return {
    look: extent ? look + (i === 0 ? '' : ' ') + extent : look,
    method: (surveyMethods[source] || surveyMethods.dss)[i],
  };
}

export function describeObjectAppearance(object, language = 'zh') {
  const i = languageIndex(language);
  const tips =
    featuredFor(object)?.[1] ||
    surveyTips[object.id === 'Cl399' ? 'asterism' : object.type] ||
    genericLook;
  return tips[i];
}
