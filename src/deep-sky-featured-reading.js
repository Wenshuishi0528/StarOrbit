// Nearby observing landmarks outside the Messier catalogue. Language order matches sky-object-reading.
const caldwell = (n) => ({
  name: 'NASA · Hubble',
  url:
    'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-' +
    n +
    '/',
});

export const deepSkyLandmarks = {
  NGC292: {
    source: {
      name: 'NASA · Hubble',
      url: 'https://science.nasa.gov/asset/hubble/magellanic-gemstones-in-the-southern-sky/',
    },
    intro: [
      '小麦哲伦云是银河系近邻的一座矮星系。它在南天像一块脱离银河的云气。把视线移向其中的 NGC 346 等区域，就能在另一座星系里辨认星团和恒星诞生地。',
      'The Small Magellanic Cloud is a dwarf galaxy near the Milky Way. Its cloud-like southern patch resolves into star fields. Regions such as NGC 346 show clusters and stellar nurseries in another galaxy.',
      'Малое Магелланово Облако — карликовая соседка Млечного Пути. Южное пятно распадается на звёздные поля. Такие области, как NGC 346, показывают скопления и рождение звёзд в другой галактике.',
      'Le Petit Nuage de Magellan est une galaxie naine voisine. Sa tache australe se résout en champs stellaires, dont NGC 346 où l’on observe des étoiles naître dans une autre galaxie.',
    ],
  },
  B33: {
    source: {
      name: 'NASA · Hubble / Webb',
      url: 'https://science.nasa.gov/asset/webb/horsehead-nebula-euclid-hubble-and-webb-images/',
    },
    intro: [
      '马头星云 B33 是猎户座的一团浓密尘气。它有名的马头轮廓是背景辉光映出的剪影。红外波段能更仔细地观察被恒星照亮的云顶边缘，追踪这片云如何被逐渐侵蚀。',
      'The Horsehead, Barnard 33 in Orion, is a dense cloud of gas and dust. Its famous outline is a silhouette against glowing gas behind it. Infrared images resolve the illuminated crest where stellar radiation erodes the cloud.',
      'Конская Голова B33 в Орионе — плотное облако газа и пыли. Силуэт виден на фоне светящегося газа, а инфракрасные снимки показывают освещённый гребень, разрушаемый звёздным излучением.',
      'La Tête de Cheval B33, dans Orion, est un nuage dense de gaz et de poussière. Sa silhouette se détache sur du gaz lumineux. L’infrarouge résout la crête éclairée que le rayonnement stellaire érode.',
    ],
  },
  C9: {
    source: caldwell(9),
    intro: [
      '洞穴星云 C9 位于仙王座。一片暗尘云切入发光的云壁，留下像洞口的凹处。周围年轻恒星的辐射照亮并改变气体，所以亮边与黑暗的交界最值得细看。',
      'The Cave Nebula, C9 in Cepheus, takes its shape from dark dust against an illuminated cloud wall. Young stars light and reshape the gas, especially along the bright edge of the apparent opening.',
      'Пещера C9 в Цефее получила свой вид благодаря тёмной пыли на фоне освещённой стенки облака. Молодые звёзды меняют газ у яркой границы видимого входа.',
      'La Grotte C9, dans Céphée, se dessine par de la poussière sombre sur une paroi éclairée. Les jeunes étoiles illuminent et remodèlent le gaz, notamment le bord lumineux de l’ouverture apparente.',
    ],
  },
  C14: {
    source: caldwell(14),
    intro: [
      '英仙座双星团是并排的两座疏散星团 NGC 869 和 NGC 884 的合称。这个 C14 条目给出能同时看到两团的天区范围。两团各自的编号则指向各自的中心，适合分别放大。',
      'The Double Cluster is the pair of open clusters NGC 869 and NGC 884 in Perseus. C14 marks the wider field containing both. Each NGC entry pinpoints its own centre for a closer look.',
      'Двойное скопление в Персее — это NGC 869 и NGC 884. Запись C14 охватывает оба рассеянных скопления, а отдельные номера NGC указывают на их собственные центры.',
      'Le Double Amas de Persée réunit NGC 869 et NGC 884. L’entrée C14 couvre les deux amas ouverts, tandis que chaque numéro NGC situe son centre pour une vue détaillée.',
    ],
  },
  C41: {
    source: {
      name: 'NASA · Night Sky Network',
      url: 'https://science.nasa.gov/solar-system/skywatching/night-sky-network/spot-the-young-stars-of-the-hyades-and-pleiades/',
    },
    intro: [
      '毕星团是太阳附近的疏散星团，明亮成员在金牛座的脸部画出一个 V 字。橙色亮星毕宿五恰好在 V 字的一侧，却比星团更靠近我们。把眼前的图案和真实的星团成员分开，是认识毕星团的第一步。',
      'The Hyades is a nearby open cluster tracing a V in the face of Taurus. Orange Aldebaran appears along one side but lies closer than the cluster. The familiar outline includes both members and a foreground star.',
      'Гиады — близкое рассеянное скопление, образующее букву V на голове Тельца. Оранжевый Альдебаран виден на краю этого рисунка, но расположен перед скоплением.',
      'Les Hyades sont un amas ouvert proche dessinant un V dans la tête du Taureau. Aldébaran, orangée, semble marquer un côté du V mais se trouve devant l’amas.',
    ],
  },
  C99: {
    source: { name: 'ESO', url: 'https://www.eso.org/public/images/b06/' },
    intro: [
      '煤袋星云是南十字座旁的一片暗星云。这里银河背景本来布满星光，一团前景尘埃把远处的光挡住，才会在肉眼可见的明亮银河上显出格外醒目的黑斑。',
      'The Coalsack is a dark nebula beside the Southern Cross. Foreground dust blocks the stars behind it, cutting a conspicuous dark patch out of the bright band of the Milky Way.',
      'Угольный Мешок — тёмная туманность у Южного Креста. Передняя пыль заслоняет далёкие звёзды и вырезает заметное тёмное пятно в светлой полосе Млечного Пути.',
      'Le Sac à Charbon est une nébuleuse obscure près de la Croix du Sud. Sa poussière masque les étoiles lointaines et découpe une tache sombre dans la bande brillante de la Voie lactée.',
    ],
  },
  Mel111: {
    source: {
      name: 'CDS · SIMBAD',
      url: 'https://simbad.cfa.harvard.edu/simbad/sim-id?Ident=Mel+111',
    },
    intro: [
      '后发座星团 Melotte 111 是银河系中的疏散星团，成员分布在好几度宽的天空上。双筒望远镜或很宽的取景能保留这片松散星野。它和更遥远的后发座星系团恰巧在同一天区。',
      'Melotte 111, the Coma Star Cluster, is a Milky Way open cluster spread over several degrees. A wide field suits its loose arrangement. The much more distant Coma Cluster of galaxies lies in the same part of the sky.',
      'Мелотт 111 — рассеянное звёздное скопление Млечного Пути в Волосах Вероники. Его рыхлый узор занимает несколько градусов. В том же направлении лежит гораздо более далёкое скопление галактик Кома.',
      'Melotte 111 est un amas ouvert de la Voie lactée couvrant plusieurs degrés dans la Chevelure de Bérénice. Son dessin dispersé demande un grand champ. L’amas de galaxies de Coma est beaucoup plus lointain.',
    ],
  },
  IC405: {
    source: {
      name: 'NASA · APOD',
      url: 'https://science.nasa.gov/image-article/apod-2005-october-18-ae-aurigae-the-flaming-star/',
    },
    intro: [
      '火焰之星星云 IC 405 的醒目亮星是御夫座 AE。这颗炽热恒星照亮气体和尘埃，氢气发光与尘埃散射星光在同一片云中留下不同的颜色。',
      'The Flaming Star Nebula, IC 405, is illuminated by hot AE Aurigae. Glowing hydrogen and dust scattering starlight give different colours to parts of the same cloud.',
      'Туманность Пламенеющей Звезды IC 405 освещает горячая AE Возничего. Свечение водорода и рассеяние звёздного света пылью окрашивают части одного облака по-разному.',
      'La nébuleuse de l’Étoile flamboyante IC 405 est éclairée par AE du Cocher. L’hydrogène lumineux et la poussière qui diffuse la lumière de l’étoile donnent des couleurs différentes au même nuage.',
    ],
  },
  IC1805: {
    source: {
      name: 'NASA · APOD',
      url: 'https://science.nasa.gov/image-article/apod-2025-october-21-ic-1805-the-heart-nebula/',
    },
    intro: [
      '心脏星云 IC 1805 在仙后座的广角照片上显出心形轮廓。中央年轻星团 Melotte 15 的大质量恒星照亮云气，并用星风改变云的形状。放大“心脏”中央，就能从外形转到塑造它的星群。',
      'The Heart Nebula, IC 1805, shows its heart-shaped outline in wide images of Cassiopeia. Massive stars in the central cluster Melotte 15 light and reshape the gas. A close view takes you from the silhouette to the stars that formed it.',
      'Сердце IC 1805 видно в широком поле Кассиопеи. Массивные звёзды в центральном скоплении Мелотт 15 освещают и меняют газ. Увеличение центра показывает звёзды, создавшие контур.',
      'Le Cœur IC 1805 dessine sa forme en grand champ dans Cassiopée. Les étoiles massives de l’amas central Melotte 15 éclairent et remodèlent le gaz. Un gros plan en montre les sculpteurs.',
    ],
  },
  IC1848: {
    source: { name: 'NASA', url: 'https://science.nasa.gov/photojournal/soul-nebula/' },
    intro: [
      '灵魂星云所在的 W5 成星区位于仙后座。年轻大质量恒星吹开气体，造出宽阔空腔。红外影像能沿空腔边缘找出尘埃和幼星，广域取景则可和邻近的心脏星云一起辨认。',
      'The Soul Nebula belongs to the W5 star-forming region in Cassiopeia. Young massive stars have hollowed out cavities. Infrared images trace dust and young stars near their rims, while a wider field includes the nearby Heart Nebula.',
      'Душа относится к области звездообразования W5 в Кассиопее. Массивные молодые звёзды выдули полости. Инфракрасные снимки показывают пыль и молодые звёзды у краёв, а широкий вид включает и туманность Сердце.',
      'L’Âme appartient à la région W5 dans Cassiopée. Les jeunes étoiles massives y ont creusé des cavités. L’infrarouge suit poussières et étoiles jeunes sur leurs bords, et le grand champ inclut aussi le Cœur.',
    ],
  },
  NGC1333: {
    source: { name: 'NASA · Hubble', url: 'https://science.nasa.gov/asset/hubble/ngc-1333/' },
    intro: [
      'NGC 1333 是英仙座分子云里的一处育星区。厚尘埃遮住许多尚未显露的年轻恒星，幼星喷出的气体撞入云物质时会留下亮结和细弧，让藏在暗处的活动显露出来。',
      'NGC 1333 is a stellar nursery in the Perseus molecular cloud. Dust hides many young stars. Gas ejected by them strikes the cloud and leaves bright knots and arcs, revealing activity beyond the obscuring dust.',
      'NGC 1333 — звёздная колыбель в молекулярном облаке Персея. Пыль скрывает молодые звёзды, но выбросы газа сталкиваются с облаком и оставляют яркие узлы и дуги.',
      'NGC 1333 est une pouponnière du nuage moléculaire de Persée. La poussière cache des étoiles jeunes, mais leurs jets heurtent le nuage et y tracent des nœuds et arcs brillants.',
    ],
  },
  NGC1909: {
    source: {
      name: 'NASA · APOD',
      url: 'https://science.nasa.gov/image-article/apod-2026-november-9-rigel-and-the-witch-head-nebula/',
    },
    intro: [
      '女巫头星云是反射星云，它的侧脸轮廓由尘埃勾出。附近猎户座亮星参宿七照亮了这片云，尘粒把部分星光散射向地球，使原本暗淡的尘雾显出淡蓝色。',
      'The Witch Head is a reflection nebula whose dust outlines a face in profile. Light from nearby Rigel in Orion scatters from the grains towards Earth, revealing a faint bluish cloud.',
      'Голова Ведьмы — отражательная туманность с пылевым контуром профиля. Свет Ригеля в Орионе рассеивается пылью к Земле, делая облако слабо-голубым.',
      'La Tête de Sorcière est une nébuleuse par réflexion dont la poussière dessine un profil. La lumière de Rigel, dans Orion, diffusée vers la Terre donne à ce nuage une teinte bleuâtre.',
    ],
  },
  NGC1977: {
    source: {
      name: 'NASA · APOD',
      url: 'https://science.nasa.gov/image-article/apod-2023-february-2-reflections-on-the-1970s/',
    },
    intro: [
      'NGC 1977 位于猎户座大星云北面，是奔跑者星云天区的一部分。年轻恒星的光被尘埃散射，形成偏蓝的背景。背景上的暗纹让人联想到一个奔跑的人，较宽的照片才容易看全这幅图案。',
      'NGC 1977 lies just north of the Orion Nebula in the Running Man field. Dust scatters light from young stars into a bluish background. Dark markings suggest the runner’s silhouette in a wide view.',
      'NGC 1977 лежит к северу от Туманности Ориона в области Бегущего Человека. Пыль рассеивает свет молодых звёзд, создавая голубоватый фон с тёмным силуэтом бегуна.',
      'NGC 1977 se situe au nord de la nébuleuse d’Orion, dans le champ de l’Homme qui court. La poussière diffuse la lumière des étoiles jeunes sur un fond bleuté où se dessine le coureur.',
    ],
  },
  NGC2070: {
    source: {
      name: 'NASA · Hubble',
      url: 'https://science.nasa.gov/asset/hubble/30-doradus-a-massive-star-forming-region/',
    },
    intro: [
      '蜘蛛星云，也叫剑鱼座 30，是大麦哲伦云里巨大的恒星形成区。在其中心附近，R136 星团聚集着一批炽热的大质量恒星。它们的辐射与星风作用于周围气体，形成宽广的空腔与细丝。',
      'The Tarantula Nebula, or 30 Doradus, is a vast stellar nursery in the Large Magellanic Cloud. The central cluster R136 concentrates hot, massive stars whose winds and radiation carve cavities and filaments in the gas.',
      'Тарантул, или 30 Золотой Рыбы, — огромная звёздная колыбель Большого Магелланова Облака. В центральном скоплении R136 горячие массивные звёзды создают в газе полости и волокна ветрами и излучением.',
      'La Tarentule, ou 30 Doradus, est une vaste pouponnière du Grand Nuage de Magellan. L’amas R136 concentre des étoiles massives chaudes dont les vents et le rayonnement sculptent cavités et filaments.',
    ],
  },
  NGC2359: {
    source: { name: 'ESO', url: 'https://www.eso.org/public/images/eso1238a/' },
    intro: [
      '雷神头盔星云 NGC 2359 是一团被大质量恒星吹起来的气泡。中心是一颗星风极强的沃尔夫–拉叶星，喷出的物质扫过周围气体，勾出头盔圆顶和两侧向外伸出的轮廓。',
      'Thor’s Helmet, NGC 2359, is a bubble inflated by a massive star. A Wolf–Rayet star at the centre drives a powerful wind into surrounding gas, outlining the dome and its lateral extensions.',
      'Шлем Тора NGC 2359 — пузырь, выдутый массивной звездой. Сильный ветер центральной звезды Вольфа — Райе сгребает окружающий газ, образуя купол и боковые выступы.',
      'Le Casque de Thor NGC 2359 est une bulle gonflée par une étoile massive. Le vent puissant de l’étoile centrale de Wolf-Rayet balaie le gaz et dessine le dôme ainsi que ses extensions latérales.',
    ],
  },
  NGC3132: {
    source: { name: 'ESA / Webb', url: 'https://esawebb.org/images/weic2207b/' },
    intro: [
      '南环状星云 NGC 3132 是一颗恒星在生命晚期抛出气体后形成的星云。韦伯在红外波段看见多层气壳以及尘埃，中心区域里亮星与较暗伴星的区别，在不同波段的照片中也更容易辨认。',
      'The Southern Ring Nebula, NGC 3132, is gas cast off late in a star’s life. Webb’s infrared images resolve shells and dust. Different wavelengths also help distinguish the bright star near the centre from its fainter companion.',
      'Южное Кольцо NGC 3132 образовано газом, сброшенным стареющей звездой. Инфракрасные снимки «Уэбба» показывают оболочки и пыль. Разные диапазоны помогают различить яркую звезду у центра и её слабую спутницу.',
      'L’Anneau austral NGC 3132 provient du gaz expulsé par une étoile en fin de vie. L’infrarouge de Webb résout les enveloppes et la poussière, et aide à distinguer l’étoile brillante près du centre de sa compagne plus faible.',
    ],
  },
  NGC6302: {
    source: {
      name: 'NASA · Hubble',
      url: 'https://science.nasa.gov/image-detail/ngc-6302-the-butterfly-nebula/',
    },
    intro: [
      '蝴蝶星云 NGC 6302 是一处双极行星状星云。晚年恒星抛出的气体向中心两侧展开，显出蝶翼般的结构。靠近中央的浓尘带几乎把为整片气体供能的炽热星核遮住。',
      'The Butterfly Nebula, NGC 6302, is a bipolar planetary nebula. Gas shed by an ageing star streams into two wings. A central band of dust nearly conceals the hot core that powers the glow.',
      'Бабочка NGC 6302 — биполярная планетарная туманность. Сброшенный звездой газ расходится двумя крыльями, а плотная центральная пыль почти скрывает горячее ядро, вызывающее свечение.',
      'Le Papillon NGC 6302 est une nébuleuse planétaire bipolaire. Le gaz éjecté forme deux ailes, et une ceinture centrale de poussière cache presque le cœur chaud qui les fait briller.',
    ],
  },
  NGC6334: {
    source: {
      name: 'NASA · Webb',
      url: 'https://science.nasa.gov/asset/webb/cats-paw-nebula-nircam-image/',
    },
    intro: [
      '猫爪星云 NGC 6334 位于天蝎座，是银河系中诞生大质量恒星的区域。光学照片里分开的几个亮斑像猫的肉垫，红外相机则能穿透部分尘埃，看见其中更年轻、更隐蔽的恒星和气腔。',
      'The Cat’s Paw, NGC 6334 in Scorpius, forms massive stars in the Milky Way. Separate luminous patches suggest paw pads in visible light. Infrared images penetrate some dust to reveal younger embedded stars and cavities.',
      'Кошачья Лапа NGC 6334 в Скорпионе — область рождения массивных звёзд Млечного Пути. В оптике пятна напоминают подушечки лапы. Инфракрасные снимки выявляют молодые скрытые звёзды и полости.',
      'La Patte de Chat NGC 6334, dans le Scorpion, forme des étoiles massives dans la Voie lactée. Les plages visibles évoquent des coussinets. L’infrarouge traverse une partie de la poussière et révèle étoiles enfouies et cavités.',
    ],
  },
  NGC6357: {
    source: { name: 'ESO', url: 'https://www.eso.org/public/images/potw1334a/' },
    intro: [
      '龙虾星云 NGC 6357 是天蝎座里一片气体和尘埃交错的育星区。年轻星团 Pismis 24 的大质量恒星用强烈辐射照亮周围气体，也在致密云壁上雕出弧形边缘。',
      'The Lobster Nebula, NGC 6357 in Scorpius, is a star-forming complex of gas and dust. Massive members of young cluster Pismis 24 light up the gas and carve curved edges into dense cloud walls.',
      'Омар NGC 6357 в Скорпионе — газопылевой комплекс, где рождаются звёзды. Массивные члены молодого скопления Pismis 24 освещают газ и вырезают дуги в плотных стенках облаков.',
      'Le Homard NGC 6357, dans le Scorpion, est un complexe de gaz et de poussière où naissent des étoiles. Les membres massifs de l’amas Pismis 24 éclairent le gaz et sculptent les bords courbes des nuages.',
    ],
  },
  NGC7635: {
    source: {
      name: 'NASA · Hubble',
      url: 'https://science.nasa.gov/asset/hubble/bubble-nebula-ngc-7635/',
    },
    intro: [
      '气泡星云 NGC 7635 位于仙后座。中心附近的一颗大质量恒星不停吹出高速星风，把周围气体推成一层薄壳。薄壳边缘显得特别明亮，在较暗的云气前勾出近圆的气泡。',
      'The Bubble Nebula, NGC 7635 in Cassiopeia, is shaped by a massive star near its centre. Its fast wind sweeps gas into a thin shell. The bright rim traces an almost circular bubble against a darker cloud.',
      'Пузырь NGC 7635 в Кассиопее создан массивной звездой вблизи центра. Её быстрый ветер сгребает газ в тонкую оболочку, яркий край которой очерчивает почти круглый пузырь.',
      'La Bulle NGC 7635, dans Cassiopée, est sculptée par une étoile massive proche du centre. Son vent rapide comprime le gaz en une coque mince dont le bord brillant trace une bulle presque ronde.',
    ],
  },
  NGC104: {
    source: caldwell(106),
    intro: [
      '杜鹃座 47 是南天的一座球状星团，名字听起来像恒星，因为肉眼只能把它看成一个泛白的小点。放大到中心，才看得到造成这团微光的是密密层层的古老恒星。',
      '47 Tucanae is a southern globular cluster with a star-like name. It looks like a pale spot to the eye. At high resolution the glow breaks up into a dense population of old stars, especially towards the centre.',
      '47 Тукана — южное шаровое скопление со звёздным названием. Глаз различает лишь бледное пятно. При высоком разрешении оно распадается на старые звёзды, особенно тесные к центру.',
      '47 Tucanae est un amas globulaire austral au nom d’étoile. À l’œil nu il paraît comme une tache pâle, mais une image résolue montre la multitude d’étoiles âgées serrées vers son centre.',
    ],
  },
  NGC253: {
    source: { name: 'ESO', url: 'https://www.eso.org/public/images/eso1025a/' },
    intro: [
      '玉夫座星系 NGC 253 是邻近的旋涡星系，倾斜的星盘在天上显得狭长。它的中央正活跃地形成恒星。可见光照片里尘埃切出许多暗纹，红外观测则能探入其中较隐蔽的区域。',
      'NGC 253, the Sculptor Galaxy, is a nearby spiral whose inclined disc looks elongated. Stars form vigorously near its centre. Dark lanes obscure the optical view, while infrared observations reach farther into the dusty regions.',
      'Галактика Скульптора NGC 253 — близкая спираль, наклонённый диск которой кажется вытянутым. Вблизи центра активно рождаются звёзды. Тёмные полосы пыли скрывают их в оптике, но инфракрасный свет проникает глубже.',
      'NGC 253, la galaxie du Sculpteur, est une spirale proche au disque incliné. Les étoiles se forment activement près du centre. Les bandes de poussière assombrissent la vue optique, tandis que l’infrarouge pénètre plus loin.',
    ],
  },
  NGC869: {
    source: caldwell(14),
    intro: [
      'NGC 869 又称 h Persei，是英仙座双星团里偏西的一团。与附近 NGC 884 并看时，两片密集的年轻恒星从银河背景中浮现出来。双筒望远镜的宽视场很适合把两团一起收入眼底。',
      'NGC 869, or h Persei, is the western half of the Double Cluster. Together with NGC 884 it forms two knots of young stars against the Milky Way. Binoculars can place both in a single wide field.',
      'NGC 869, или h Персея, — западная часть Двойного скопления. Вместе с NGC 884 она образует два сгущения молодых звёзд на фоне Млечного Пути. Широкое поле бинокля охватывает оба.',
      'NGC 869, ou h Persei, est la moitié occidentale du Double Amas. Avec NGC 884, il forme deux concentrations de jeunes étoiles sur le fond de la Voie lactée. Des jumelles les montrent dans un même champ.',
    ],
  },
  NGC884: {
    source: caldwell(14),
    intro: [
      'NGC 884 又称 χ Persei，是英仙座双星团里偏东的一团。它和 NGC 869 各有自己的恒星集中区。先用宽视场辨认两个中心，再分别放大，会比把整个双星团当成一个光斑更容易看清。',
      'NGC 884, or Chi Persei, is the eastern half of the Double Cluster. It and NGC 869 each have their own concentration of stars. Find both centres at low power before exploring them separately.',
      'NGC 884, или хи Персея, — восточная половина Двойного скопления. У него и NGC 869 свои центры сгущения. Найдите оба в широком поле, затем рассмотрите каждое отдельно.',
      'NGC 884, ou Chi Persei, est la moitié orientale du Double Amas. NGC 869 et lui ont chacun leur concentration d’étoiles. Repérez les deux centres en grand champ avant de les détailler.',
    ],
  },
  NGC1499: {
    source: {
      name: 'NASA · APOD',
      url: 'https://science.nasa.gov/image-article/apod-2006-september-24-ngc-1499-the-california-nebula/',
    },
    intro: [
      '加利福尼亚星云 NGC 1499 位于英仙座，因长条轮廓有些像加利福尼亚州而得名。星云里的氢气受附近炽热恒星照射而发光，红光照片尤其容易显出它沿银河铺开的边缘。',
      'The California Nebula, NGC 1499 in Perseus, takes its name from a long outline resembling the state. Radiation from a nearby hot star makes the hydrogen glow. Red-light exposures trace the extended edges against the Milky Way.',
      'Калифорния, NGC 1499 в Персее, названа за вытянутый контур, похожий на штат. Излучение горячей звезды заставляет водород светиться. Красные снимки выявляют протяжённые края на фоне Млечного Пути.',
      'La nébuleuse Californie, NGC 1499 dans Persée, doit son nom à son contour allongé qui évoque cet État. Une étoile chaude fait briller l’hydrogène et les poses en lumière rouge tracent ses bords sur la Voie lactée.',
    ],
  },
  NGC2024: {
    source: {
      name: 'NASA · Hubble',
      url: 'https://science.nasa.gov/missions/hubble/hubble-spots-swirls-of-dust-in-the-flame-nebula/',
    },
    intro: [
      '猎户腰带旁的火焰星云 NGC 2024 是一处恒星诞生地。照片里亮得像火焰的背景是发光气体，分岔的黑影则是遮住部分星光的尘埃。红外观测还能找出埋在尘云里的幼星。',
      'The Flame Nebula, NGC 2024 by Orion’s Belt, is a stellar nursery. Glowing gas makes the bright background and foreground dust traces the dark, branching silhouette. Infrared observations reveal young stars embedded within it.',
      'Пламя, NGC 2024 у Пояса Ориона, — область рождения звёзд. Светящийся газ образует фон, а пыль рисует тёмный ветвистый силуэт. Инфракрасный свет выявляет скрытые молодые звёзды.',
      'La Flamme, NGC 2024 près de la Ceinture d’Orion, est une région de formation stellaire. Le gaz lumineux forme le fond et la poussière dessine les branches sombres. L’infrarouge révèle des étoiles enfouies.',
    ],
  },
  NGC2237: {
    source: {
      name: 'NASA · APOD',
      url: 'https://science.nasa.gov/image-article/apod-2025-february-14-a-cosmic-rose-ngc-2237-in-monoceros/',
    },
    intro: [
      'NGC 2237 指向玫瑰星云的一部分。麒麟座这朵“玫瑰”的花瓣是发光的气体，花心一带聚集着年轻的 NGC 2244 星团。团内炽热恒星的辐射与星风共同塑造了中央空腔。',
      'NGC 2237 marks part of the Rosette Nebula in Monoceros. The apparent petals are glowing gas surrounding young cluster NGC 2244. Radiation and winds from its hot stars have carved the central cavity.',
      'NGC 2237 отмечает часть туманности Розетка в Единороге. Её «лепестки» — светящийся газ вокруг молодого скопления NGC 2244. Излучение и ветры горячих звёзд выдули центральную полость.',
      'NGC 2237 désigne une partie de la Rosette dans la Licorne. Les pétales sont du gaz lumineux entourant le jeune amas NGC 2244. Vents et rayonnement de ses étoiles chaudes ont creusé la cavité centrale.',
    ],
  },
  NGC2264: {
    source: {
      name: 'NASA · Chandra',
      url: 'https://www.nasa.gov/image-article/hang-a-shining-star-upon-the-highest-bough/',
    },
    intro: [
      'NGC 2264 包含麒麟座的圣诞树星团。年轻恒星散布在仍能形成恒星的气体与尘埃中，亮星的排列让人联想到一棵树。钱德拉捕捉到的 X 射线还能找出一些特别活跃的幼星。',
      'NGC 2264 includes the Christmas Tree Cluster in Monoceros. Young stars still share the field with their natal gas and dust, and brighter members suggest a tree. X-rays observed by Chandra pick out active young stars.',
      'В NGC 2264 входит скопление Рождественская Ёлка в Единороге. Молодые звёзды ещё окружены газом и пылью, а яркие члены напоминают дерево. Рентгеновские данные «Чандры» выявляют активные молодые звёзды.',
      'NGC 2264 comprend l’amas de l’Arbre de Noël dans la Licorne. Les jeunes étoiles se mêlent encore au gaz et à la poussière, et les plus brillantes évoquent un sapin. Chandra décèle en rayons X des étoiles jeunes actives.',
    ],
  },
  NGC3372: {
    source: caldwell(92),
    intro: [
      '船底座星云 NGC 3372 是南天广阔的恒星形成区，其中包括著名的海山二。大质量恒星照亮云气，也用星风和辐射侵蚀云壁，所以同一大片星云里既有炽亮空腔，也有暗黑的尘柱。',
      'The Carina Nebula, NGC 3372, is a sprawling southern stellar nursery containing Eta Carinae. Massive stars light up the gas and erode it with winds and radiation, creating bright cavities and dark pillars across the same complex.',
      'Туманность Киля NGC 3372 — обширная южная область звездообразования со звездой эта Киля. Массивные звёзды освещают и разрушают облака излучением и ветром, оставляя яркие полости и тёмные столпы.',
      'La nébuleuse de la Carène, NGC 3372, est une vaste pouponnière australe contenant Êta Carinae. Vents et rayonnement des étoiles massives y sculptent des cavités brillantes et des colonnes sombres.',
    ],
  },
  NGC5128: {
    source: caldwell(77),
    intro: [
      '半人马座 A 是一座活跃星系。暗尘带横过圆润明亮的星系本体，这是它最容易认出的特征。无线电等波段还能追踪中央黑洞附近喷出的物质，延伸到可见星光以外。',
      'Centaurus A is an active galaxy. A dark dust lane across its rounded bright body makes it easy to recognise. Radio and other observations trace material jetting from near its central black hole beyond the visible starlight.',
      'Центавр A — активная галактика. Тёмная полоса пересекает светлое округлое тело. Радионаблюдения и другие диапазоны выявляют струи из окрестностей центральной чёрной дыры далеко за видимыми звёздами.',
      'Centaurus A est une galaxie active reconnaissable à la poussière sombre qui barre son corps lumineux. La radio et d’autres domaines suivent au-delà des étoiles visibles des jets issus du voisinage du trou noir central.',
    ],
  },
  NGC5139: {
    source: caldwell(80),
    intro: [
      '半人马座 ω 保留了一个像恒星的名字，望远镜却把南天这个亮斑分解为数量以百万计的恒星。它是银河系最大的球状星团之一，而且里面的恒星并非全在同一时期形成。',
      'Omega Centauri retains a star-like name, but telescopes resolve this southern patch into millions of stars. One of our Galaxy’s largest globular clusters, it holds populations that did not all form at the same time.',
      'Омега Центавра носит звёздное имя, но телескоп разделяет южное пятно на миллионы звёзд. В одном из крупнейших шаровых скоплений Галактики представлены поколения разного возраста.',
      'Oméga du Centaure porte un nom d’étoile mais le télescope y distingue des millions d’étoiles. Cet immense amas globulaire de la Voie lactée contient des populations formées à différentes époques.',
    ],
  },
  NGC6543: {
    source: caldwell(6),
    intro: [
      '猫眼星云 NGC 6543 是天龙座的一处行星状星云。中央恒星在晚年把物质抛向周围，形成相互套叠的壳层和细丝，高分辨率照片才让这只“猫眼”的复杂层次显现出来。',
      'The Cat’s Eye, NGC 6543 in Draco, is a planetary nebula. Late in life its central star ejected gas into surrounding space. High-resolution images reveal nested shells and filaments within the familiar eye-shaped glow.',
      'Кошачий Глаз NGC 6543 в Драконе — планетарная туманность. Стареющая центральная звезда выбросила газ в пространство. На подробных снимках в ярком «глазу» видны вложенные оболочки и нити.',
      'L’Œil de Chat, NGC 6543 dans le Dragon, est une nébuleuse planétaire. L’étoile centrale vieillissante a éjecté du gaz. Les vues détaillées révèlent plusieurs enveloppes emboîtées et des filaments.',
    ],
  },
  NGC6960: {
    source: caldwell(34),
    intro: [
      'NGC 6960 是天鹅座面纱星云的西侧弧段。大质量恒星爆发后，向外传播的激波扫过周围气体，留下细丝状的辉光。把视场拉宽，便能对照同一圈遗迹东侧的 NGC 6992。',
      'NGC 6960 traces the western arc of the Veil Nebula in Cygnus. A shock from an exploded star swept into surrounding gas and left luminous threads. A wide field places it opposite NGC 6992 on the same remnant.',
      'NGC 6960 — западная дуга Вуали в Лебеде. Ударная волна взрыва звезды прошла через газ и оставила светящиеся нити. В широком поле напротив находится NGC 6992 в той же оболочке.',
      'NGC 6960 trace l’arc occidental des Dentelles du Cygne. L’onde de choc d’une étoile explosée a balayé le gaz, créant des filaments lumineux. En champ large, NGC 6992 lui fait face dans le même vestige.',
    ],
  },
  NGC6992: {
    source: caldwell(33),
    intro: [
      'NGC 6992 是面纱星云东侧的亮弧。它是同一次古老超新星爆发留下的大片气壳的一部分。沿弧线追踪会看见许多细丝，这些明亮边缘标出激波遇见周围物质的位置。',
      'NGC 6992 forms a bright eastern arc of the Veil. It belongs to the same large shell left by an ancient supernova. Many luminous threads along the arc mark places where the blast encountered surrounding material.',
      'NGC 6992 образует яркую восточную дугу Вуали. Это часть большой оболочки древней сверхновой. Светящиеся нити вдоль дуги отмечают места встречи ударной волны с окружающим газом.',
      'NGC 6992 forme un arc brillant à l’est des Dentelles. Il appartient à la vaste enveloppe d’une ancienne supernova. Ses nombreux filaments signalent la rencontre de l’onde de choc et du gaz ambiant.',
    ],
  },
  NGC7000: {
    source: caldwell(20),
    intro: [
      '北美洲星云 NGC 7000 是天鹅座的一片发光气体。亮云和前景尘埃碰巧勾出像北美洲的轮廓，最像墨西哥湾的暗缺口来自遮光的尘云。认出这个形状需要保留足够宽的视场。',
      'The North America Nebula, NGC 7000 in Cygnus, is glowing gas. Its combination with dust in front traces a continental outline. The dark notch resembling the Gulf of Mexico is absorption by dust, best seen in the context of a wide field.',
      'Северная Америка NGC 7000 в Лебеде — светящийся газ. Пыль перед ним рисует контур материка и тёмную выемку, похожую на Мексиканский залив. Для узнавания всего рисунка нужно широкое поле.',
      'La nébuleuse Amérique du Nord, NGC 7000 dans le Cygne, est du gaz lumineux. La poussière au premier plan dessine le continent et l’échancrure évoquant le golfe du Mexique, mieux lisibles en champ large.',
    ],
  },
  NGC7009: {
    source: caldwell(55),
    intro: [
      'NGC 7009 是宝瓶座的土星星云。两端伸出的气体结构让早期望远镜中的轮廓像带环的土星。真正发光的是一颗晚年恒星抛出的外层，裸露的炽热星核仍在照亮这团气体。',
      'NGC 7009, the Saturn Nebula in Aquarius, owes its name to extensions at either end that recalled Saturn’s rings in early telescopes. Gas shed by an ageing star glows around the exposed hot core.',
      'NGC 7009, туманность Сатурн в Водолее, названа по двум выступам, напоминавшим кольца Сатурна в старых телескопах. Светится газ, выброшенный старой звездой и освещённый её горячим ядром.',
      'NGC 7009, la nébuleuse Saturne du Verseau, évoquait la planète à anneaux par ses extensions latérales. Le gaz rejeté par une étoile en fin de vie brille sous le rayonnement de son cœur chaud.',
    ],
  },
  NGC7293: {
    source: caldwell(63),
    intro: [
      '螺旋星云 NGC 7293 位于宝瓶座，是离我们较近的行星状星云。中央恒星抛出的气体在天空中展开成相当大的环状轮廓。环里还挤着许多像微型彗星的致密结块，细尾大致背离中心。',
      'The Helix Nebula, NGC 7293 in Aquarius, is a nearby planetary nebula. Gas from the central star spreads across a large apparent ring. Within it lie numerous dense, comet-shaped knots with tails pointing away from the centre.',
      'Улитка NGC 7293 в Водолее — близкая планетарная туманность. Газ центральной звезды образует большое видимое кольцо. В нём много плотных кометообразных узелков с хвостами, направленными от центра.',
      'L’Hélice, NGC 7293 dans le Verseau, est une nébuleuse planétaire proche. Le gaz éjecté dessine un grand anneau apparent, parsemé de nœuds denses en forme de comète dont les queues s’éloignent du centre.',
    ],
  },
};

export const deepSkyStories = {
  M1: [
    '蟹状星云是金牛座里一颗恒星爆发后留下的遗迹。1054 年，中国天文学家在这里记下了一颗白天也能看见的“客星”。今天，爆发抛出的气体织成细丝，中心留下的中子星飞快自转，为星云内部的辉光供能。',
    'The Crab Nebula in Taurus is the debris of a stellar explosion. In 1054 Chinese astronomers saw a guest star there that was visible even by day. Today the ejected gas forms a web of filaments around a glow powered by the rapidly spinning neutron star left at its heart.',
    'Крабовидная туманность в Тельце — остаток взорвавшейся звезды. В 1054 году китайские астрономы увидели здесь звезду-гостью даже днём. Теперь выброшенный газ образует сеть волокон, а свечение внутри поддерживает оставшаяся в центре быстро вращающаяся нейтронная звезда.',
    'La nébuleuse du Crabe, dans le Taureau, est le vestige d’une étoile qui a explosé. En 1054, des astronomes chinois y virent une étoile invitée même en plein jour. Aujourd’hui, le gaz éjecté forme des filaments autour d’une lueur alimentée par l’étoile à neutrons en rotation rapide laissée au centre.',
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
