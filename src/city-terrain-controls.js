import { t, setText, getLanguage } from './i18n.js';
import { createCityFinder } from './xuntian-ground-target.js';

const writeText = (node, value) => {
  if (node.textContent !== value) node.textContent = value;
};
const names = (city) => city.names?.[getLanguage()] || city.name || city.names?.en || city.id;
const megabytes = (bytes) => (bytes / 1048576).toFixed(1) + ' MiB';
export function cityTerrainText(status) {
  if (!status?.enabled) return t('城市高清已关闭');
  if (!status.requested) return t('北京、西雅图已内置；放大城市可查看细节');
  const region = status.sources.map(names).join(' / ');
  return `${region ? region + ' · ' : ''}${status.ready}/${status.requested} · ${t(status.complete ? '已就绪' : status.loading ? '加载中' : '保留可用底图')}`;
}

function groundCenter(view) {
  if (!view || view.fovY > 8) return null;
  const p = view.eyeKm,
    d = view.forward,
    b = p.reduce((sum, x, i) => sum + x * d[i], 0);
  const h = b * b - p.reduce((sum, x) => sum + x * x, 0) + 6371 ** 2;
  if (h < 0) return null;
  const distance = -b - Math.sqrt(h);
  if (distance <= 0 || distance * Math.tan((view.fovY * Math.PI) / 360) * 2 > 60) return null;
  const hit = p.map((x, i) => x + d[i] * distance);
  return [
    (Math.atan2(hit[1], hit[0]) * 180) / Math.PI,
    (Math.asin(hit[2] / Math.hypot(...hit)) * 180) / Math.PI,
  ];
}

export function mountCityTerrainControls(env) {
  const manager = env.cityTerrain,
    finder = createCityFinder(env.geography.items);
  let last = -Infinity,
    candidate = null,
    since = 0,
    automatic = null;
  const dismissed = manager.autoDismissed;
  const open = () => {
    env.weather?.resourcePanel?.open();
    requestAnimationFrame(() =>
      document
        .querySelector('[data-resource="city-terrain"]')
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    );
  };
  for (const id of ['openCityTerrain', 'xtCityLibrary']) document.getElementById(id).onclick = open;
  return {
    finder,
    open,
    update() {
      const now = performance.now();
      if (now - last < 500) return;
      last = now;
      setText('cityTerrainStatus', cityTerrainText(manager.status('main')));
      if (!env.settings.cityTerrain || !env.settings.cityAutoLoad) {
        automatic?.controller.abort();
        automatic = null;
        candidate = null;
        return;
      }
      let hit = null;
      for (const view of [...manager.views.values()].sort((a, b) => b.priority - a.priority)) {
        const point = groundCenter(view.input);
        if (point) {
          hit = finder.nearest(point[1], point[0], getLanguage(), { maxDistanceKm: 12 });
          if (hit) break;
        }
      }
      const id = hit ? manager.idFor(hit) : null;
      if (id !== candidate) {
        automatic?.controller.abort();
        automatic = null;
        candidate = id;
        since = now;
      }
      if (!hit || automatic || manager.cities.has(id) || dismissed.has(id) || now - since < 1500)
        return;
      const controller = new AbortController(),
        job = { id, controller };
      automatic = job;
      manager
        .addCity(hit, controller.signal, { automatic: true })
        .catch((error) => {
          if (!controller.signal.aborted) {
            manager.lastError = error.message;
            dismissed.add(id);
          }
        })
        .finally(() => {
          if (automatic === job) automatic = null;
        });
    },
  };
}

export function mountCityTerrainResourceCard({ env, parent, closeResources }) {
  const manager = env.cityTerrain,
    finder = env.cityTerrainControls.finder;
  const card = document.createElement('article');
  card.className = 'resource-card resource-city-card';
  card.dataset.resource = 'city-terrain';
  card.innerHTML = `<div class="resource-card-heading"><h3 data-city-title></h3><span class="resource-badge">Sentinel-2</span></div>
    <label class="check"><input id="cityTerrainEnabled" type="checkbox"><span data-city-enabled></span></label>
    <label class="check"><input id="cityAutoLoad" type="checkbox"><span data-city-auto></span></label>
    <p class="resource-hint" data-city-policy></p><label class="small" for="cityTerrainSearch" data-city-search-label></label>
    <input id="cityTerrainSearch" type="search" class="wide" autocomplete="off"><div data-city-results></div>
    <p data-city-storage class="resource-message" role="status"></p><div data-city-list></div>
    <div class="resource-card-actions"><button type="button" data-city-clear></button></div><p data-city-message class="resource-message" role="status"></p>`;
  parent.append(card);
  const enabled = card.querySelector('#cityTerrainEnabled'),
    auto = card.querySelector('#cityAutoLoad'),
    search = card.querySelector('#cityTerrainSearch');
  const result = card.querySelector('[data-city-results]'),
    list = card.querySelector('[data-city-list]'),
    rows = new Map();
  let last = -Infinity,
    busy = false,
    disposed = false,
    language = null,
    message = '';
  enabled.onchange = () => {
    env.settings.cityTerrain = enabled.checked;
    manager.setEnabled(enabled.checked);
    env.save();
    render(true);
  };
  auto.onchange = () => {
    env.settings.cityAutoLoad = auto.checked;
    manager.autoEnabled = auto.checked;
    env.save();
    render(true);
  };
  const asTarget = (city) => ({
    id: 'city:' + city.id,
    name: names(city),
    latitude: city.center[1],
    longitude: city.center[0],
    fov: 12,
    type: 'city',
  });
  function viewCity(target) {
    env.settings.cityTerrain = true;
    manager.setEnabled(true);
    env.save();
    manager.addCity(target).catch((error) => {
      message = error.message;
      render(true);
    });
    closeResources();
    env.sim.xuntian?.observeCity?.(target);
  }
  function searchResults() {
    result.replaceChildren();
    for (const city of finder.search(search.value, getLanguage(), 6)) {
      const row = document.createElement('div');
      row.className = 'city-resource-row';
      const label = document.createElement('span');
      label.textContent = city.name;
      const view = document.createElement('button');
      view.type = 'button';
      view.textContent = t('查看');
      view.onclick = () => viewCity(city);
      view.disabled = env.sim.missionId !== 'tiangong';
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = t('下载离线');
      save.hidden = !!manager.cities.get(manager.idFor(city))?.builtin;
      save.dataset.cityDownload = manager.idFor(city);
      save.onclick = () => {
        const id = manager.idFor(city);
        if (manager.downloads.has(id)) manager.cancelDownload(id);
        else manager.downloadCity(city).finally(() => render(true));
        render(true);
      };
      row.append(label, view, save);
      result.append(row);
    }
    if (search.value.trim() && !result.children.length) {
      const p = document.createElement('p');
      p.textContent = t('未找到城市，请尝试中文或英文名称');
      result.append(p);
    }
  }
  search.oninput = searchResults;
  card.querySelector('[data-city-clear]').onclick = async () => {
    try {
      const stored = new Map((await manager.cache.list()).map((row) => [row.id, row]));
      for (const city of manager.cities.values())
        if (!city.builtin && !stored.get(city.id)?.pinned && !manager.downloads.has(city.id)) {
          await manager.removeCity(city.id);
        }
      message = t('临时城市缓存已清理');
    } catch (error) {
      message = error.message;
    }
    render(true);
  };
  function cityRow(city) {
    let row = rows.get(city.id);
    if (row) return row;
    const element = document.createElement('section');
    element.className = 'city-resource-entry';
    element.dataset.city = city.id;
    const title = document.createElement('strong'),
      info = document.createElement('p'),
      progress = document.createElement('p'),
      buttons = document.createElement('div');
    info.className = progress.className = 'resource-hint';
    buttons.className = 'resource-card-actions';
    const view = document.createElement('button'),
      download = document.createElement('button'),
      remove = document.createElement('button');
    for (const button of [view, download, remove]) button.type = 'button';
    view.onclick = () => viewCity(asTarget(manager.cities.get(city.id)));
    download.onclick = () => {
      if (manager.downloads.has(city.id)) manager.cancelDownload(city.id);
      else manager.downloadCity(asTarget(manager.cities.get(city.id))).finally(() => render(true));
      render(true);
    };
    remove.onclick = async () => {
      if (city.builtin) {
        if (manager.disabled.has(city.id)) manager.disabled.delete(city.id);
        else manager.disabled.add(city.id);
        try {
          localStorage.setItem('starorbit-city-disabled-v1', JSON.stringify([...manager.disabled]));
        } catch {}
        manager.revision++;
        manager.schedule(true);
      } else {
        manager.autoDismissed.add(city.id);
        try {
          await manager.removeCity(city.id);
        } catch (error) {
          message = error.message;
        }
      }
      render(true);
    };
    const sources = document.createElement('details'),
      summary = document.createElement('summary'),
      link = document.createElement('a'),
      credit = document.createElement('p');
    link.href = city.source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = city.source.title;
    credit.textContent = `${city.source.observed} · ${city.source.license}\n${city.source.credit}`;
    sources.append(summary, link, credit);
    buttons.append(view, download, remove);
    element.append(title, info, progress, buttons, sources);
    list.append(element);
    row = { element, title, info, progress, view, download, remove, summary };
    rows.set(city.id, row);
    return row;
  }
  async function render(force = false) {
    const now = performance.now();
    if (disposed || busy || (!force && now - last < 700)) return;
    last = now;
    busy = true;
    try {
      enabled.checked = env.settings.cityTerrain;
      auto.checked = env.settings.cityAutoLoad;
      for (const [selector, text] of Object.entries({
        '[data-city-title]': '城市高清地景',
        '[data-city-enabled]': '显示已内置或已下载的城市地景',
        '[data-city-auto]': '放大其它城市时自动加载（联网）',
        '[data-city-policy]':
          '内置北京 40 × 40 km、西雅图 20 × 20 km。其它城市约 20 × 20 km；已保存的离线包不会自动删除。',
        '[data-city-search-label]': '搜索城市',
        '[data-city-clear]': '清理临时缓存',
      }))
        writeText(card.querySelector(selector), t(text));
      search.placeholder = t('北京、Seattle、Washington');
      if (language !== getLanguage()) {
        language = getLanguage();
        searchResults();
      }
      const stored = new Map((await manager.cache.list()).map((c) => [c.id, c]));
      for (const button of result.querySelectorAll('[data-city-download]')) {
        const id = button.dataset.cityDownload;
        writeText(
          button,
          t(
            manager.downloads.has(id)
              ? '取消下载'
              : stored.get(id)?.complete
                ? '已离线保存'
                : '下载离线'
          )
        );
        button.disabled = !manager.downloads.has(id) && !!stored.get(id)?.complete;
      }
      for (const city of manager.cities.values()) {
        const row = cityRow(city),
          cache = stored.get(city.id),
          job = manager.downloads.get(city.id);
        writeText(row.title, names(city));
        writeText(
          row.info,
          `${city.year} · ${Number(city.pixelSizeMeters).toFixed(1)} m/px · ${city.extentKm} × ${city.extentKm} km · ${t(city.builtin ? '内置离线' : cache?.complete ? '已离线保存' : '临时或未完成')} · ${megabytes(city.builtin ? city.bytes || 0 : cache?.bytes || 0)}`
        );
        writeText(row.progress, job ? `${t('下载中')} ${job.done}/${job.total || '—'}` : '');
        writeText(row.view, t('查看'));
        row.view.disabled = env.sim.missionId !== 'tiangong';
        row.download.hidden = !!city.builtin;
        row.download.disabled = !job && !!cache?.complete;
        writeText(row.download, t(job ? '取消下载' : cache?.complete ? '已离线保存' : '下载离线'));
        writeText(
          row.remove,
          t(city.builtin ? (manager.disabled.has(city.id) ? '启用' : '停用') : '删除城市')
        );
        writeText(row.summary, t('来源与拍摄日期'));
      }
      for (const [id, row] of rows)
        if (!manager.cities.has(id)) {
          row.element.remove();
          rows.delete(id);
        }
      const stats = await manager.cache.stats();
      writeText(
        card.querySelector('[data-city-storage]'),
        `${t('城市缓存')} ${megabytes(stats.bytes)} / 512 MiB · ${t('GPU 上限')} 64 MiB${!stats.persistent ? ' · ' + t('当前环境无法持久保存') : ''}`
      );
      const preparing = [...manager.downloads.values()].filter(
        (job) => !manager.cities.has(job.id)
      );
      writeText(
        card.querySelector('[data-city-message]'),
        preparing.length
          ? preparing.map((job) => `${job.name} · ${t('正在准备下载…')}`).join('\n')
          : message || manager.lastError
      );
    } finally {
      busy = false;
    }
  }
  return {
    render,
    dispose() {
      disposed = true;
      card.remove();
    },
  };
}

export function paintCityTerrainCaption(canvas, status, bottomInset = 0) {
  if (!status?.sources.length) return 0;
  const font = Math.max(11, Math.round(canvas.width / 120));
  const lines = status.sources.map(
    (c) =>
      `${names(c)} · ${c.source.observed} · ${Number(c.pixelSizeMeters).toFixed(1)} m/px · ${c.source.credit}`
  );
  if (!status.complete) lines.push('City detail incomplete · available base imagery retained');
  const height = lines.length * (font + 5) + 10,
    ctx = canvas.getContext('2d');
  ctx.save();
  ctx.font = `${font}px sans-serif`;
  ctx.fillStyle = 'rgba(2,8,15,.76)';
  ctx.fillRect(0, canvas.height - bottomInset - height, canvas.width, height);
  ctx.fillStyle = '#d0dce8';
  lines.forEach((line, i) =>
    ctx.fillText(
      line,
      8,
      canvas.height - bottomInset - height + font + 5 + i * (font + 5),
      canvas.width - 16
    )
  );
  ctx.restore();
  return height;
}
