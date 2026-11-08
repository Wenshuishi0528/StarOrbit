import { LUNAR_PLACES, searchLunarPlaces } from './lunar-place-catalog.js';
import { lunarPlaceName, validLunarPlace } from './lunar-place-layout.js';

const COPY = {
  zh: {
    title: '月面地名与着陆点',
    search: '搜索正式地名、任务或别名',
    all: '全部',
    feature: '地形地名',
    landing: '着陆任务',
    crater: '环形山',
    satellite: '附属地名',
    mare: '月海与月湾',
    mountain: '山脉与山峰',
    other: '其他地形',
    places: '显示月面地名',
    landings: '显示着陆标记',
    density: '地名密度',
    maximum: '全部 · 允许重叠',
    count: '找到 {count} 项 · 显示 {shown} 项',
    more: '显示更多',
    none: '没有匹配结果',
    unknown: '位置未确定 · 仅任务资料',
    success: '软着陆成功',
    partial: '异常软着陆',
    failed: '软着陆失败／撞击',
    legend: '中国：红色五角星；其他：菱形；失败：空心并加×；异常软着陆：虚线圈。',
    note: '正式地名采用 IAU 原名；小地名随放大显示。坐标未知的任务不放置标记。',
    selected: '已选择',
  },
  en: {
    title: 'Lunar names & landings',
    search: 'Search official name, mission or alias',
    all: 'All',
    feature: 'Surface features',
    landing: 'Landing missions',
    crater: 'Craters',
    satellite: 'Satellite names',
    mare: 'Maria & bays',
    mountain: 'Mountains',
    other: 'Other features',
    places: 'Show feature names',
    landings: 'Show landing markers',
    density: 'Name density',
    maximum: 'All · overlaps allowed',
    count: '{count} matches · {shown} shown',
    more: 'Show more',
    none: 'No matching places',
    unknown: 'Location unknown · mission details only',
    success: 'Successful soft landing',
    partial: 'Off-nominal soft landing',
    failed: 'Failed soft landing / impact',
    legend:
      'China: red stars; others: diamonds; failure: hollow with ×; off-nominal soft landing: dashed ring.',
    note: 'Official feature names retain IAU spelling. Zoom in for smaller names. Missions with unknown coordinates have no map marker.',
    selected: 'Selected',
  },
  fr: {
    title: 'Noms lunaires et alunissages',
    search: 'Nom officiel, mission ou autre nom',
    all: 'Tous',
    feature: 'Formations de surface',
    landing: 'Missions d’alunissage',
    crater: 'Cratères',
    satellite: 'Noms satellites',
    mare: 'Mers et baies',
    mountain: 'Montagnes',
    other: 'Autres formations',
    places: 'Afficher les noms',
    landings: 'Afficher les alunissages',
    density: 'Densité des noms',
    maximum: 'Tous · chevauchements permis',
    count: '{count} résultats · {shown} affichés',
    more: 'Afficher plus',
    none: 'Aucun résultat',
    unknown: 'Position inconnue · fiche de mission seulement',
    success: 'Alunissage réussi',
    partial: 'Alunissage anormal',
    failed: 'Échec d’alunissage / impact',
    legend:
      'Chine : étoiles rouges ; autres : losanges ; échec : contour avec × ; alunissage anormal : cercle pointillé.',
    note: 'Les noms officiels gardent leur graphie UAI. Zoomez pour les petits détails. Les missions sans coordonnées n’ont pas de repère.',
    selected: 'Sélection',
  },
  ru: {
    title: 'Лунные названия и посадки',
    search: 'Название, миссия или другое имя',
    all: 'Все',
    feature: 'Детали поверхности',
    landing: 'Посадочные миссии',
    crater: 'Кратеры',
    satellite: 'Сателлитные названия',
    mare: 'Моря и заливы',
    mountain: 'Горы',
    other: 'Другие детали',
    places: 'Показать названия',
    landings: 'Показать места посадок',
    density: 'Плотность названий',
    maximum: 'Все · с перекрытием',
    count: 'Найдено: {count} · показано: {shown}',
    more: 'Показать ещё',
    none: 'Совпадений нет',
    unknown: 'Координаты неизвестны · только сведения о миссии',
    success: 'Успешная мягкая посадка',
    partial: 'Нештатная мягкая посадка',
    failed: 'Неудачная мягкая посадка / удар',
    legend:
      'Китай: красные звёзды; другие: ромбы; неудача: контур с ×; нештатная мягкая посадка: пунктирное кольцо.',
    note: 'Сохранены официальные названия МАС. Для мелких объектов увеличьте масштаб. Миссии без координат не отмечены на карте.',
    selected: 'Выбрано',
  },
};
const DETAILS_COPY = {
  zh: {
    accuracy: '位置可靠性',
    approximate: '估计位置（非精确落点）',
    'lro-imaged': '轨道影像已识别位置',
    unknownAccuracy: '位置未知',
    vehicles: '携带的探测器／月球车',
    notes: '来源说明',
    source: '查看原始来源',
    coordinates: '经纬度（北纬／东经为正）',
  },
  en: {
    accuracy: 'Location confidence',
    approximate: 'Approximate position, not an exact landing point',
    'lro-imaged': 'Position identified in orbital imagery',
    unknownAccuracy: 'Location unknown',
    vehicles: 'Carried vehicles / rovers',
    notes: 'Source notes',
    source: 'Open original source',
    coordinates: 'Coordinates (north / east positive)',
  },
  fr: {
    accuracy: 'Fiabilité de la position',
    approximate: 'Position estimée, pas un point précis',
    'lro-imaged': 'Position identifiée sur des images orbitales',
    unknownAccuracy: 'Position inconnue',
    vehicles: 'Véhicules / rovers transportés',
    notes: 'Notes de la source',
    source: 'Ouvrir la source',
    coordinates: 'Coordonnées (nord / est positifs)',
  },
  ru: {
    accuracy: 'Достоверность координат',
    approximate: 'Приблизительное положение, не точная точка посадки',
    'lro-imaged': 'Место установлено по орбитальным снимкам',
    unknownAccuracy: 'Координаты неизвестны',
    vehicles: 'Доставленные аппараты / луноходы',
    notes: 'Примечания источника',
    source: 'Открыть первоисточник',
    coordinates: 'Координаты (север / восток положительны)',
  },
};
for (const language of Object.keys(COPY)) Object.assign(COPY[language], DETAILS_COPY[language]);
const style = `.lunar-place-controls{display:grid;gap:9px;min-width:0}.lunar-place-controls h4{margin:0}.lunar-place-controls label{display:flex;gap:8px;align-items:center;font-size:12px}.lunar-place-controls input[type=search],.lunar-place-controls select{width:100%;box-sizing:border-box;min-width:0;background:#101c28;color:#e0e9ee;border:1px solid #344a5a;border-radius:6px;padding:8px}.lunar-place-controls input[type=checkbox]{width:auto;margin:0;flex:none}.lunar-place-controls input[type=range]{min-width:40px;flex:1}.lunar-place-controls .lp-density{flex-wrap:wrap}.lunar-place-controls output{font-size:11px;color:#a9c4d4}.lunar-place-controls .lp-results{max-height:280px;overflow:auto;display:grid;gap:4px}.lunar-place-controls .lp-result{width:100%;text-align:left;border:1px solid #243b4b;background:#0b1822;color:#dfeaf1;border-radius:6px;padding:7px 9px;cursor:pointer;display:grid;gap:3px;white-space:normal}.lunar-place-controls .lp-result:hover{border-color:#5c899e;background:#122936}.lunar-place-controls .lp-result[aria-pressed=true]{border-color:#d2ac62}.lunar-place-controls .lp-result small,.lunar-place-controls .lp-note{font-size:11px;color:#92afbf;line-height:1.5}.lunar-place-controls .lp-note{margin:0}.lunar-place-controls .lp-count{font-size:11px;color:#aac2ce}.lunar-place-controls .lp-details{display:grid;gap:6px;padding:10px;border:1px solid #385261;border-radius:6px;max-height:220px;overflow:auto;font-size:12px}.lunar-place-controls .lp-details[hidden]{display:none}.lunar-place-controls .lp-details p{margin:0;font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.lunar-place-controls .lp-details a{color:#9ed9ef}.lunar-place-controls .lp-more{padding:7px;border:1px solid #385261;background:#142634;border-radius:6px;color:#dfeaf1;cursor:pointer}`;
const fold = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’‘']/g, '')
    .replace(/[‐‑–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const GROUPS = {
  crater: ['AA'],
  satellite: ['SF'],
  mare: ['ME', 'OC', 'SI', 'LC', 'PA'],
  mountain: ['MO'],
};
export function filterLunarControlPlaces(places, query = '', kind = 'all') {
  const words = fold(query).split(' ').filter(Boolean);
  return places.filter((place) => {
    if (kind === 'landing' && place.kind !== 'landing') return false;
    if (kind === 'feature' && place.kind === 'landing') return false;
    if (GROUPS[kind] && !(place.kind !== 'landing' && GROUPS[kind].includes(place.featureType)))
      return false;
    if (
      kind === 'other' &&
      (place.kind === 'landing' || Object.values(GROUPS).flat().includes(place.featureType))
    )
      return false;
    return (
      !words.length ||
      [
        place.id,
        typeof place.name === 'string' ? place.name : Object.values(place.name || {}).join(' '),
        place.nameZh,
        ...(place.aliases || []),
        ...(place.carriedVehicles || []),
      ].some((value) => words.every((word) => fold(value).includes(word)))
    );
  });
}
export function normalizeLunarPlaceControls(input = {}) {
  return {
    placesEnabled: input.placesEnabled !== false,
    landingsEnabled: input.landingsEnabled !== false,
    density: Number.isFinite(input.density) ? Math.max(0, Math.min(1, input.density)) : 0.45,
  };
}

export function mountLunarPlaceControls(
  parent,
  {
    places = LUNAR_PLACES,
    landingSites = null,
    onSelect = () => {},
    onChange = () => {},
    language = 'zh',
    initial = {},
    ...initialValues
  } = {}
) {
  let lang = typeof language === 'function' ? language() : language;
  let state = normalizeLunarPlaceControls({ ...initialValues, ...initial }),
    selected = null,
    shown = 80,
    timer = 0,
    disposed = false;
  const catalogue = landingSites
    ? [...places.filter((p) => p.kind !== 'landing'), ...landingSites]
    : places;
  const make = (tag, parentNode, className = '') => {
    const node = document.createElement(tag);
    node.className = className;
    parentNode.append(node);
    return node;
  };
  const root = make('section', parent, 'lunar-place-controls'),
    sheet = make('style', root);
  sheet.textContent = style;
  const title = make('h4', root),
    search = make('input', root);
  search.type = 'search';
  search.autocomplete = 'off';
  search.spellcheck = false;
  const kinds = make('select', root);
  const keys = ['all', 'feature', 'landing', 'crater', 'satellite', 'mare', 'mountain', 'other'];
  for (const key of keys) {
    const option = make('option', kinds);
    option.value = key;
  }
  const check = (key) => {
    const label = make('label', root),
      input = make('input', label),
      text = make('span', label);
    input.type = 'checkbox';
    input.dataset.lunarPlace = key;
    return { input, text };
  };
  const featureCheck = check('places'),
    landingCheck = check('landings');
  const densityRow = make('label', root, 'lp-density'),
    densityLabel = make('span', densityRow),
    density = make('input', densityRow),
    densityValue = make('output', densityRow);
  density.type = 'range';
  density.min = '0';
  density.max = '1';
  density.step = '.05';
  density.dataset.lunarPlace = 'density';
  const details = make('section', root, 'lp-details');
  details.hidden = true;
  const count = make('div', root, 'lp-count'),
    results = make('div', root, 'lp-results'),
    more = make('button', root, 'lp-more');
  more.type = 'button';
  const legend = make('p', root, 'lp-note'),
    note = make('p', root, 'lp-note');
  count.setAttribute('role', 'status');
  search.dataset.lunarPlace = 'search';
  kinds.dataset.lunarPlace = 'kind';
  const t = (key) => COPY[lang]?.[key] || COPY.en[key] || key;
  const updateState = () => {
    featureCheck.input.checked = state.placesEnabled;
    landingCheck.input.checked = state.landingsEnabled;
    density.value = String(state.density);
    densityValue.textContent =
      state.density === 1 ? t('maximum') : Math.round(state.density * 100) + '%';
  };
  const renderDetails = () => {
    details.replaceChildren();
    details.hidden = !selected;
    if (!selected) return;
    make('strong', details).textContent = lunarPlaceName(selected, lang);
    const row = (label, value) => {
      if (!value) return;
      make('p', details).textContent = t(label) + ': ' + value;
    };
    if (selected.kind === 'landing')
      row(
        'accuracy',
        t(
          selected.locationAccuracy === 'unknown' || !validLunarPlace(selected)
            ? 'unknownAccuracy'
            : selected.locationAccuracy || 'approximate'
        )
      );
    row(
      'coordinates',
      validLunarPlace(selected)
        ? `${selected.latitude}°, ${selected.longitude}°`
        : t('unknownAccuracy')
    );
    row('vehicles', (selected.carriedVehicles || []).join(', '));
    const notes = [
      selected.note,
      ...(Array.isArray(selected.notes) ? selected.notes : [selected.notes]),
    ].filter(Boolean);
    row('notes', notes.join('\n'));
    const sourceUrl = selected.sourceUrl || selected.source?.url;
    if (/^https:\/\//.test(sourceUrl || '')) {
      const link = make('a', details);
      link.textContent = t('source') + ' ↗';
      link.href = sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  };
  const renderResults = () => {
    if (disposed) return;
    const raw =
      catalogue === LUNAR_PLACES ? searchLunarPlaces(search.value, { limit: Infinity }) : catalogue;
    const matches = filterLunarControlPlaces(
      raw,
      catalogue === LUNAR_PLACES ? '' : search.value,
      kinds.value || 'all'
    );
    results.replaceChildren();
    for (const place of matches.slice(0, shown)) {
      const button = make('button', results, 'lp-result');
      button.type = 'button';
      button.dataset.placeId = place.id;
      button.setAttribute(
        'aria-pressed',
        String(
          Boolean(selected?.id) && (selected.id === place.id || selected.id === place.featuredId)
        )
      );
      const name = make('span', button);
      name.textContent =
        (place.kind === 'landing' ? (place.country === 'CN' ? '★ ' : '◇ ') : '') +
        lunarPlaceName(place, lang);
      const detail = make('small', button);
      const location = validLunarPlace(place)
        ? `${place.latitude.toFixed(2)}°, ${place.longitude.toFixed(2)}°`
        : t('unknown');
      detail.textContent =
        place.kind === 'landing'
          ? [
              place.date,
              t(
                place.outcome === 'impact-failed'
                  ? 'failed'
                  : place.outcome === 'soft-partial'
                    ? 'partial'
                    : 'success'
              ),
              location,
            ]
              .filter(Boolean)
              .join(' · ')
          : [
              place.featureTypeLabel,
              Number.isFinite(place.diameterKm) ? place.diameterKm + ' km' : '',
              location,
            ]
              .filter(Boolean)
              .join(' · ');
      button.onclick = () => {
        selected = place;
        renderDetails();
        for (const child of results.children)
          child.setAttribute('aria-pressed', String(child.dataset.placeId === place.id));
        onSelect(place);
      };
    }
    count.textContent = matches.length
      ? t('count')
          .replace('{count}', matches.length.toLocaleString(lang))
          .replace('{shown}', Math.min(shown, matches.length).toLocaleString(lang))
      : t('none');
    more.hidden = shown >= matches.length;
  };
  const translate = () => {
    title.textContent = t('title');
    search.placeholder = t('search');
    search.setAttribute('aria-label', t('search'));
    kinds.setAttribute('aria-label', t('feature'));
    for (let i = 0; i < keys.length; i++) kinds.children[i].textContent = t(keys[i]);
    featureCheck.text.textContent = t('places');
    landingCheck.text.textContent = t('landings');
    densityLabel.textContent = t('density');
    density.setAttribute('aria-label', t('density'));
    more.textContent = t('more');
    legend.textContent = t('legend');
    note.textContent = t('note');
    updateState();
    renderDetails();
    renderResults();
  };
  search.oninput = () => {
    clearTimeout(timer);
    shown = 80;
    timer = setTimeout(renderResults, 100);
  };
  kinds.onchange = () => {
    shown = 80;
    renderResults();
  };
  more.onclick = () => {
    shown += 80;
    renderResults();
  };
  const changed = () => {
    state = normalizeLunarPlaceControls({
      placesEnabled: featureCheck.input.checked,
      landingsEnabled: landingCheck.input.checked,
      density: Number(density.value),
    });
    updateState();
    onChange({ ...state });
  };
  featureCheck.input.onchange = changed;
  landingCheck.input.onchange = changed;
  density.oninput = changed;
  translate();
  return {
    element: root,
    getState: () => ({ ...state }),
    setState(next) {
      state = normalizeLunarPlaceControls({ ...state, ...next });
      updateState();
    },
    setLanguage(next) {
      lang = next;
      translate();
    },
    setSelection(place) {
      selected = place;
      renderDetails();
      renderResults();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      root.remove();
    },
  };
}
