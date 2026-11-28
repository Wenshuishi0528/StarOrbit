import { t, onLanguageChange, getLanguage } from './i18n.js';
import { tileCoverage } from './survey-sky-product-math.js';
import { loadSurveyGalaxy } from './survey-sky-product-galaxy.js';
import { createSurveyImagery } from './survey-imagery.js';
import { photographicSkyBase } from './sky-detail-plan.js';
import { skyDetailCaptionLines, skyDetailText } from './sky-detail-controls.js';
import { describeEyepiecePng } from './ground-scope-photo.js';
import {
  createSkyPainter,
  drawPlanner,
  makeSurveyPlate,
  modeNames,
} from './survey-sky-product-draw.js';

const css = `.survey-product{display:grid;gap:5px;margin-top:8px;color:#c4d6e2}.survey-product-tools{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}.survey-product-tools label{display:flex;align-items:center;gap:6px}.survey-product-tools select{min-width:0;max-width:100%;padding:4px 6px!important}.survey-product-tools button{padding:5px 9px}.survey-product small{color:#a6bacb;line-height:1.45}.survey-product [data-sky-product=count]{color:#b3dadd}.survey-product-dialog{width:min(860px,96vw);height:min(91dvh,1050px);max-width:none;max-height:none;padding:10px 12px;border:1px solid #486477;border-radius:10px;background:#0b1826;color:#e3edf4}.survey-product-dialog[open]{display:flex;flex-direction:column;gap:6px}.survey-product-dialog::backdrop{background:#02070ece}.survey-product-dialog .survey-product-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:5px 12px}.survey-product-dialog .survey-product-head strong{flex:1}.survey-product-dialog .survey-plate-stage{flex:1;min-height:0;display:grid;grid-template: minmax(0,1fr) / minmax(0,1fr);place-items:center;background:#06101a;overflow:hidden}.survey-product-dialog canvas{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}.survey-product-dialog[data-zoom=actual] .survey-plate-stage{display:block;overflow:auto;place-items:start;place-content:start}.survey-product-dialog[data-zoom=actual] canvas{width:auto;height:auto;max-width:none;max-height:none}.survey-product [hidden]{display:none!important}@media(max-width:640px){.survey-product-tools{gap:5px}.survey-product-tools label{width:100%}.survey-product-tools select{flex:1}.survey-product-tools button{font-size:12px}.survey-product-dialog{width:100vw;height:96dvh;border-radius:0}.survey-product-dialog .survey-product-head strong{flex:1 0 100%}}`;

export function mountSurveySkyProduct(host, skyCanvas, sim) {
  const root = document.createElement('section');
  root.className = 'survey-product';
  host.append(root);
  root.innerHTML = `<style>${css}</style><div class="survey-product-tools"><div class="survey-source-picker"><label><span data-sky-label="星空影像"></span><select data-sky-product="mode"></select></label>
    <label data-sky-product="background-row" hidden><span data-sky-label="底图"></span><select data-sky-product="background"></select></label></div>
    <button type="button" data-sky-product="open" data-sky-label="查看成片"></button><button type="button" data-sky-product="download" data-sky-label="下载拼图 PNG"></button>
    <button type="button" data-sky-product="retry" data-sky-label="重试" hidden></button></div>
    <small data-sky-product="count"></small><small data-sky-product="description"></small><small data-sky-product="status" role="status" aria-live="polite"></small>
    <dialog class="survey-product-dialog" data-sky-product="dialog"><div class="survey-product-head"><strong data-sky-label="巡天模拟成片"></strong><button type="button" data-sky-product="zoom" aria-pressed="false"></button><button type="button" data-sky-product="dialog-download" data-sky-label="下载拼图 PNG"></button><button type="button" data-sky-product="close" data-sky-label="关闭大图"></button></div><div class="survey-plate-stage" data-sky-product="stage" tabindex="0"></div></dialog>`;
  const controls = new Map(
      Array.from(root.querySelectorAll('[data-sky-product]'), (node) => [
        node.dataset.skyProduct,
        node,
      ])
    ),
    el = (key) => controls.get(key),
    labels = root.querySelectorAll('[data-sky-label]'),
    sourcePicker = root.querySelector('.survey-source-picker'),
    painter = createSkyPainter(sim.environment.stars.geometry),
    galaxies = new Map(),
    surveyImagery = createSurveyImagery(sim);
  let background = 'galaxy',
    detail = null,
    detailTimer = 0,
    artworkId = null;
  const remote = () => !['galaxy', 'catalog', 'dense'].includes(mode);
  const blank = () => ['hubble', 'recent'].includes(mode) && background === 'blank';
  const photographic = () => photographicSkyBase(mode, background);
  const skySelection = () => ({
    source: ['catalog', 'dense'].includes(mode) ? 'galaxy' : mode,
    background,
    artworkId,
  });
  let model = null,
    mode = 'galaxy',
    alive = true,
    visible = true,
    galaxyRequest = null,
    galaxyError = null,
    plate = null,
    plateKey = '',
    plannerKey = '',
    downloadToken = 0,
    encoding = false;
  let statusKey = '',
    statusParams = {};
  function status(key = '', params = {}) {
    statusKey = key;
    statusParams = params;
    el('status').textContent = key ? t(key, params) : '';
  }
  function idleStatus() {
    status(model?.count ? '' : '完成第一格曝光后即可查看成片；未拍的格会明确留空。');
  }
  function cancelSky() {
    galaxyRequest?.controller.abort();
    galaxyRequest = null;
  }
  function invalidatePhoto(cancelExport = false) {
    plate = null;
    plateKey = '';
    if (cancelExport) {
      downloadToken++;
      encoding = false;
    }
  }
  function galaxy() {
    return model && galaxies.get(model.field.id);
  }
  function canExport() {
    return (
      model?.count > 0 &&
      !(detail?.status.loading && !detail?.status.ready) &&
      (photographic() ||
        ['catalog', 'dense'].includes(mode) ||
        !!galaxy() ||
        !!detail?.status.ready ||
        !!galaxyError)
    );
  }
  function syncControls() {
    const enabled = canExport();
    el('open').disabled = !enabled;
    el('download').disabled = el('dialog-download').disabled = !enabled || encoding;
    el('retry').hidden = !(galaxyError === model?.field.id || (remote() && detail?.status.failed));
  }
  function refreshInfo() {
    if (!model) return;
    const count = painter.records(model.field),
      level = galaxy()?.level;
    const stars = mode === 'catalog' ? count.base.length : count.deep.length;
    el('count').textContent = blank()
      ? t('空白底图仅显示作品实际覆盖的区域。')
      : photographic()
        ? t('北上，东左')
        : t('本天区有 {n} 颗目录星 · 北上，东左', { n: stars });
    const note =
      mode === 'catalog'
        ? 'XHIP 亮星，全天目录包含 41,411 颗恒星。'
        : mode === 'dense'
          ? '内置亮星叠加 Tycho-2 实测星点，保留至 VT 11.5 等。'
          : level
            ? 'NASA 银河全天源图宽 16K，本次采样 {level}K 档，每个立方体面 {face} 像素；目录星独立绘制。'
            : 'NASA 银河 16K 为全天背景图，目录星独立绘制。';
    el('description').textContent =
      remote() && detail
        ? [skyDetailText(detail.status), ...detail.status.sources.map((p) => p.credit)]
            .filter(Boolean)
            .join(' · ')
        : mode === 'dense' && model.field.id.startsWith('sky-')
          ? t('此天区使用内置亮星目录。')
          : t(note, { level, face: level * 256 });
  }
  function ensureGalaxy() {
    if (
      !visible ||
      ['dense', 'catalog'].includes(mode) ||
      photographic() ||
      !model ||
      galaxy() ||
      galaxyError === model.field.id ||
      galaxyRequest?.id === model.field.id
    )
      return;
    cancelSky();
    const field = model.field,
      controller = new AbortController(),
      request = { id: field.id, controller };
    galaxyRequest = request;
    status('正在按当前天区载入银河背景…');
    syncControls();
    loadSurveyGalaxy(field, sim.environment, controller.signal)
      .then((image) => {
        if (!alive || controller.signal.aborted || galaxyRequest !== request) return;
        if (galaxies.size >= 3) galaxies.delete(galaxies.keys().next().value);
        galaxies.set(field.id, image);
        galaxyRequest = null;
        invalidatePhoto();
        plannerKey = '';
        idleStatus();
        refreshInfo();
        paint();
      })
      .catch((error) => {
        if (!alive || controller.signal.aborted || galaxyRequest !== request) return;
        galaxyRequest = null;
        galaxyError = field.id;
        status('银河图源暂不可用，保留已载入的影像与星表。');
        syncControls();
      });
  }
  function credits() {
    const lines = [];
    if (photographic()) {
      const sources = detail?.status.sources || [];
      return [
        `Photographic sky: ${mode}; background: ${photographic()}; pixels without loaded imagery are black`,
        ...sources.map((p) =>
          [p.id, p.observed, p.bands, p.credit, p.sourceUrl].filter(Boolean).join(' · ')
        ),
      ];
    }
    if (!['catalog', 'dense'].includes(mode) && galaxy())
      lines.push('Milky Way: NASA/Goddard SVS, Ernie Wright · ESA/Gaia/DPAC');
    lines.push('XHIP · d3-celestial');
    if (mode !== 'catalog' && !model?.field.id.startsWith('sky-'))
      lines.push('Tycho-2 (Høg et al., 2000) / NASA HEASARC');
    if (detail) lines.push(...skyDetailCaptionLines({ ...detail.status, skyVisible: true }));
    return lines;
  }
  function result() {
    if (!model || !canExport()) return null;
    const key = [model.key, mode, galaxy()?.level, detail?.key, blank(), getLanguage()].join('|');
    if (key !== plateKey) {
      const layer = painter.layer(model.field, mode, 1320, galaxy(), detail);
      const actual = detail?.status.sources
        .map((p) => p.credit)
        .filter(Boolean)
        .join(' · ');
      plate = makeSurveyPlate({
        ...model,
        mode,
        layer,
        galaxy: galaxy(),
        sourceCredit: actual || credits().slice(0, 2).join(' · '),
      });
      plateKey = key;
      plate.dataset.skyProduct = 'plate';
      plate.setAttribute('role', 'img');
      plate.setAttribute('aria-label', t('巡天天区模拟成片 · 已覆盖 {n}/4 格', { n: model.count }));
    }
    return plate;
  }
  function paint() {
    if (!model || !alive || !visible) return;
    if (remote()) {
      try {
        detail = surveyImagery.update(model.field, skySelection());
      } catch {
        detail = {
          status: {
            ...skySelection(),
            enabled: true,
            active: true,
            fallback: 'unavailable',
            sources: [],
          },
        };
      }
      detail.blank = !!photographic();
      refreshInfo();
      if (detail.status.loading && !detailTimer)
        detailTimer = setTimeout(() => {
          detailTimer = 0;
          paint();
        }, 220);
    }
    const { field, coverage, current, fraction } = model,
      side = Math.min(skyCanvas.clientWidth, skyCanvas.clientHeight);
    const size = Math.max(96, Math.round(side * Math.min(2, window.devicePixelRatio || 1))),
      layer = painter.layer(field, mode, size, galaxy(), detail);
    const key = [
      model.key,
      mode,
      detail?.key,
      blank(),
      galaxy()?.level,
      current,
      Math.round(fraction * 100),
      skyCanvas.clientWidth,
      skyCanvas.clientHeight,
      size,
    ].join('|');
    if (key !== plannerKey) {
      drawPlanner(skyCanvas, layer, coverage, current, fraction, !!photographic());
      plannerKey = key;
    }
    syncControls();
    if (el('dialog').open) {
      try {
        const out = result();
        if (out && el('stage').firstChild !== out) el('stage').replaceChildren(out);
        else if (!out) el('dialog').close();
      } catch {
        el('dialog').close();
        status('拼图 PNG 生成失败，请重试。');
      }
    }
  }
  function update({ field, completed = [], current = null, fraction = 0, epoch }) {
    const coverage = tileCoverage(field, completed),
      count = coverage.filter((x) => x.count).length;
    const key = [
      field.id,
      epoch,
      ...coverage.map((x) => [x.count, x.seconds, x.first, x.last].join('/')),
    ].join('|');
    const fieldChanged = model?.field.id !== field.id,
      changed = model?.key !== key;
    if (fieldChanged) {
      cancelSky();
      galaxyError = null;
    }
    if (changed) invalidatePhoto(fieldChanged || model?.epoch !== epoch);
    model = {
      field,
      coverage,
      count,
      key,
      current: current?.field === field.id ? current.tile : -1,
      fraction,
      epoch,
    };
    if (changed) {
      refreshInfo();
      if (!galaxyRequest && !galaxyError) idleStatus();
    }
    if (visible) {
      ensureGalaxy();
      paint();
    }
  }
  async function download() {
    if (!canExport() || encoding) return;
    const token = ++downloadToken,
      fieldId = model.field.id,
      count = model.count,
      epoch = model.epoch,
      exportMode = mode;
    encoding = true;
    syncControls();
    status('正在生成拼图 PNG…');
    try {
      const sources = credits(),
        title = model.field.name,
        description =
          'J2000 RA ' +
          model.field.ra +
          '° Dec ' +
          model.field.dec +
          '° · ' +
          new Date(epoch).toISOString();
      const out = result(),
        blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
      if (!alive || !visible || token !== downloadToken) return;
      if (!blob) throw Error('PNG');
      const url = URL.createObjectURL(describeEyepiecePng(blob, { title, description, sources })),
        a = document.createElement('a');
      a.href = url;
      a.download = `StarOrbit-Xuntian-${fieldId}-${exportMode}-${count}of4-${new Date(epoch).toISOString().replaceAll(':', '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status('拼图 PNG 已导出 · 已覆盖 {n}/4 格', { n: count });
    } catch {
      if (alive && token === downloadToken) status('拼图 PNG 生成失败，请重试。');
    } finally {
      if (alive && token === downloadToken) {
        encoding = false;
        syncControls();
      }
    }
  }
  async function downloadSingle(exposure) {
    if (!model || !visible || encoding || !Number.isFinite(exposure?.start)) return false;
    const token = ++downloadToken,
      { field, epoch } = model;
    const shutterTime = new Date(epoch + exposure.start * 1000).toISOString();
    encoding = true;
    syncControls();
    try {
      const until = performance.now() + 8000;
      const waiting = () =>
        (detail?.status.loading && !detail.status.ready) ||
        (!photographic() &&
          !['catalog', 'dense'].includes(mode) &&
          !galaxy() &&
          !galaxyError &&
          !detail?.status.ready);
      if (waiting()) status('正在准备底图，请在影像载入后拍摄。');
      while (alive && visible && token === downloadToken && waiting() && performance.now() < until)
        await new Promise((done) => setTimeout(done, 100));
      if (!alive || !visible || token !== downloadToken) return false;
      const sources = credits();
      const pixels = painter.layer(field, mode, 1320, galaxy(), detail);
      const png = await new Promise((resolve) => pixels.toBlob(resolve, 'image/png'));
      if (!alive || !visible || token !== downloadToken || !png) return false;
      const result = describeEyepiecePng(png, {
        title: field.name,
        description: `Simulated sky exposure · ${shutterTime} · ${exposure.duration} s · J2000 RA ${field.ra}° Dec ${field.dec}° · 6° × 6°`,
        sources,
      });
      const link = document.createElement('a'),
        url = URL.createObjectURL(result);
      link.href = url;
      link.download = `StarOrbit-Xuntian-${field.id}-single-${shutterTime.replaceAll(':', '-')}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status('已导出单张模拟曝光 · {time} · {seconds} s', {
        time: shutterTime,
        seconds: exposure.duration,
      });
      return true;
    } catch {
      if (token === downloadToken) status('拼图 PNG 生成失败，请重试。');
      return false;
    } finally {
      if (alive && token === downloadToken) {
        encoding = false;
        syncControls();
      }
    }
  }
  function zoom(actual) {
    const dialog = el('dialog'),
      stage = el('stage');
    dialog.dataset.zoom = actual ? 'actual' : 'fit';
    el('zoom').setAttribute('aria-pressed', String(actual));
    el('zoom').textContent = t(actual ? '适应窗口' : '原始尺寸');
    stage.scrollLeft = actual ? (stage.scrollWidth - stage.clientWidth) / 2 : 0;
    stage.scrollTop = actual ? (stage.scrollHeight - stage.clientHeight) / 2 : 0;
  }
  function translate() {
    for (const e of labels) e.textContent = t(e.dataset.skyLabel);
    el('mode').replaceChildren(
      ...Object.entries(modeNames).map(([key, label]) => new Option(t(label), key))
    );
    el('mode').value = mode;
    el('background').replaceChildren(
      ...['galaxy', 'dss', 'panstarrs', 'blank'].map(
        (key) => new Option(t(key === 'blank' ? '空白' : modeNames[key]), key)
      )
    );
    el('background').value = background;
    el('background-row').hidden = !['hubble', 'recent'].includes(mode);
    el('dialog').setAttribute('aria-label', t('巡天模拟成片'));
    el('zoom').textContent = t(el('dialog').dataset.zoom === 'actual' ? '适应窗口' : '原始尺寸');
    refreshInfo();
    status(statusKey, statusParams);
    paint();
  }
  function setMode(next, base = background, work = null) {
    if (!Object.hasOwn(modeNames, next)) return;
    if (!['galaxy', 'dss', 'panstarrs', 'blank'].includes(base)) base = 'galaxy';
    if (next === mode && background === base && artworkId === work) return;
    background = base;
    artworkId = typeof work === 'string' ? work : null;
    mode = next;
    el('mode').value = next;
    el('background').value = base;
    el('background-row').hidden = !['hubble', 'recent'].includes(mode);
    clearTimeout(detailTimer);
    detailTimer = 0;
    detail = null;
    surveyImagery.release();
    cancelSky();
    galaxyError = null;
    invalidatePhoto(true);
    plannerKey = '';
    idleStatus();
    refreshInfo();
    ensureGalaxy();
    paint();
  }
  el('mode').onchange = () => setMode(el('mode').value);
  el('background').onchange = () => setMode(mode, el('background').value, artworkId);
  el('open').onclick = () => {
    if (!canExport()) return;
    try {
      const out = result();
      el('stage').replaceChildren(out);
      el('dialog').showModal();
      zoom(false);
    } catch {
      status('拼图 PNG 生成失败，请重试。');
    }
  };
  el('zoom').onclick = () => zoom(el('dialog').dataset.zoom !== 'actual');
  el('download').onclick = el('dialog-download').onclick = download;
  el('retry').onclick = () => {
    galaxyError = null;
    if (remote()) surveyImagery.release();
    detail = null;
    plannerKey = '';
    ensureGalaxy();
    paint();
  };
  el('close').onclick = () => el('dialog').close();
  el('dialog').addEventListener('close', () => {
    el('stage').replaceChildren();
    if (visible) el('open').focus({ preventScroll: true });
  });
  const resize = new ResizeObserver(() => {
    if (visible) paint();
  });
  resize.observe(skyCanvas);
  const off = onLanguageChange(translate);
  translate();
  syncControls();
  return {
    sourcePicker,
    update,
    downloadSingle,
    setMode,
    get selection() {
      return skySelection();
    },
    get mode() {
      return mode;
    },
    pause() {
      visible = false;
      downloadToken++;
      encoding = false;
      cancelSky();
      clearTimeout(detailTimer);
      detailTimer = 0;
      surveyImagery.release();
      detail = null;
      if (el('dialog').open) el('dialog').close();
    },
    resume() {
      visible = true;
      ensureGalaxy();
      paint();
    },
    dispose() {
      alive = visible = false;
      downloadToken++;
      cancelSky();
      clearTimeout(detailTimer);
      surveyImagery.release();
      resize.disconnect();
      off();
      painter.clear();
      galaxies.clear();
      root.remove();
    },
  };
}
