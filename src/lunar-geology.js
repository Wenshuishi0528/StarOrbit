// Original-poster identity and separately registered educational globe texture.
const text = (zh, en, ru, fr) => ({ zh, en, ru, fr });
export const LUNAR_GEOLOGY = {
  id: 'igcas-global-geologic-map-2022-v1',
  title: text(
    '中国科学院全月地质图',
    'CAS global geologic map of the Moon',
    'Геологическая карта Луны КАН',
    'Carte géologique lunaire de la CAS'
  ),
  edition: text(
    '2022 年公开预校样 · 原比例尺 1∶250 万',
    '2022 public pre-proofs · Original scale 1:2,500,000',
    'Открытая предварительная версия 2022 г. · Исходный масштаб 1:2 500 000',
    'Version publique avant épreuves, 2022 · Échelle originale 1:2 500 000'
  ),
  credit:
    'Jinzhu Ji, Dijun Guo, Jianzhong Liu et al. · Institute of Geochemistry, Chinese Academy of Sciences and collaborating institutions · 2022',
  doi: '10.12176/03.99.02797',
  sourceUrl: 'https://www.scidb.cn/en/detail?dataSetId=972277454573928448',
  articleUrl: 'https://doi.org/10.1016/j.scib.2022.05.021',
  atlas2024Url:
    'https://english.cas.cn/newsroom/news--archives/2024/headlines/202405/t20240511_1129400.shtml',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  projection: 'Mollweide / composite poster',
  globeTexture: true,
  georeferencedRaster: false,
  derivedGeoreferencedRaster: true,
  globeAsset: 'assets/moon/geology/globe.webp',
  registrationAsset: 'assets/moon/geology/registration.json',
  globeWidth: 4096,
  globeHeight: 2048,
  globeNoData: text(
    '灰色区域为原图极尖或边框处未可靠配准的区域；不推测地质填色。',
    'Grey areas mark the polar pinch or map outline excluded from reliable registration; no geology is inferred.',
    'Серые области — исключённые полюса и край карты; геология не восстанавливается по догадке.',
    'Le gris indique les pôles et bords exclus du recalage fiable ; aucune géologie n’est inventée.'
  ),
  globeMethod: text(
    '中央摩尔威德图经图框及经纬网配准后重投影为 4K 经纬贴图；保留原注记和水印。适合科普浏览，不用于地质测量。',
    'The central Mollweide map is registered against its outline and graticule, then resampled to a 4K equirectangular texture. Original labels and watermarks remain. For education, not geological measurement.',
    'Центральная карта Мольвейде привязана по рамке и сетке и переведена в текстуру 4K. Подписи и водяные знаки сохранены. Для обучения, не для измерений.',
    'La carte de Mollweide est recalée par son contour et son graticule, puis rééchantillonnée en texture équirectangulaire 4K. Annotations et filigranes conservés. Usage pédagogique, pas métrologique.'
  ),
  originalWidth: 29999,
  originalHeight: 12978,
};

export const GEOLOGY_VIEWS = [
  {
    id: 'poster',
    asset: 'assets/moon/geology/poster.webp',
    width: 8192,
    height: 3544,
    title: text('完整地质图', 'Complete map', 'Полная карта', 'Carte complète'),
    description: text(
      '完整保留中央全月图、极区图、岩性与构造插图、图例、年代尺及署名；放大后可拖动或滚动查看。',
      'The complete poster retains the global and polar maps, lithologic and tectonic insets, legend, chronology and credits. Zoom, then drag or scroll to explore.',
      'Сохранены глобальная и полярные карты, врезки пород и структур, легенда, шкала времени и авторство. Увеличьте и перемещайте карту.',
      'Affiche complète avec cartes globale et polaires, encarts lithologique et tectonique, légende, chronologie et crédits. Agrandissez puis faites glisser ou défiler.'
    ),
  },
  {
    id: 'overview',
    asset: 'assets/moon/geology/overview.webp',
    width: 2400,
    height: 1038,
    title: text('轻量总览', 'Quick overview', 'Обзор', 'Vue d’ensemble'),
    description: text(
      '完整原图的轻量缩略版，适合先看整体分布；细读符号请切换高清图例。',
      'A compact overview of the entire original. Use the detailed legend to read map symbols.',
      'Облегчённый обзор оригинала. Для чтения символов выберите подробную легенду.',
      'Vue allégée de l’original complet. Consultez la légende détaillée pour lire les symboles.'
    ),
  },
  {
    id: 'legend',
    asset: 'assets/moon/geology/legend.webp',
    width: 2000,
    height: 2615,
    title: text('高清图例', 'Detailed legend', 'Подробная легенда', 'Légende détaillée'),
    description: text(
      '原图右侧图例的高清裁区。颜色、纹理和线型共同表达地质单元；同一时代的坑壁、坑底、喷出物仍采用不同图式。',
      'A detailed crop of the original right-hand legend. Colours, patterns and line styles encode geologic units; crater walls, floors and ejecta of the same age have distinct symbols.',
      'Фрагмент исходной легенды справа. Цвет, штриховка и линии обозначают геологические единицы; стенки, дно и выбросы одного возраста имеют разные знаки.',
      'Détail de la légende originale à droite. Couleurs, motifs et traits décrivent les unités ; parois, fonds et éjectas de même âge ont des symboles distincts.'
    ),
  },
  {
    id: 'timescale',
    asset: 'assets/moon/geology/timescale.webp',
    width: 1905,
    height: 1687,
    title: text('地质年代尺', 'Geologic time scale', 'Геологическая шкала', 'Échelle géologique'),
    description: text(
      '原图“三宙六纪”年代尺的高清裁区。Ga 表示距今十亿年；数值保留 2022 版本，不与后续修订的年界混用。',
      'A detailed crop of this map’s three-eon, six-period chronology. Ga means billions of years ago. Boundaries are those of the 2022 edition, not later revisions.',
      'Шкала этой карты: три эона и шесть периодов. Ga — миллиарды лет назад. Границы сохранены по версии 2022 г., без смешения с последующими пересмотрами.',
      'Chronologie de cette carte : trois éons et six périodes. Ga signifie milliards d’années avant le présent. Les limites restent celles de 2022, sans mélange avec les révisions ultérieures.'
    ),
  },
];

export const GEOLOGY_GUIDE = [
  {
    id: 'meaning',
    title: text(
      '这是一张什么图？',
      'What the map shows',
      'Что показывает карта',
      'Ce que montre la carte'
    ),
    body: text(
      '它综合表达岩石类型、撞击物质、构造和形成时代。彩色是地质分类，不是月球真实颜色，也不是某种元素的浓度热图。',
      'It combines rock types, impact materials, structures and formation ages. Colours are geologic categories, not the Moon’s natural colours or an elemental concentration heatmap.',
      'Карта объединяет типы пород, ударные отложения, структуры и возраст. Цвета обозначают категории, а не естественную окраску или концентрацию элементов.',
      'Elle réunit types de roches, matériaux d’impact, structures et âges. Les couleurs représentent des catégories géologiques, pas des couleurs naturelles ni des concentrations élémentaires.'
    ),
  },
  {
    id: 'impacts',
    title: text(
      '沿撞击记录读历史',
      'Read the impact history',
      'История ударов',
      'Lire l’histoire des impacts'
    ),
    body: text(
      '左侧图例列出不同时代的撞击坑物质与盆地建造。先看符号和地层代号，再比较喷出物、坑壁、坑底与中央峰，不能只凭颜色判断年代。',
      'The left legend lists crater materials and basin formations by age. Read the symbols and unit codes, then compare ejecta, walls, floors and central peaks; colour alone does not identify age.',
      'Слева перечислены материалы кратеров и бассейнов по возрасту. Сопоставляйте обозначения выбросов, стенок, дна и пиков: одного цвета для определения возраста недостаточно.',
      'À gauche, les matériaux des cratères et les formations des bassins sont classés par âge. Comparez codes, éjectas, parois, fonds et pics : la couleur seule ne donne pas l’âge.'
    ),
  },
  {
    id: 'rocks',
    title: text(
      '蓝色月海与特殊岩性',
      'Maria and distinctive rocks',
      'Моря и особые породы',
      'Mers et roches particulières'
    ),
    body: text(
      '图例中的蓝色系列区分不同钛类别的月海玄武岩；其他颜色和符号标记 KREEP、斜长岩及特殊露头。这里没有提供可直接读取的元素含量数值。',
      'Blue legend swatches distinguish titanium classes of mare basalt; other colours and symbols mark KREEP, anorthosite and special outcrops. The viewer does not provide numerical elemental abundances.',
      'Синие образцы различают категории базальтов морей по титану; другие знаки отмечают KREEP, анортозиты и особые выходы. Численные содержания элементов здесь не определяются.',
      'Les bleus distinguent les classes de titane des basaltes des mers ; d’autres signes indiquent KREEP, anorthosites et affleurements particuliers. Aucune teneur élémentaire numérique n’est fournie.'
    ),
  },
  {
    id: 'projection',
    title: text(
      '按原投影阅读',
      'Read the original projection',
      'Исходная проекция',
      'Lire la projection originale'
    ),
    body: text(
      '中央全月图采用摩尔威德投影，极区与插图是独立图幅。本视图保留原版布局，未把整张海报贴到球面；2024 年出版图集是后续成果，另附官方介绍。',
      'The central global map uses the Mollweide projection; polar maps and insets are separate panels. This viewer preserves the layout rather than wrapping the poster around a globe. The later 2024 atlas is linked separately.',
      'Центральная карта имеет проекцию Мольвейде; полярные карты и врезки отдельны. Сохранена исходная компоновка без натягивания плаката на сферу. Атлас 2024 г. указан отдельно.',
      'La carte centrale est en projection de Mollweide ; pôles et encarts sont séparés. La mise en page est conservée sans plaquer l’affiche sur une sphère. L’atlas de 2024 est lié séparément.'
    ),
  },
];

export function geologyText(value, language = 'zh') {
  const key = String(language).toLowerCase().split('-')[0];
  return value?.[key] ?? value?.en ?? value?.zh ?? '';
}

export function geologyView(id) {
  return GEOLOGY_VIEWS.find((view) => view.id === id) || GEOLOGY_VIEWS[0];
}
