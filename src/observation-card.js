import { t } from './i18n.js';
import { clockText, shortClock } from './time-format.js';
import { compassDirection } from './pass-display.js';
import { durationClock } from './observation-opportunity.js';

export const profileLabel = (kind) =>
  t(
    { example: '北京示例楼顶', saved: '已录入的天际线', flat: '按平坦地平线估算' }[kind] ||
      '按平坦地平线估算'
  );
export function sightDirection(point) {
  return t('朝{direction}（{az}°），抬头 {el}°', {
    direction: t(compassDirection(point.azimuth)),
    az: Math.round(point.azimuth) % 360,
    el: Math.round(point.elevation),
  });
}
export function reasonLabel(reason, opening) {
  // The 1% gate is inside the penumbra, distinct from first contact with the shadow.
  if (reason === 'shadow')
    return t('目标在地影中') + ' · ' + t('航天器受照') + (opening ? ' ↑ ' : ' ↓ ') + '1%';
  const labels = {
    roof: opening ? '越过楼顶或树梢' : '被楼顶或树梢挡住',
    twilight: opening ? '当地天色达到门限' : '当地天色变亮',
    range: opening ? '预报区间开始' : '预报区间结束',
    threshold: opening ? '高于设定的最低仰角' : '低于设定的最低仰角',
  };
  return t(labels[reason] || '候选可观测时段');
}
const emptyReason = (reason) =>
  t(
    {
      roof: '受照时段被此处天际线挡住。',
      twilight: '这次过境期间，当地天色仍较亮。',
      shadow: '这次过境期间，航天器处在地影中。',
      conditions: '当地暮光与航天器受照时段没有重合。',
    }[reason]
  );
export const opportunityStyle = `
.obs-card{color:#e0f1f2;padding:13px 15px;margin-bottom:14px;background:#102932;border:1px solid #3a6370;border-radius:10px;min-width:0}
.obs-card h4{margin:0;font-size:15px;line-height:1.4}.obs-card .obs-context,.obs-card .obs-note{margin:4px 0;color:#afc7cd;font-size:12px;line-height:1.5}
.obs-card .obs-summary{display:block;font-size:17px;margin-top:9px;font-variant-numeric:tabular-nums;color:#b1f3e4}.obs-stages{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px 12px;margin:9px 0}
.obs-stage{min-width:0;border-left:2px solid #3c6870;padding-left:8px}.obs-stage>*{display:block}.obs-stage small,.obs-stage span{color:#b3ced1;font-size:12px}.obs-stage b{font-size:15px;line-height:1.65;font-variant-numeric:tabular-nums}
.obs-card .obs-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:8px}.obs-card .obs-primary{background:#19504e;color:#d5fbf0;border-color:#66ac9d}
.obs-card .obs-picker{width:auto;max-width:100%;margin-top:7px}.obs-card [hidden]{display:none!important}
@media(max-width:550px){.obs-card{padding:10px}.obs-stages{grid-template-columns:1fr;gap:4px}.obs-stage{display:grid;grid-template-columns:5em 4.4em 1fr;align-items:baseline;gap:5px}.obs-stage b{font-size:13px}.obs-stage span{font-size:11px}.obs-card .obs-summary{font-size:15px}}
`;

export function createObservationCard(host, { preview, watch, choose } = {}) {
  const box = document.createElement('section');
  box.className = 'obs-card';
  box.dataset.testid = 'observation-card';
  host.append(box);
  let context = null,
    index = 0;
  const add = (tag, cls, parent = box) => {
    const el = document.createElement(tag);
    el.className = cls;
    parent.append(el);
    return el;
  };
  const title = add('h4', ''),
    siteLine = add('p', 'obs-context'),
    range = add('strong', 'obs-summary'),
    picker = add('select', 'obs-picker');
  const stages = add('div', 'obs-stages'),
    note = add('p', 'obs-note'),
    actions = add('div', 'obs-actions');
  const previewButton = preview ? add('button', '', actions) : null,
    liveButton = watch ? add('button', 'obs-primary', actions) : null;
  for (const button of [previewButton, liveButton]) if (button) button.type = 'button';
  if (previewButton) previewButton.onclick = () => preview(context?.model.windows[index]);
  if (liveButton) liveButton.onclick = () => watch(context?.model.windows[index]);
  picker.onchange = () => {
    index = Number(picker.value);
    render();
    choose?.(context.model.windows[index]);
  };
  function render() {
    if (!context) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const { model, observer, profileKind, minimumElevation, replay } = context;
    title.textContent = t('这次过境的观测窗口');
    siteLine.textContent = [
      observer.name === '北京' ? t('北京') : observer.name,
      profileLabel(profileKind),
      t('最低仰角 {angle}°', { angle: minimumElevation }),
    ].join(' · ');
    if (context.pass.estimated) siteLine.textContent += ' · ' + t('轨道延续演算');
    else if (replay) siteLine.textContent += ' · ' + t('原始星历回放');
    picker.hidden = model.windows.length <= 1;
    picker.setAttribute('aria-label', t('选择候选时段'));
    if (!picker.hidden) {
      picker.replaceChildren(
        ...model.windows.map(
          (w, i) => new Option(i + 1 + ' · ' + shortClock(w.start) + '–' + shortClock(w.end), i)
        )
      );
      picker.value = String(index);
    }
    const window = model.windows[index];
    stages.replaceChildren();
    if (!window) {
      range.textContent = t('此次没有候选观测窗口');
      note.textContent = emptyReason(model.reason);
      stages.hidden = true;
    } else {
      stages.hidden = false;
      range.textContent =
        clockText(window.start) +
        '–' +
        (clockText(window.start).slice(0, 10) === clockText(window.end).slice(0, 10)
          ? shortClock(window.end)
          : clockText(window.end)) +
        ' UTC+8';
      for (const [name, point] of [
        ['首次可找', window.first],
        ['窗口内最高', window.peak],
        ['最后方向', window.last],
      ]) {
        const item = add('div', 'obs-stage', stages);
        add('small', '', item).textContent = t(name);
        add('b', '', item).textContent = shortClock(point.time);
        add('span', '', item).textContent = sightDirection(point);
      }
      note.textContent = [
        t('候选时长 {duration}', { duration: durationClock(window.end - window.start) }),
        reasonLabel(window.startReason, true) + ' → ' + reasonLabel(window.endReason, false),
      ].join(' · ');
    }
    if (previewButton) previewButton.textContent = t('在阳台预演');
    if (liveButton) {
      liveButton.textContent = t('到阳台守候');
      liveButton.disabled = !window || replay || window.end <= Date.now();
      liveButton.title = liveButton.disabled ? t('现在守候只用于尚未结束的候选窗口。') : '';
    }
    actions.hidden = !previewButton && !liveButton;
  }
  return {
    set(value) {
      if (!value || value.model !== context?.model) {
        index = value?.model.windows.findIndex((w) => w.end > (value.reference ?? -Infinity)) ?? 0;
        if (index < 0) index = 0;
      }
      context = value;
      render();
    },
    refresh: render,
  };
}
