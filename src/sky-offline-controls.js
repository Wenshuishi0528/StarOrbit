import { t } from './i18n.js';
import { offlineSourceLabel } from './sky-offline.js';

const mb = (bytes) => (bytes / 1e6).toFixed(1);
const angle = (degrees) =>
  degrees < 1 ? (degrees * 60).toFixed(1) + '′' : degrees.toFixed(2) + '°';
const failure = (error) =>
  error?.name === 'QuotaExceededError'
    ? t('本地存储空间不足')
    : error?.name === 'AbortError'
      ? t('下载已暂停')
      : t(error?.message || '离线存储失败');
function button(label, action) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = t(label);
  b.onclick = action;
  return b;
}
function summary(record) {
  const view = record.view;
  const extent =
    view &&
    [
      (2 * Math.atan(Math.tan((view.fovY * Math.PI) / 360) * view.aspect) * 180) / Math.PI,
      view.fovY,
    ]
      .map(angle)
      .join(' × ');
  let center = '';
  if (view && !record.targetId) {
    const [x, y, z] = view.forward;
    const ra = (((Math.atan2(y, x) * 180) / Math.PI + 360) % 360).toFixed(3);
    const dec = ((Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI).toFixed(3);
    center = 'RA ' + ra + '° · Dec ' + dec + '°';
  }
  return [
    t(offlineSourceLabel(record.source)),
    center,
    record.source === 'webb' || (record.source === 'hubble' && !record.fieldOnly)
      ? t('整幅作品')
      : extent,
    record.source === 'hubble'
      ? t('影像层级 {order}（{width} × {height}）', {
          order: record.order,
          width: record.imageWidth,
          height: record.imageHeight,
        })
      : '',
    record.source === 'hubble' && !record.fieldOnly && record.nativeWidth > record.imageWidth
      ? t('原图 {width} × {height}，放大后可下载当前天区的原图细节。', {
          width: record.nativeWidth,
          height: record.nativeHeight,
        })
      : '',
    record.source === 'webb' || record.source === 'hubble'
      ? ''
      : t('约 {value} 角秒/像素', {
          value: (
            (((Math.sqrt(Math.PI / 3) * 180) / Math.PI) * 3600) /
            (512 * 2 ** record.order)
          ).toFixed(2),
        }),
  ]
    .filter(Boolean)
    .join(' · ');
}
export function openSkyOfflineDownload(env, initialPlan, { opener = document.activeElement } = {}) {
  if (!initialPlan) return false;
  const offline = env.skyDetail.offline;
  let plan = initialPlan;
  const dialog = document.createElement('dialog');
  dialog.className = 'resource-dialog';
  dialog.style.cssText =
    'width:min(460px,94vw);height:auto;max-height:90dvh;overflow:auto;padding:1rem;gap:.7rem';
  dialog.setAttribute('aria-label', t('下载离线'));
  const heading = document.createElement('strong'),
    info = document.createElement('p'),
    status = document.createElement('p'),
    actions = document.createElement('div');
  heading.textContent = t(plan.title);
  info.style.margin = status.style.margin = '0';
  status.setAttribute('role', 'status');
  actions.className = 'resource-card-actions';
  const select = document.createElement('select');
  select.setAttribute('aria-label', t('清晰度'));
  for (const [label, value] of [
    ['高清', 'high'],
    ['标准', 'standard'],
  ]) {
    const opt = document.createElement('option');
    opt.textContent = t(label);
    opt.value = value;
    select.append(opt);
  }
  select.hidden =
    initialPlan.source === 'webb' || initialPlan.source === 'hubble' || !initialPlan.order;
  let timer = 0,
    request = 0;
  const save = button('下载离线', async () => {
    save.disabled = true;
    select.disabled = true;
    cancel.hidden = false;
    clearInterval(timer);
    timer = setInterval(() => {
      const job = offline.jobs.get(plan.id);
      if (job)
        status.textContent = t('正在保存 {done}/{total}', { done: job.count, total: job.total });
    }, 250);
    try {
      await offline.save(plan);
      status.textContent = t('已离线保存');
    } catch (error) {
      status.textContent = failure(error);
      save.disabled = false;
      select.disabled = false;
    } finally {
      clearInterval(timer);
      cancel.hidden = true;
    }
  });
  const cancel = button('暂停下载', () => offline.cancel(plan.id));
  cancel.hidden = true;
  const close = button('关闭', () => dialog.close());
  async function refresh() {
    const seq = ++request;
    info.textContent =
      summary(plan) + ' · ' + t('预计 {size} MB', { size: mb(plan.estimatedBytes) });
    status.textContent = t('保存在此浏览器，清理临时缓存时保留。');
    save.disabled = true;
    try {
      const records = await offline.list();
      if (seq !== request || !dialog.open) return;
      const saved = records.find((s) => s.id === plan.id);
      save.disabled = !!saved?.complete;
      if (saved)
        status.textContent = saved.complete
          ? t('已离线保存')
          : t('已保存 {done}/{total}', { done: saved.count, total: saved.total });
    } catch (error) {
      if (seq === request) status.textContent = failure(error);
    }
  }
  select.onchange = () => {
    plan =
      select.value === 'high'
        ? initialPlan
        : offline.planField({
            ...initialPlan,
            id: initialPlan.targetId,
            order: initialPlan.order - 1,
          });
    refresh();
  };
  dialog.addEventListener(
    'close',
    () => {
      clearInterval(timer);
      dialog.remove();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    },
    { once: true }
  );
  actions.append(save, cancel, close);
  dialog.append(heading, info, select, status, actions);
  (document.fullscreenElement || document.body).append(dialog);
  dialog.showModal();
  if (plan.builtin) {
    status.textContent = t('内置离线');
    info.textContent = t('整幅作品');
    select.hidden = save.hidden = true;
  } else refresh();
  return true;
}

export function skyOfflineResourceList(env, parent, closeResources) {
  const list = document.createElement('section');
  parent.append(list);
  let signature = '',
    message = '';
  return async () => {
    const offline = env.skyDetail.offline;
    let rows;
    try {
      rows = await offline.list();
    } catch {
      return;
    }
    if (!list.isConnected) return;
    const key =
      JSON.stringify(rows.map((r) => [r.id, r.count, r.complete, offline.jobs.has(r.id)])) +
      message +
      t('离线星空影像');
    if (key === signature) return;
    signature = key;
    list.replaceChildren();
    if (!rows.length && !message) return;
    const title = document.createElement('strong');
    title.textContent = t('离线星空影像');
    list.append(title);
    for (const row of rows) {
      const p = document.createElement('p'),
        actions = document.createElement('div');
      actions.className = 'resource-card-actions';
      const state = row.complete
        ? t('已离线保存')
        : t('已保存 {done}/{total}', { done: row.count, total: row.total });
      p.textContent = [t(row.title), summary(row), state, mb(row.bytes) + ' MB'].join(' · ');
      const open = button('查看', () => {
        closeResources();
        env.openOfflineSkyField?.(row);
      });
      open.disabled = !row.complete || !env.openOfflineSkyField;
      actions.append(open);
      if (offline.jobs.has(row.id))
        actions.append(button('暂停下载', () => offline.cancel(row.id)));
      else if (!row.complete) {
        const plan = offline.planRecord(row);
        if (plan)
          actions.append(
            button('继续下载', (event) =>
              openSkyOfflineDownload(env, plan, { opener: event.currentTarget })
            )
          );
      }
      const remove = button('删除', async () => {
        remove.disabled = true;
        try {
          await offline.remove(row.id);
          actions.remove();
          p.remove();
          signature = '';
        } catch (error) {
          message = failure(error);
          remove.disabled = false;
          signature = '';
        }
      });
      actions.append(remove);
      list.append(p, actions);
    }
    if (message) {
      const p = document.createElement('p');
      p.setAttribute('role', 'status');
      p.textContent = message;
      list.append(p);
    }
  };
}
