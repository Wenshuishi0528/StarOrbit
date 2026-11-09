import {
  MINERAL_NAMES,
  mineralFeature,
  readMineralCatalog,
  hasCommodity,
} from './earth-minerals.js';
import { t } from './i18n.js';

export function installEarthObservationControls({ host, environment, selectFeature }) {
  const manifest = environment.assets.earthObservation;
  const root = document.createElement('div');
  root.className = 'earth-observation-controls';
  root.innerHTML = `<div data-earth-guide></div><details><summary data-text="矿产资源分布"></summary><label class="check"><input data-minerals type="checkbox"><span data-text="显示矿床与矿点"></span></label><label data-text="矿种筛选"></label><select data-commodity></select><label data-text="矿点亮度"></label><input data-mineral-opacity type="range" min="0.15" max="1" step=".05" value=".9"><label data-text="搜索矿区名称或编号"></label><input data-mineral-query type="search"><div data-mineral-results class="planet-results"></div><p data-mineral-count></p><p data-mineral-note></p><div data-mineral-selection></div></details>`;
  host.querySelector('[data-layer]').after(root);
  const $ = (s) => root.querySelector(s);
  let rows = null,
    request = null,
    error = '',
    enabled = false,
    body = 'Mars',
    layer = '',
    count = 0;
  const codeLabel = (code) =>
    `${t(MINERAL_NAMES[code] ?? manifest?.minerals.commodityNames?.[code] ?? code)} · ${code}`;
  function source(id) {
    const r = manifest?.layers[id];
    if (!r) return '';
    return `${t(r.label)} · ${r.credit}\n${r.periodStart ? r.periodStart + ' — ' + r.periodEnd + ' · ' + t('八日合成') + '\n' : ''}${r.bands ? r.bands + '\n' : ''}${t(r.description)}\n${t('全球概览像元')} ${r.displayPixelDegrees.toFixed(3)}°`;
  }
  function legend(id, container) {
    const record = manifest?.layers[id];
    if (!record?.legend) return;
    const stops = record.legend,
      first = stops[0],
      last = stops.at(-1);
    const value = (s) => s.meters ?? s.celsius;
    const bar = document.createElement('div');
    bar.style.cssText = `height:12px;border-radius:3px;margin:8px 0 4px;background:linear-gradient(to right,${stops.map((s) => `${s.color} ${((value(s) - value(first)) / (value(last) - value(first))) * 100}%`).join(',')})`;
    const label = document.createElement('div');
    label.style.cssText = 'position:relative;height:20px;font-size:11px;color:#c9dce6';
    const indexes = [
      ...new Set([
        0,
        Math.max(
          1,
          stops.findIndex((s) => value(s) === 0)
        ),
        stops.length - 1,
      ]),
    ];
    for (const i of indexes) {
      const span = document.createElement('span');
      span.textContent = `${value(stops[i]).toLocaleString()} ${first.meters !== undefined ? 'm' : '°C'}`;
      span.style.position = 'absolute';
      if (i === 0) span.style.left = '0';
      else if (i === stops.length - 1) span.style.right = '0';
      else {
        span.style.left = `${((value(stops[i]) - value(first)) / (value(last) - value(first))) * 100}%`;
        span.style.transform = 'translateX(-50%)';
      }
      label.append(span);
    }
    container.append(bar, label);
  }
  function guide() {
    root.hidden = body !== 'Earth' || !manifest;
    const box = $('[data-earth-guide]');
    box.replaceChildren();
    const record = manifest?.layers[layer];
    if (body !== 'Earth' || !record) return;
    const title = document.createElement('p');
    title.style.color = '#dfc99d';
    title.textContent = record.periodStart
      ? `${record.periodStart} — ${record.periodEnd} · ${t('八日合成')}`
      : 'ETOPO 2022 · EGM2008';
    const note = document.createElement('p');
    note.textContent = t(record.description);
    const missing = document.createElement('p');
    missing.textContent = t(
      layer.startsWith('temperature')
        ? '深色底纹：海洋或无有效观测。'
        : layer === 'earthElevation'
          ? '蓝色为海底深度，绿色至白色为陆地高程。'
          : '颜色按所选波段组合；黑色包含水体与缺测区域。'
    );
    box.append(title, note);
    legend(layer, box);
    box.append(missing);
  }
  function updateCount() {
    const selectedCode = $('[data-commodity]').value;
    count = rows?.reduce((sum, r) => sum + Number(hasCommodity(r, selectedCode)), 0) ?? 0;
    $('[data-mineral-count]').textContent =
      error ||
      (request
        ? t('正在载入矿点资料…')
        : rows
          ? t('筛选到 {count} 条记录；缩远聚合，放大展开。', { count: count.toLocaleString() })
          : '');
  }
  async function load() {
    if (rows || request || !manifest) return;
    const controller = new AbortController();
    request = controller;
    error = '';
    updateCount();
    try {
      const result = await readMineralCatalog(manifest.minerals.url, controller.signal);
      if (!controller.signal.aborted) rows = result;
    } catch (e) {
      if (!controller.signal.aborted) error = t('矿点资料载入失败，请重新开启图层。');
    } finally {
      if (request === controller) {
        request = null;
        updateCount();
      }
    }
  }
  function search() {
    const box = $('[data-mineral-results]');
    box.replaceChildren();
    const query = $('[data-mineral-query]').value.trim().toLowerCase();
    const selectedCode = $('[data-commodity]').value;
    if (!query || !rows) return;
    let n = 0;
    for (const row of rows) {
      if (!hasCommodity(row, selectedCode) || !`${row[0]} ${row[1]}`.toLowerCase().includes(query))
        continue;
      const button = document.createElement('button');
      button.textContent = `${row[1]} · ${row[4]}`;
      button.onclick = () => {
        const f = mineralFeature(row);
        selectFeature(f);
        showSelection(f);
      };
      box.append(button);
      if (++n === 12) break;
    }
    if (!n) box.textContent = t('没有匹配的矿点记录');
  }
  function showSelection(group) {
    root.querySelector('details').open = true;
    const box = $('[data-mineral-selection]');
    box.replaceChildren();
    if (group.count > 1) {
      const note = document.createElement('p');
      note.textContent = t('此组 {count} 条记录', { count: group.count.toLocaleString() });
      box.append(note);
      for (const row of group.records.slice(0, 8)) {
        const b = document.createElement('button');
        b.textContent = row[1];
        b.style.cssText = 'display:block;width:100%;margin:5px 0;text-align:left';
        b.onclick = () => {
          const f = mineralFeature(row);
          selectFeature(f);
          showSelection(f);
        };
        box.append(b);
      }
      return;
    }
    const note = document.createElement('p');
    note.textContent = `${group.name}\n${group.commodities.split(' ').filter(Boolean).map(codeLabel).join('、')}\n${group.latitude.toFixed(4)}°, ${group.longitude.toFixed(4)}°\n${t('档案开发状态')}：${t({ Producer: '历史记录为生产矿山', 'Past Producer': '历史记录为停产矿山', Prospect: '勘探点', Occurrence: '矿化显示', Plant: '加工厂', Unknown: '未知' }[group.historicalStatus] ?? group.historicalStatus)} · ${t('资料等级')} ${group.grade || '—'}`;
    const link = document.createElement('a');
    link.textContent = t('打开 USGS 原始记录');
    link.href = group.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.color = '#8ed8ea';
    box.append(note, link);
  }
  function translate() {
    root.querySelectorAll('[data-text]').forEach((el) => (el.textContent = t(el.dataset.text)));
    const previous = $('[data-commodity]').value;
    $('[data-commodity]').replaceChildren(
      new Option(t('全部矿种'), ''),
      ...Object.keys(manifest?.minerals.commodities ?? {})
        .sort((a, b) => (b in MINERAL_NAMES) - (a in MINERAL_NAMES) || a.localeCompare(b))
        .map(
          (code) =>
            new Option(
              `${codeLabel(code)} (${manifest.minerals.commodities[code].toLocaleString()})`,
              code
            )
        )
    );
    $('[data-commodity]').value = previous;
    $('[data-mineral-note]').textContent = t(
      'USGS MRDS 历史矿点资料 · 系统更新截至 2011 年。点表示已有记录，资料覆盖因地区而异。'
    );
    guide();
    updateCount();
  }
  $('[data-minerals]').onchange = () => {
    enabled = $('[data-minerals]').checked;
    if (enabled) void load();
  };
  $('[data-commodity]').onchange = () => {
    $('[data-mineral-selection]').replaceChildren();
    updateCount();
    search();
  };
  $('[data-mineral-query]').oninput = search;
  translate();
  return {
    source,
    paintLegend(c, id, x, y, width, scale) {
      const stops = manifest?.layers[id]?.legend;
      if (!stops) return;
      const value = (s) => s.meters ?? s.celsius;
      const low = value(stops[0]),
        high = value(stops.at(-1));
      const gradient = c.createLinearGradient(x, 0, x + width, 0);
      for (const stop of stops)
        gradient.addColorStop((value(stop) - low) / (high - low), stop.color);
      c.fillStyle = gradient;
      c.fillRect(x, y, width, 10 * scale);
      c.fillStyle = '#dce7ee';
      c.font = `${10 * scale}px system-ui`;
      c.textAlign = 'left';
      c.fillText(`${low} ${stops[0].meters !== undefined ? 'm' : '°C'}`, x, y + 22 * scale);
      c.textAlign = 'right';
      c.fillText(
        `${high} ${stops[0].meters !== undefined ? 'm' : '°C'}`,
        x + width,
        y + 22 * scale
      );
      c.textAlign = 'left';
    },
    legend,
    showSelection,
    get labels() {
      return Object.fromEntries(
        Object.entries(manifest?.layers ?? {}).map(([id, r]) => [id, r.label])
      );
    },
    update(target, id) {
      body = target;
      layer = id;
      guide();
    },
    translate,
    settings() {
      return {
        mineralRows: rows,
        mineralVisible: body === 'Earth' && enabled,
        mineralCommodity: $('[data-commodity]').value,
        mineralOpacity: Number($('[data-mineral-opacity]').value),
      };
    },
    get loading() {
      return enabled && !!request;
    },
    get photoNote() {
      return enabled && body === 'Earth'
        ? `USGS MRDS · ${$('[data-commodity]').value ? codeLabel($('[data-commodity]').value) : t('全部矿种')} · ${count.toLocaleString()} · ${t('历史矿点记录')}`
        : '';
    },
    open() {
      if (enabled && !rows) void load();
    },
    close() {
      request?.abort();
      request = null;
      updateCount();
    },
    dispose() {
      request?.abort();
      rows = null;
      root.remove();
    },
  };
}
