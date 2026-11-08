// Official feature centers checked against the IAU/USGS Gazetteer on 2026-11-08.
// Latitude: north positive; longitude: east positive, -180…180 degrees.
// Values are the current first coordinate record displayed by each linked page;
// source precision is preserved. Diameter is a catalogue size, not a circular
// boundary or a resolved-detail guarantee. On our spherical Moon, the listed
// planetographic latitude is used as spherical latitude (no ellipsoid conversion).
// Localized names and observing prompts are editorial; the English name retains
// the Gazetteer spelling. All positions label real surface points in every mode.
export const LUNAR_FEATURES = [
  {
    'id': 'tranquillitatis',
    'kind': 'mare',
    'latitude': 8.35,
    'longitude': 30.83,
    'diameterKm': 875.75,
    'name': {
      'zh': '静海',
      'en': 'Mare Tranquillitatis',
      'fr': 'Mer de la Tranquillité',
      'ru': 'Море Спокойствия',
    },
    'hint': {
      'zh': '对比静海与北侧澄海的深浅色调。',
      'en': 'Compare its dark tones with Mare Serenitatis to the north.',
      'fr': 'Comparez ses teintes sombres à celles de la mer de la Sérénité au nord.',
      'ru': 'Сравните его тёмные оттенки с Морем Ясности к северу.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3691',
    },
  },
  {
    'id': 'serenitatis',
    'kind': 'mare',
    'latitude': 27.29,
    'longitude': 18.36,
    'diameterKm': 674.28,
    'name': {
      'zh': '澄海',
      'en': 'Mare Serenitatis',
      'fr': 'Mer de la Sérénité',
      'ru': 'Море Ясности',
    },
    'hint': {
      'zh': '沿着澄海边缘寻找亮色高地与暗色月海的分界。',
      'en': 'Trace the boundary between the dark mare and its bright surrounding highlands.',
      'fr': 'Suivez la limite entre la mer sombre et les hautes terres claires qui l’entourent.',
      'ru': 'Проследите границу между тёмным морем и окружающими светлыми возвышенностями.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3686',
    },
  },
  {
    'id': 'imbrium',
    'kind': 'mare',
    'latitude': 34.72,
    'longitude': -14.91,
    'diameterKm': 1145.53,
    'name': {
      'zh': '雨海',
      'en': 'Mare Imbrium',
      'fr': 'Mer des Pluies',
      'ru': 'Море Дождей',
    },
    'hint': {
      'zh': '先找到大片暗色雨海，再观察它周围的高地轮廓。',
      'en': 'Find the broad dark mare, then examine the outline of its surrounding highlands.',
      'fr': 'Repérez cette vaste mer sombre, puis examinez le contour des hautes terres voisines.',
      'ru': 'Найдите обширное тёмное море, затем рассмотрите очертания окружающих возвышенностей.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3678',
    },
  },
  {
    'id': 'crisium',
    'kind': 'mare',
    'latitude': 16.18,
    'longitude': 59.1,
    'diameterKm': 555.92,
    'name': {
      'zh': '危海',
      'en': 'Mare Crisium',
      'fr': 'Mer des Crises',
      'ru': 'Море Кризисов',
    },
    'hint': {
      'zh': '比较不同日期危海离月缘的距离，观察天平动。',
      'en': 'Compare its distance from the lunar limb on different dates to explore libration.',
      'fr': 'Comparez sa distance au limbe selon la date pour observer la libration.',
      'ru': 'Сравните расстояние до края лунного диска в разные даты, чтобы увидеть либрацию.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3671',
    },
  },
  {
    'id': 'fecunditatis',
    'kind': 'mare',
    'latitude': -7.83,
    'longitude': 53.67,
    'diameterKm': 840.35,
    'name': {
      'zh': '丰富海',
      'en': 'Mare Fecunditatis',
      'fr': 'Mer de la Fécondité',
      'ru': 'Море Изобилия',
    },
    'hint': {
      'zh': '沿静海东南侧寻找丰富海，比较两片暗色平原。',
      'en': 'Find this mare southeast of Mare Tranquillitatis and compare the two dark plains.',
      'fr': 'Cherchez cette mer au sud-est de la mer de la Tranquillité et comparez les deux plaines sombres.',
      'ru': 'Найдите это море к юго-востоку от Моря Спокойствия и сравните две тёмные равнины.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3673',
    },
  },
  {
    'id': 'nectaris',
    'kind': 'mare',
    'latitude': -15.19,
    'longitude': 34.6,
    'diameterKm': 339.39,
    'name': {
      'zh': '酒海',
      'en': 'Mare Nectaris',
      'fr': 'Mer du Nectar',
      'ru': 'Море Нектара',
    },
    'hint': {
      'zh': '从静海南侧找到较小的酒海，观察周围明暗交界。',
      'en': 'Find this smaller mare south of Mare Tranquillitatis and examine the surrounding contrast.',
      'fr': 'Repérez cette petite mer au sud de la mer de la Tranquillité et observez les contrastes autour d’elle.',
      'ru': 'Найдите это небольшое море к югу от Моря Спокойствия и рассмотрите контраст его окружения.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3683',
    },
  },
  {
    'id': 'nubium',
    'kind': 'mare',
    'latitude': -20.59,
    'longitude': -17.29,
    'diameterKm': 714.5,
    'name': {
      'zh': '云海',
      'en': 'Mare Nubium',
      'fr': 'Mer des Nuées',
      'ru': 'Море Облаков',
    },
    'hint': {
      'zh': '在月面西南部辨认云海不规则的暗色轮廓。',
      'en': 'Identify the irregular dark outline of this mare in the lunar southwest.',
      'fr': 'Identifiez le contour sombre et irrégulier de cette mer dans le sud-ouest lunaire.',
      'ru': 'Найдите неровный тёмный контур этого моря на юго-западе Луны.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3684',
    },
  },
  {
    'id': 'humorum',
    'kind': 'mare',
    'latitude': -24.48,
    'longitude': -38.57,
    'diameterKm': 419.67,
    'name': {
      'zh': '湿海',
      'en': 'Mare Humorum',
      'fr': 'Mer des Humeurs',
      'ru': 'Море Влажности',
    },
    'hint': {
      'zh': '向云海西侧寻找湿海，比较两片月海的形状。',
      'en': 'Look west of Mare Nubium and compare the shapes of the two maria.',
      'fr': 'Cherchez à l’ouest de la mer des Nuées et comparez la forme des deux mers.',
      'ru': 'Посмотрите к западу от Моря Облаков и сравните формы двух морей.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3677',
    },
  },
  {
    'id': 'frigoris',
    'kind': 'mare',
    'latitude': 56.0,
    'longitude': 1.4,
    'diameterKm': 1596.0,
    'name': {
      'zh': '冷海',
      'en': 'Mare Frigoris',
      'fr': 'Mer du Froid',
      'ru': 'Море Холода',
    },
    'hint': {
      'zh': '沿月球北部寻找细长的暗色冷海。',
      'en': 'Trace this elongated dark mare across the lunar north.',
      'fr': 'Suivez cette longue mer sombre dans le nord lunaire.',
      'ru': 'Проследите вытянутое тёмное море на севере Луны.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3674',
    },
  },
  {
    'id': 'moscoviense',
    'kind': 'mare',
    'latitude': 27.28,
    'longitude': 148.12,
    'diameterKm': 275.57,
    'name': {
      'zh': '莫斯科海',
      'en': 'Mare Moscoviense',
      'fr': 'Mer de Moscovie',
      'ru': 'Море Москвы',
    },
    'hint': {
      'zh': '切换自由浏览，到月背寻找这片暗色月海。',
      'en': 'Switch to free exploration and find this dark mare on the far side.',
      'fr': 'Passez en exploration libre pour trouver cette mer sombre sur la face cachée.',
      'ru': 'Перейдите к свободному обзору и найдите это тёмное море на обратной стороне.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/3682',
    },
  },
  {
    'id': 'tycho',
    'kind': 'crater',
    'latitude': -43.3,
    'longitude': -11.22,
    'diameterKm': 85.29,
    'name': {
      'zh': '第谷环形山',
      'en': 'Tycho',
      'fr': 'Tycho',
      'ru': 'Тихо',
    },
    'hint': {
      'zh': '在接近满月时寻找第谷周围的明亮辐射纹。',
      'en': 'Near full Moon, look for the bright rays surrounding Tycho.',
      'fr': 'Près de la pleine Lune, recherchez les traînées claires autour de Tycho.',
      'ru': 'Вблизи полнолуния ищите светлые лучи вокруг Тихо.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/6163',
    },
  },
  {
    'id': 'plato',
    'kind': 'crater',
    'latitude': 51.62,
    'longitude': -9.38,
    'diameterKm': 100.68,
    'name': {
      'zh': '柏拉图环形山',
      'en': 'Plato',
      'fr': 'Platon',
      'ru': 'Платон',
    },
    'hint': {
      'zh': '在雨海北缘寻找柏拉图的暗色坑底。',
      'en': 'Look for Plato’s dark floor near the northern edge of Mare Imbrium.',
      'fr': 'Cherchez le fond sombre de Platon près du bord nord de la mer des Pluies.',
      'ru': 'Ищите тёмное дно Платона у северного края Моря Дождей.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/4757',
    },
  },
  {
    'id': 'copernicus',
    'kind': 'crater',
    'latitude': 9.62,
    'longitude': -20.08,
    'diameterKm': 96.07,
    'name': {
      'zh': '哥白尼环形山',
      'en': 'Copernicus',
      'fr': 'Copernic',
      'ru': 'Коперник',
    },
    'hint': {
      'zh': '比较低角度日照下的坑缘与接近满月时的辐射纹。',
      'en': 'Compare its rim under low sunlight with its rays near full Moon.',
      'fr': 'Comparez son rempart sous un Soleil bas à ses traînées claires près de la pleine Lune.',
      'ru': 'Сравните вал при низком Солнце с лучами вблизи полнолуния.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/1296',
    },
  },
  {
    'id': 'aristarchus',
    'kind': 'crater',
    'latitude': 23.73,
    'longitude': -47.49,
    'diameterKm': 39.99,
    'name': {
      'zh': '阿里斯塔克环形山',
      'en': 'Aristarchus',
      'fr': 'Aristarque',
      'ru': 'Аристарх',
    },
    'hint': {
      'zh': '寻找阿里斯塔克明亮的坑区与周围暗色平原的反差。',
      'en': 'Look for the contrast between this bright crater and the surrounding darker plains.',
      'fr': 'Cherchez le contraste entre ce cratère clair et les plaines plus sombres qui l’entourent.',
      'ru': 'Найдите контраст между светлым кратером и окружающими более тёмными равнинами.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/380',
    },
  },
  {
    'id': 'clavius',
    'kind': 'crater',
    'latitude': -58.62,
    'longitude': -14.73,
    'diameterKm': 230.77,
    'name': {
      'zh': '克拉维环形山',
      'en': 'Clavius',
      'fr': 'Clavius',
      'ru': 'Клавий',
    },
    'hint': {
      'zh': '在月面南部找到大坑轮廓，并比较不同日照角度。',
      'en': 'Find the broad crater outline in the lunar south and compare different sunlight angles.',
      'fr': 'Repérez ce grand cratère dans le sud lunaire et comparez différents angles d’éclairage.',
      'ru': 'Найдите контур большого кратера на юге Луны и сравните разные углы освещения.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/1236',
    },
  },
  {
    'id': 'tsiolkovskiy',
    'kind': 'crater',
    'latitude': -20.38,
    'longitude': 128.97,
    'diameterKm': 184.39,
    'name': {
      'zh': '齐奥尔科夫斯基环形山',
      'en': 'Tsiolkovskiy',
      'fr': 'Tsiolkovski',
      'ru': 'Циолковский',
    },
    'hint': {
      'zh': '切换自由浏览，在月背寻找明亮坑缘围绕的暗色坑底。',
      'en': 'In free exploration, find its dark floor surrounded by a bright rim on the far side.',
      'fr': 'En exploration libre, trouvez son fond sombre entouré d’un rempart clair sur la face cachée.',
      'ru': 'В свободном обзоре найдите на обратной стороне тёмное дно, окружённое светлым валом.',
    },
    'source': {
      'label': 'IAU / USGS Gazetteer of Planetary Nomenclature',
      'url': 'https://planetarynames.wr.usgs.gov/Feature/6108',
    },
  },
];

export function lunarFeature(id) {
  return LUNAR_FEATURES.find((feature) => feature.id === id) ?? null;
}

export function lunarFeatureText(feature, language = 'zh') {
  if (!feature) return { name: '', hint: '' };
  return {
    name: feature.name[language] ?? feature.name.en,
    hint: feature.hint[language] ?? feature.hint.en,
  };
}
