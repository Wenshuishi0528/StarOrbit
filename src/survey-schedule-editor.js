import { t } from './i18n.js';
import { clockText } from './time-format.js';
import {
  arrangeSurveyField,
  surveyPointingInfo,
  SURVEY_END,
  SURVEY_TILES,
} from './survey-lab-math.js';
export { retargetSurveyJobs } from './survey-lab-math.js';

const style = `
.survey-schedule-editor{margin:7px 0 11px;padding:9px 11px;border:1px solid #365064;border-radius:7px;background:#0d2232;font-size:12px}
.survey-schedule-top{display:flex;align-items:center;justify-content:space-between;gap:6px 14px;flex-wrap:wrap}
.survey-schedule-top strong{font-weight:600;color:#d4e9f1}.survey-schedule-time,.survey-schedule-window,.survey-detail-point{font-variant-numeric:tabular-nums}
.survey-schedule-time,.survey-detail-point,.survey-schedule-note{color:#adc2ce}.survey-schedule-time,.survey-schedule-feedback,.survey-schedule-note{margin:4px 0!important}
.survey-schedule-feedback[data-state=warn]{color:#ffd1a6}.survey-schedule-feedback[data-state=ok]{color:#a7dec9}
.survey-lab .survey-arrange[data-repair=true]{color:#d2fff1;background:#185249;border-color:#69b3a4}
.survey-schedule-detail{margin-top:7px;border-top:1px solid #315064;padding-top:6px}.survey-schedule-detail summary{cursor:pointer;color:#c1d7e2}
.survey-schedule-detail ul{margin:4px 0;padding-left:18px;color:#b5d9d1}.survey-detail-point{margin-top:5px!important}
.survey-rowstatus .survey-job-clock,.survey-rowstatus .survey-job-state{display:block}.survey-rowstatus .survey-job-clock{color:#d1e0e7}.survey-schedule-note{font-size:11px}
`;

export function surveyElapsed(value) {
  const seconds = Math.max(0, Math.floor(value));
  return (
    String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  );
}
export function surveyCivilRange(epoch, from, to) {
  const start = clockText(epoch + from * 1000),
    end = clockText(epoch + to * 1000);
  return start + ' – ' + (start.slice(0, 10) === end.slice(0, 10) ? end.slice(-8) : end) + ' UTC+8';
}
const elem = (tag, parent, cls = '') => {
  const n = document.createElement(tag);
  n.className = cls;
  parent.append(n);
  return n;
};
const reasons = {
  field: '请选择本圈中的有效天区。',
  sun: '{tile} 格整圈不满足太阳避让。请换天区，或更换日期重新建圈。',
  earth: '{tile} 格在本圈没有避开地球边缘的窗口。请选择其他天区或新建一圈。',
  duration: '{tile} 格没有能容纳当前时长的完整窗口。请缩短曝光或换天区。',
  sequence:
    '各格都有窗口，但曝光、转向与稳定无法全部排进这一圈。可缩短曝光，或手动安排部分拼图格。',
};

function rowIssues(entry, job, field, orbit) {
  if (!job.enabled) return t('未启用');
  if (!entry) return '';
  const earliest = surveyElapsed(Math.max(0, Math.ceil(entry.readyAt - 1e-8)));
  const notes = entry.issues.map((issue) => {
    if (issue === 'sun') {
      const p = surveyPointingInfo(orbit, field, job.tile);
      return t('太阳角距 {angle}°，本格中心至少需 {limit}°。', {
        angle: p.sunAngle.toFixed(1),
        limit: p.sunMinimum.toFixed(1),
      });
    }
    if (issue === 'earth') return t('整段曝光须落在同一可见窗口。可移动开始时间或缩短曝光。');
    if (issue === 'overlap')
      return t('与前段曝光重叠。按当前指向顺序，最早可从 {start} 开始。', { start: earliest });
    if (issue === 'slew')
      return t('转向与稳定需要 {seconds} 秒，本段最早可从 {start} 开始。', {
        seconds: Math.ceil(entry.slew),
        start: earliest,
      });
    return t('曝光起止均须在本圈内。');
  });
  return notes.length ? notes.join(' ') : t('可执行');
}

export function mountSurveyScheduleEditor(host, { read, apply }) {
  const sheet = elem('style', host);
  sheet.textContent = style;
  const root = elem('section', host, 'survey-schedule-editor');
  root.dataset.survey = 'schedule-assist';
  const head = elem('div', root, 'survey-schedule-top'),
    target = elem('strong', head),
    button = elem('button', head, 'survey-arrange');
  button.type = 'button';
  button.dataset.survey = 'arrange';
  const clock = elem('p', root, 'survey-schedule-time'),
    feedback = elem('p', root, 'survey-schedule-feedback'),
    note = elem('p', root, 'survey-schedule-note');
  feedback.setAttribute('role', 'status');
  feedback.dataset.survey = 'schedule-feedback';
  const detail = elem('details', root, 'survey-schedule-detail'),
    summary = elem('summary', detail),
    point = elem('p', detail, 'survey-detail-point');
  detail.open = true;
  const windowList = elem('ul', detail, 'survey-schedule-window');
  let lastAction = null;
  const signature = (state) =>
    JSON.stringify([
      state.fieldId,
      state.jobs.map((j) => [j.field, j.tile, j.start, j.duration, j.enabled]),
    ]);
  button.onclick = () => {
    const state = read();
    if (state.running) return;
    const result = arrangeSurveyField(state.orbit, state.fields, state.jobs, state.fieldId);
    if (result.ok) apply(result.jobs);
    const next = read();
    lastAction = { orbit: next.orbit, key: signature(next), result };
    refresh();
  };
  function refresh() {
    const state = read(),
      { orbit, fields, jobs, plan, fieldId, selected, running } = state;
    const field = fields.find((f) => f.id === fieldId),
      row = jobs[selected];
    if (!field || !row) return;
    button.disabled = running;
    button.textContent = t('按可见窗口排好四格');
    target.textContent = t('排程天区 {field}', { field: t(field.name) });
    clock.textContent = t('本圈 {range}，经过时间以分:秒显示。', {
      range: surveyCivilRange(orbit.epoch, 0, SURVEY_END),
    });
    note.textContent = t('自动排程沿用四行的曝光时长，排成后启用 A–D 四格。');
    const attempted =
      lastAction?.orbit === orbit && lastAction.key === signature(state) ? lastAction.result : null;
    const placement = attempted || arrangeSurveyField(orbit, fields, jobs, fieldId);
    const complete =
      plan.valid && jobs.every((j, i) => j.enabled && j.field === fieldId && j.tile === i);
    button.dataset.repair = String(!complete && placement.ok);
    feedback.dataset.state = placement.ok && complete ? 'ok' : 'warn';
    if (!placement.ok)
      feedback.textContent = t(reasons[placement.reason], {
        tile: SURVEY_TILES[placement.tile] ?? '',
      });
    else if (attempted) feedback.textContent = t('已按所选天区的可见窗口排好四格。');
    else if (complete) feedback.textContent = t('四格均可在当前排程中完成。');
    else feedback.textContent = t('可保留逐行设置，或使用可见窗口重新安排所选天区的四格。');
    const jobField = fields.find((f) => f.id === row.field);
    if (!jobField) return;
    const tile = SURVEY_TILES[row.tile],
      aim = surveyPointingInfo(orbit, jobField, row.tile);
    summary.textContent = t('第 {index} 行 · {field} {tile} · 指向与可见窗口', {
      index: selected + 1,
      field: t(jobField.name),
      tile,
    });
    point.textContent = t('指向 RA {ra}° / Dec {dec}°，与太阳相距 {sun}°。', {
      ra: aim.ra.toFixed(2),
      dec: aim.dec.toFixed(2),
      sun: aim.sunAngle.toFixed(1),
    });
    const available = jobField.visibility[row.tile];
    windowList.replaceChildren();
    if (available.blockedBySun || !available.windows.length) {
      elem('li', windowList).textContent = t(reasons[available.blockedBySun ? 'sun' : 'earth'], {
        tile,
      });
    } else
      for (const [lo, hi] of available.windows) {
        const a = Math.ceil(lo - 1e-8),
          b = Math.floor(hi + 1e-8);
        if (a > b) continue;
        elem('li', windowList).textContent =
          surveyElapsed(a) + '–' + surveyElapsed(b) + ' · ' + surveyCivilRange(orbit.epoch, a, b);
      }
  }
  function describeRow(status, { job, entry, field }) {
    const { orbit } = read(),
      end = job.start + job.duration;
    status.replaceChildren();
    elem('span', status, 'survey-job-clock').textContent =
      surveyElapsed(job.start) +
      '–' +
      surveyElapsed(end) +
      ' · ' +
      surveyCivilRange(orbit.epoch, job.start, end);
    elem('span', status, 'survey-job-state').textContent = rowIssues(entry, job, field, orbit);
  }
  return {
    refresh,
    describeRow,
    dispose() {
      root.remove();
      sheet.remove();
    },
  };
}
