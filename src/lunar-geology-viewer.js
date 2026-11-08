import {
  LUNAR_GEOLOGY,
  GEOLOGY_VIEWS,
  GEOLOGY_GUIDE,
  geologyText,
  geologyView,
} from './lunar-geology.js';

const words = {
  zoom: ['缩放', 'Zoom', 'Масштаб', 'Zoom'],
  fit: ['适合宽度', 'Fit width', 'По ширине', 'Ajuster en largeur'],
  pixels: ['实际像素', 'Actual pixels', 'Исходные пиксели', 'Pixels réels'],
  loading: [
    '正在载入地质图…',
    'Loading the geologic map…',
    'Загрузка геологической карты…',
    'Chargement de la carte géologique…',
  ],
  failed: [
    '本地图像未能载入。可重试，或打开下方官方数据来源。',
    'The local image could not load. Retry or open the official source below.',
    'Локальное изображение не загрузилось. Повторите попытку или откройте официальный источник ниже.',
    'L’image locale n’a pas chargé. Réessayez ou ouvrez la source officielle ci-dessous.',
  ],
  retry: ['重新载入', 'Retry', 'Повторить', 'Réessayer'],
  hint: [
    '放大后拖动图面，或使用滚动条。原图文字为英文；下方提供中文导览。',
    'After zooming, drag the map or use the scrollbars. Original map labels are in English.',
    'После увеличения перемещайте карту или используйте полосы прокрутки. Подписи оригинала — на английском.',
    'Après agrandissement, faites glisser la carte ou utilisez les barres de défilement. Les annotations originales sont en anglais.',
  ],
  guide: ['读图指南', 'Reading guide', 'Как читать карту', 'Guide de lecture'],
  source: ['官方数据', 'Official dataset', 'Официальные данные', 'Données officielles'],
  article: ['研究论文', 'Research paper', 'Научная статья', 'Article scientifique'],
  atlas: ['2024 图集介绍', 'About the 2024 atlas', 'Об атласе 2024 г.', 'L’atlas de 2024'],
  changes: [
    '图像经过等比例缩小与压缩；高清图例、年代尺为原图裁区。保留原版水印和署名，不代表作者为本软件背书。',
    'Images are proportionally downsampled and compressed; legend and chronology are original-map crops. Original watermarks and credits are retained. No endorsement is implied.',
    'Изображения пропорционально уменьшены и сжаты; легенда и шкала — фрагменты оригинала. Водяные знаки и авторство сохранены. Поддержка программы авторами не подразумевается.',
    'Images réduites proportionnellement et compressées ; légende et chronologie sont des extraits. Filigranes et crédits conservés, sans approbation implicite des auteurs.',
  ],
  use: [
    '非商业科普展示 · 图像许可独立于软件许可',
    'Non-commercial science education · Image licence is separate from the software licence',
    'Некоммерческое научное просвещение · Лицензия изображения отдельна от лицензии программы',
    'Vulgarisation non commerciale · Licence de l’image distincte de celle du logiciel',
  ],
};
const LANGUAGES = ['zh', 'en', 'ru', 'fr'];
const STYLE = `.lunar-geology{margin:12px 0;padding:16px;background:#0a1723;border:1px solid #36536b;border-radius:14px;color:#dce8f0;font:13px/1.6 system-ui,sans-serif;min-width:0}
.lunar-geology [hidden]{display:none!important}
.lunar-geology h3{margin:0 0 4px;font-size:18px}.lunar-geology p{margin:8px 0}.lunar-geology .lg-edition{color:#b4c9d9}.lunar-geology .lg-controls,.lunar-geology .lg-tabs{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:12px 0}
.lunar-geology button{font:inherit;padding:6px 10px;color:#dce8f0;background:#142a3b;border:1px solid #476279;border-radius:7px;cursor:pointer}.lunar-geology button[aria-pressed="true"]{background:#275470;border-color:#87c6e9}.lunar-geology button:focus-visible,.lunar-geology a:focus-visible,.lunar-geology input:focus-visible,.lunar-geology .lg-viewport:focus-visible{outline:2px solid #9edbff;outline-offset:3px}
.lunar-geology .lg-controls label{display:flex;gap:8px;align-items:center}.lunar-geology input[type="range"]{width:150px}.lunar-geology .lg-viewport{position:relative;overflow:auto;max-width:100%;height:460px;background:#040a0f;border:1px solid #284154;border-radius:8px;cursor:grab;overscroll-behavior:contain;touch-action:pan-x pan-y}.lunar-geology .lg-viewport:active{cursor:grabbing}.lunar-geology .lg-viewport img{display:block;max-width:none!important;height:auto!important;user-select:none;-webkit-user-drag:none}
.lunar-geology .lg-status{color:#f0cb90;min-height:20px}.lunar-geology .lg-note{color:#aabfce;font-size:12px}.lunar-geology .lg-guide{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin:12px 0}.lunar-geology .lg-guide article{padding:10px;border:1px solid #294456;border-radius:8px}.lunar-geology h4{margin:0;color:#c5e0ef}.lunar-geology a{color:#93d7f7}.lunar-geology .lg-links{display:flex;gap:14px;flex-wrap:wrap}.lunar-geology .lg-credit{font-size:11px;color:#aabfce;overflow-wrap:anywhere;border-top:1px solid #294456;padding-top:10px}
@media(max-width:600px){.lunar-geology{padding:11px}.lunar-geology .lg-viewport{height:360px}.lunar-geology input[type="range"]{width:110px}}`;

/** assets maps poster/overview/legend/timescale to local or bundled image URLs. */
export function mountLunarGeologyViewer(parent, { assets = {}, language = 'zh' } = {}) {
  const root = document.createElement('section');
  root.className = 'lunar-geology';
  parent.append(root);
  const make = (tag, host = root, className = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    host.append(node);
    return node;
  };
  make('style').textContent = STYLE;
  let languageSource = language,
    selected = geologyView('poster'),
    zoom = 1,
    disposed = false;
  let drag = null,
    failed = false,
    loading = false,
    loadGeneration = 0;
  let image = null;
  const lang = () =>
    String(typeof languageSource === 'function' ? languageSource() : languageSource)
      .toLowerCase()
      .split('-')[0];
  const word = (key) =>
    words[key][Math.max(0, LANGUAGES.includes(lang()) ? LANGUAGES.indexOf(lang()) : 1)];
  const localized = (value) => geologyText(value, lang());
  const title = make('h3'),
    edition = make('div', root, 'lg-edition');
  const tabs = make('div', root, 'lg-tabs');
  tabs.setAttribute('role', 'group');
  const tabButtons = new Map();
  const description = make('p');
  const controls = make('div', root, 'lg-controls');
  const zoomLabel = make('label', controls),
    zoomCaption = make('span', zoomLabel);
  const range = make('input', zoomLabel);
  range.type = 'range';
  range.min = '1';
  range.max = '12';
  range.step = '.1';
  range.value = '1';
  const zoomValue = make('output', controls);
  const makeButton = (host, action) => {
    const button = make('button', host);
    button.type = 'button';
    button.onclick = action;
    return button;
  };
  const minus = makeButton(controls, () => changeZoom(zoom / 1.5));
  minus.textContent = '−';
  const plus = makeButton(controls, () => changeZoom(zoom * 1.5));
  plus.textContent = '+';
  const fit = makeButton(controls, () => changeZoom(1));
  const pixels = makeButton(controls, () =>
    changeZoom(selected.width / Math.max(1, viewport.clientWidth))
  );
  const hint = make('p', root, 'lg-note');
  const viewport = make('div', root, 'lg-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  const status = make('div', root, 'lg-status');
  status.setAttribute('role', 'status');
  const retry = makeButton(root, loadImage);
  retry.hidden = true;
  const guideTitle = make('h4');
  const guide = make('div', root, 'lg-guide');
  const guideNodes = GEOLOGY_GUIDE.map((item) => {
    const article = make('article', guide);
    return { item, heading: make('h4', article), body: make('p', article) };
  });
  const links = make('div', root, 'lg-links');
  const linkNodes = [
    ['source', LUNAR_GEOLOGY.sourceUrl],
    ['article', LUNAR_GEOLOGY.articleUrl],
    ['atlas', LUNAR_GEOLOGY.atlas2024Url],
  ].map(([key, url]) => {
    const a = make('a', links);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return { key, a };
  });
  const credit = make('div', root, 'lg-credit');
  make('p', credit).textContent = LUNAR_GEOLOGY.credit;
  const license = make('a', credit);
  license.href = LUNAR_GEOLOGY.licenseUrl;
  license.textContent = LUNAR_GEOLOGY.license;
  license.target = '_blank';
  license.rel = 'noopener noreferrer';
  const changes = make('p', credit),
    use = make('p', credit);

  for (const view of GEOLOGY_VIEWS) {
    const button = makeButton(tabs, () => {
      if (selected.id === view.id) return;
      selected = view;
      zoom = 1;
      range.value = '1';
      loadImage();
      translate();
    });
    tabButtons.set(view.id, button);
  }
  function updateStatus() {
    status.textContent = failed ? word('failed') : loading ? word('loading') : '';
    retry.hidden = !failed;
  }
  function sizeImage() {
    if (!image) return;
    image.style.width = Math.max(1, viewport.clientWidth) * zoom + 'px';
    zoomValue.textContent = Math.round(zoom * 100) + '%';
    range.max = String(Math.max(12, selected.width / Math.max(1, viewport.clientWidth)));
    range.value = String(zoom);
  }
  function changeZoom(value) {
    const previous = zoom;
    zoom = Math.max(
      1,
      Math.min(Math.max(12, selected.width / Math.max(1, viewport.clientWidth)), value)
    );
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
    const centerY = viewport.scrollTop + viewport.clientHeight / 2;
    sizeImage();
    viewport.scrollLeft = (centerX * zoom) / previous - viewport.clientWidth / 2;
    viewport.scrollTop = (centerY * zoom) / previous - viewport.clientHeight / 2;
  }
  function loadImage() {
    const generation = ++loadGeneration;
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.remove();
    }
    image = make('img', viewport);
    image.alt = localized(selected.title);
    image.draggable = false;
    image.decoding = 'async';
    image.width = selected.width;
    image.height = selected.height;
    image.onload = () => {
      if (disposed || generation !== loadGeneration) return;
      loading = false;
      failed = false;
      updateStatus();
      sizeImage();
    };
    image.onerror = () => {
      if (disposed || generation !== loadGeneration) return;
      loading = false;
      failed = true;
      updateStatus();
      image.hidden = true;
    };
    viewport.scrollTop = viewport.scrollLeft = 0;
    const url = assets[selected.id];
    failed = typeof url !== 'string' || !url;
    loading = !failed;
    if (!failed) image.src = url;
    else image.hidden = true;
    sizeImage();
    updateStatus();
  }
  function translate() {
    title.textContent = localized(LUNAR_GEOLOGY.title);
    edition.textContent = localized(LUNAR_GEOLOGY.edition);
    description.textContent = localized(selected.description);
    for (const view of GEOLOGY_VIEWS) {
      const button = tabButtons.get(view.id);
      button.textContent = localized(view.title);
      button.setAttribute('aria-pressed', String(view.id === selected.id));
    }
    if (image) image.alt = localized(selected.title);
    viewport.setAttribute('aria-label', localized(selected.title));
    tabs.setAttribute('aria-label', localized(LUNAR_GEOLOGY.title));
    zoomCaption.textContent = word('zoom');
    range.setAttribute('aria-label', word('zoom'));
    minus.setAttribute('aria-label', word('zoom') + ' −');
    plus.setAttribute('aria-label', word('zoom') + ' +');
    fit.textContent = word('fit');
    pixels.textContent = word('pixels');
    hint.textContent = word('hint');
    retry.textContent = word('retry');
    guideTitle.textContent = word('guide');
    for (const item of guideNodes) {
      item.heading.textContent = localized(item.item.title);
      item.body.textContent = localized(item.item.body);
    }
    for (const item of linkNodes) item.a.textContent = word(item.key) + ' ↗';
    changes.textContent = word('changes');
    use.textContent = word('use');
    updateStatus();
  }
  range.oninput = () => changeZoom(Number(range.value));
  const onDown = (event) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onMove = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  };
  const onUp = (event) => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  const resize = new ResizeObserver(sizeImage);
  resize.observe(viewport);
  loadImage();
  translate();
  return {
    setLanguage(next) {
      if (disposed) return;
      if (next !== undefined) languageSource = next;
      translate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loadGeneration++;
      resize.disconnect();
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
      for (const [type, handler] of [
        ['pointerdown', onDown],
        ['pointermove', onMove],
        ['pointerup', onUp],
        ['pointercancel', onUp],
      ])
        viewport.removeEventListener(type, handler);
      root.remove();
    },
  };
}
