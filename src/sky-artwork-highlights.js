// Descriptions refer to the specific published framing. The gallery links each
// numbered work to its ESA/Hubble or ESA/Webb source page.
const highlights = {
  hubble: {
    heic2007a: [
      '画面里的两座星云都在大麦哲伦云。大片红色云气属于 NGC 2014，旁边那个小而蓝的气泡是 NGC 2020。',
      'Two nebulae share this field in the Large Magellanic Cloud. The broad red cloud is NGC 2014. The smaller blue bubble beside it is NGC 2020.',
      'В кадре две туманности Большого Магелланова Облака. Обширное красное облако — NGC 2014, а небольшой голубой пузырь рядом — NGC 2020.',
      'Deux nébuleuses du Grand Nuage de Magellan partagent le champ. Le vaste nuage rouge est NGC 2014. La petite bulle bleue à côté est NGC 2020.',
    ],
    potw2050a: [
      '画面中央的亮星系旁有一道几乎闭合的光弧。前景星系团的引力弯折了远方一个星系发出的光，让它的影像绕成了环。',
      'A thin arc almost encircles the bright central galaxy. The gravity of the foreground cluster bends light from a more distant galaxy, stretching its image into a ring.',
      'Тонкая дуга почти замыкается вокруг яркой галактики в центре. Тяготение переднего скопления искривляет свет далёкой галактики, растягивая её изображение в кольцо.',
      'Un arc mince entoure presque entièrement la galaxie brillante au centre. La gravité de l’amas au premier plan dévie la lumière d’une galaxie lointaine et étire son image en anneau.',
    ],
    heic2018a: [
      '在 NGC 2525 的这张局部照片中，左侧耀眼的光点是超新星 SN 2018gv。天文学家跟踪它逐渐变暗的过程，用这类爆发测量星系距离。',
      'The bright point on the left of this cropped view of NGC 2525 is supernova SN 2018gv. Astronomers followed it as it faded. Such explosions help them measure how far away galaxies are.',
      'Яркая точка слева на этом фрагменте NGC 2525 — сверхновая SN 2018gv. Астрономы следили за тем, как она угасала. Такие вспышки помогают измерять расстояния до галактик.',
      'Le point lumineux à gauche sur ce détail de NGC 2525 est la supernova SN 2018gv. Les astronomes ont suivi la baisse de son éclat. De telles explosions permettent de mesurer la distance des galaxies.',
    ],
    heic1608a: [
      '先找近乎圆形的薄壳，再看它中心稍偏左的亮星。这颗星吹出的恒星风把周围气体向外推，形成了气泡星云的轮廓。',
      'Trace the nearly round shell, then find the bright star just left of its centre. The wind from that star pushes the surrounding gas outwards, giving the Bubble Nebula its outline.',
      'Проследите контур почти круглой оболочки. Чуть левее её центра видна яркая звезда. Её звёздный ветер выталкивает окружающий газ и формирует туманность Пузырь.',
      'Suivez le contour de la coquille presque ronde, puis repérez l’étoile brillante un peu à gauche du centre. Son vent stellaire repousse le gaz alentour et dessine la nébuleuse de la Bulle.',
    ],
    potw1345a: [
      '两座触须星系交会的区域布满蓝色的年轻星团和粉红色云气，几道暗色尘带从中穿过。这幅近景适合看碰撞中正在形成的新星。',
      'Look where the two Antennae galaxies overlap. Dark dust lanes cut across pink gas clouds and blue patches of young stars. This close view shows where the collision is triggering star birth.',
      'В области наложения галактик Антенны тёмные полосы пыли пересекают розовые облака газа и голубые скопления молодых звёзд. Здесь при столкновении галактик рождаются новые звёзды.',
      'Dans la zone où se superposent les galaxies des Antennes, des bandes de poussière sombre traversent des nuages de gaz roses et des groupes de jeunes étoiles bleues. La collision y déclenche la formation d’étoiles.',
    ],
    heic1307a: [
      '马头形的云柱从下方的尘埃里升起。在这张红外照片上，沿着轮廓还能看到云气的褶皱，以及透过部分尘埃显现的背景星。',
      'The horsehead-shaped column rises from the dust below. In this infrared view you can trace folds in the cloud and see background stars through some of the dust.',
      'Столб в форме лошадиной головы поднимается из пыли внизу. В инфракрасном свете видны складки облака и звёзды, просвечивающие сквозь отдельные участки пыли.',
      'La colonne en forme de tête de cheval émerge de la poussière en bas du champ. En infrarouge, on distingue les plis du nuage et des étoiles qui transparaissent à travers certaines zones de poussière.',
    ],
    potw2049a: [
      'NGC 1792 的中央泛着橙光，星盘上却分布着大片蓝色。蓝色标出了年轻炽热的恒星，中央的橙光主要来自较老、较冷的恒星。',
      'NGC 1792 glows orange near its centre, while broad patches across the disc look blue. These patches trace hot young stars. Older, cooler stars dominate the orange central light.',
      'Центр NGC 1792 светится оранжевым, а по диску разбросаны обширные голубые области. Там много молодых горячих звёзд. В центре преобладает свет более старых и холодных звёзд.',
      'Le centre de NGC 1792 luit en orange, tandis que de grandes plages bleues parsèment le disque. Le bleu révèle de jeunes étoiles chaudes. La lumière orangée du centre provient surtout d’étoiles plus âgées et plus froides.',
    ],
  },
  recent: {
    potm2208a: [
      '沿着 M74 的旋臂从中心向外看，能看到细密的气体和尘埃丝。中央的气体较少，露出了紧密的核星团。',
      'Follow the spiral arms of M74 outwards to see fine threads of gas and dust. There is less gas in the middle, leaving a clear view of the compact nuclear star cluster.',
      'Проследите рукава M74 от центра к краям. В них видны тонкие нити газа и пыли. В самом центре газа меньше, и хорошо различимо компактное ядерное звёздное скопление.',
      'Suivez les bras spiraux de M74 vers l’extérieur pour repérer les fins filaments de gaz et de poussière. Le gaz se raréfie au centre, laissant voir l’amas d’étoiles du noyau.',
    ],
    weic2207b: [
      '在南环星云一层层起伏的亮环里，中央最亮的星格外醒目。向它的左下方细看，还有一颗更暗的星，周围这些气体正是它陆续抛出的。',
      'Look inside the rippling rings of the Southern Ring Nebula. Just below and to the left of the bright central star is a much fainter one. It expelled the gas that now forms those rings.',
      'Загляните внутрь волнистых колец туманности Южное Кольцо. Чуть ниже и левее яркой центральной звезды видна гораздо более тусклая. Именно она сбросила газ, образующий эти кольца.',
      'Regardez à l’intérieur des anneaux ondulés de la nébuleuse de l’Anneau austral. Juste en bas à gauche de l’étoile brillante au centre se trouve une étoile plus discrète. C’est elle qui a éjecté le gaz des anneaux.',
    ],
    weic2207c: [
      '在这张中红外合成图里，南环星云中央的两颗星清晰可辨。左侧的星被尘埃包裹，图中呈红色。它抛出的物质在两颗星外围铺成层层壳体。',
      'The two central stars of the Southern Ring Nebula stand apart in this mid-infrared composite. The dusty star on the left appears red. Material it has shed forms shells around the pair.',
      'На этом изображении в среднем инфракрасном диапазоне видны обе центральные звезды туманности Южное Кольцо. Окутанная пылью звезда слева показана красной. Сброшенное ею вещество образует оболочки вокруг пары.',
      'Cette composition en infrarouge moyen distingue les deux étoiles au centre de la nébuleuse de l’Anneau austral. L’étoile de gauche, enveloppée de poussière, apparaît rouge. La matière qu’elle a éjectée forme des enveloppes autour du couple.',
    ],
    weic2209a: [
      '在中央亮星系的两侧寻找橙色弧线。前景星系团 SMACS 0723 像一枚引力透镜，把更远处星系的光放大、拉长，有些星系还在图中出现了多次。',
      'Look for orange arcs on either side of the bright central galaxy. The foreground cluster SMACS 0723 acts as a gravitational lens, magnifying and stretching images of more distant galaxies. Some appear more than once.',
      'Найдите оранжевые дуги по сторонам яркой центральной галактики. Скопление SMACS 0723 на переднем плане действует как гравитационная линза. Она увеличивает и растягивает изображения далёких галактик, а некоторые из них видны несколько раз.',
      'Repérez les arcs orangés de part et d’autre de la galaxie brillante au centre. L’amas SMACS 0723 agit comme une lentille gravitationnelle. Il agrandit et étire les images de galaxies plus lointaines, dont certaines apparaissent plusieurs fois.',
    ],
  },
};

const languageIndex = { zh: 0, en: 1, ru: 2, fr: 3 };

export function highlightReading(source, id, language) {
  return highlights[source]?.[id]?.[languageIndex[language]];
}
