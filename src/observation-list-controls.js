import { t } from './i18n.js';
import { inputText, parseLocalTime } from './time-format.js';
import { passClockParts } from './pass-display.js';

export const observationListStyle = `
.observation-list-controls{border-top:1px solid #304c63;padding-top:12px;margin-top:12px}.observation-list-controls h4{margin:0 0 10px}.observation-list-fields{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.observation-list-fields label{display:flex;flex-direction:column;gap:6px}.observation-list-fields label:last-child{flex-direction:row;align-items:center}.observation-list-fields input[type=checkbox]{width:auto}.observation-list-actions{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.observation-list-table{max-height:360px;overflow:auto;margin:12px 0;border:1px solid #304c63;border-radius:8px}.observation-list-table[hidden]{display:none}.observation-list-table table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.observation-list-table th{position:sticky;top:0;background:#102235;color:#b7cedf;text-align:left}.observation-list-table th,.observation-list-table td{padding:9px 10px;border-bottom:1px solid #263e52;white-space:nowrap}.observation-list-table tr[aria-selected=true]{background:#18475b}.observation-list-table button{font:inherit;cursor:pointer;color:#a7edff;background:transparent;border:0;padding:0;text-decoration:underline}.observation-list-table small{display:block;color:#e7bd7d}
`;
export function createObservationListControls(parent, { start, changed, calculate }) {
  const root = document.createElement('div');
  root.className = 'observation-list-controls';
  root.innerHTML = `<h4 data-t="条件列表"></h4><div class="observation-list-fields"><label><span data-t="截止时间（不含） · UTC+8"></span><input type="datetime-local" step="1" data-list-end></label><label><input type="checkbox" data-list-visible><span data-t="仅看最高点适合目视观测"></span></label></div><div class="observation-list-actions"><button type="button" data-days="30" data-t="未来30天"></button><button type="button" data-days="90" data-t="未来90天"></button><button type="button" data-days="year" data-t="到今年年底"></button><button type="button" data-list-calculate data-t="生成条件列表"></button></div><p class="pass-note bal-note" data-t="使用上方的基准时间、最高仰角和昼夜条件；目视条件为最高点受阳光照射且太阳低于地平线6°，阳台遮挡另行显示。"></p>`;
  parent.append(root);
  const end = root.querySelector('[data-list-end]'),
    visible = root.querySelector('[data-list-visible]'),
    button = root.querySelector('[data-list-calculate]');
  const setEnd = (days) => {
    const time = start();
    if (!Number.isFinite(time)) return;
    const year = Number(inputText(time).slice(0, 4));
    end.value = inputText(
      days === 'year' ? Date.UTC(year + 1, 0, 1) - 8 * 3600000 : time + Number(days) * 86400000
    );
  };
  setEnd(30);
  for (const preset of root.querySelectorAll('[data-days]'))
    preset.onclick = () => {
      setEnd(preset.dataset.days);
      changed();
    };
  end.oninput = visible.oninput = changed;
  button.onclick = calculate;
  const refresh = () => {
    for (const n of root.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t);
  };
  refresh();
  return {
    read: () => ({ list: true, end: parseLocalTime(end.value), visibleOnly: visible.checked }),
    setBusy: (busy) => {
      button.disabled = busy;
    },
    refresh,
  };
}
export function renderObservationList(host, result, selected, choose, models = null) {
  const scrollTop = host.scrollTop,
    focusedIndex = host.contains(document.activeElement)
      ? document.activeElement?.dataset.passIndex
      : null;
  host.replaceChildren();
  host.hidden = !result?.query?.list || !result.passes.length;
  if (host.hidden) return;
  const table = document.createElement('table'),
    head = document.createElement('thead'),
    header = document.createElement('tr');
  for (const key of [
    '日期',
    '最高点时刻 · UTC+8',
    '最高仰角',
    '最高点观测条件',
    ...(models ? ['阳台观测窗口'] : []),
  ]) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = t(key);
    header.append(th);
  }
  head.append(header);
  table.append(head);
  const body = document.createElement('tbody');
  result.passes.forEach((pass, index) => {
    const row = document.createElement('tr'),
      parts = passClockParts(pass.maximum.time),
      q = pass.maximum;
    row.setAttribute('aria-selected', String(index === selected));
    const cell = (value) => {
      const td = document.createElement('td');
      td.textContent = value;
      row.append(td);
      return td;
    };
    const date = cell(parts.date);
    if (pass.estimated) {
      const note = document.createElement('small');
      note.textContent = t('轨道延续演算');
      date.append(note);
    }
    const time = cell(''),
      button = document.createElement('button');
    button.type = 'button';
    button.textContent = parts.clock;
    button.dataset.passIndex = index;
    button.onclick = () => choose(index);
    time.append(button);
    cell(`${q.elevation.toFixed(1)}°`);
    cell(
      t(
        q.illumination <= 0.01
          ? '地影中'
          : q.sunElevation < -6
            ? '受光 · 暗夜'
            : q.sunElevation < 0
              ? '受光 · 暮光'
              : '受光 · 白天'
      )
    );
    if (models) cell(t(models[index]?.windows.length ? '含候选可观测时段' : '无候选可观测时段'));
    body.append(row);
  });
  table.append(body);
  host.append(table);
  host.scrollTop = scrollTop;
  if (focusedIndex != null)
    host.querySelector(`[data-pass-index="${focusedIndex}"]`)?.focus({ preventScroll: true });
}
