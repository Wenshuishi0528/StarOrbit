import { Vector3 } from 'three';
import { getLanguage, onLanguageChange, t } from './i18n.js';
import { getSkyCulture, cultureName } from './sky-cultures.js';
import { getXuntianTarget } from './xuntian-catalog.js';
import { syncStarChartControls } from './star-chart-settings.js';
import { equatorial } from './environment-math.js';
import { sphereHidesDirection } from './star-chart-math.js';

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const label = (record, language) => record?.[language] || record?.en || record?.zh || '';
const themeNames = {
  ziwei: '三垣',
  taiwei: '三垣',
  tianshi: '三垣',
  azuredragon: '东方青龙',
  blacktortoise: '北方玄武',
  whitetiger: '西方白虎',
  vermilionbird: '南方朱雀',
  southern: '近南极 · 明清增补',
};
const memberMaps = new WeakMap();
export function asterismPrimaryMembers(asterism, culture) {
  if (!memberMaps.has(culture)) {
    const map = new Map();
    for (const row of [
      ...culture.stars,
      ...(culture.namedObjects || []),
      ...(culture.otherStars || []),
    ])
      map.set(row.physicalId || (typeof row.id === 'number' ? 'hip:' + row.id : row.id), row);
    memberMaps.set(culture, map);
  }
  const primary = new Set([
    ...(asterism.primaryMemberHips || asterism.lineMemberHips || asterism.memberHips).map(
      (hip) => 'hip:' + hip
    ),
    ...(asterism.primaryMemberObjectIds || asterism.lineMemberObjectIds || []),
  ]);
  return (asterism.members || [])
    .filter((row) => primary.has(row.physicalId))
    .map((row) => ({ ...row, ...memberMaps.get(culture).get(row.physicalId) }));
}

export function skyOverviewTarget(artwork, culture) {
  const targets = new Set(artwork?.targetIds || []),
    points = new Map();
  for (const asterism of culture.asterisms)
    if (targets.has(asterism.targetId))
      for (const member of asterismPrimaryMembers(asterism, culture))
        if (Number.isFinite(member.ra) && Number.isFinite(member.dec))
          points.set(member.physicalId, equatorial(member.ra, member.dec));
  const directions = [...points.values()];
  if (!directions.length) return null;
  const sum = directions.reduce((a, p) => a.map((n, i) => n + p[i]), [0, 0, 0]);
  const length = Math.hypot(...sum);
  const direction = length > 1e-8 ? sum.map((n) => n / length) : directions[0];
  const radius =
    (Math.max(...directions.map((p) => Math.acos(Math.max(-1, Math.min(1, dot(direction, p)))))) *
      180) /
    Math.PI;
  const fov = Math.min(
    110,
    Math.max(
      24,
      (2 * Math.atan(1.2 * Math.tan((Math.min(84, radius + 2) * Math.PI) / 180)) * 180) / Math.PI
    )
  );
  return { direction, fov, radius, memberIds: [...points.keys()] };
}

// This is a real member-star chart, not an artistic reconstruction. Coordinates
// and edges come from the same frozen culture data as the sky and the finder.
export function paintAsterismDiagram(canvas, asterism, culture, language = 'zh') {
  const ctx = canvas.getContext('2d'),
    width = canvas.width,
    height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07101d';
  ctx.fillRect(0, 0, width, height);
  if (!asterism) return;
  const ra = (asterism.ra * Math.PI) / 180,
    dec = (asterism.dec * Math.PI) / 180;
  const forward = equatorial(asterism.ra, asterism.dec);
  const right = [-Math.sin(ra), Math.cos(ra), 0];
  const up = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const project = (position) => {
    const vector = equatorial(...position),
      z = dot(vector, forward);
    return z > 0.001 ? [-dot(vector, right) / z, dot(vector, up) / z] : null;
  };
  const members = asterismPrimaryMembers(asterism, culture);
  const points = members
    .map((star) => ({ star, point: project([star.ra, star.dec]) }))
    .filter((x) => x.point);
  const paths = asterism.lines.map((path) => path.map(project));
  const all = [...points.map((p) => p.point), ...paths.flat().filter(Boolean)];
  if (!all.length) return;
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min(
    (width - 120) / Math.max(0.025, maxX - minX),
    (height - 100) / Math.max(0.025, maxY - minY)
  );
  const pixel = ([x, y]) => [
    width / 2 + (x - (minX + maxX) / 2) * scale,
    height / 2 - (y - (minY + maxY) / 2) * scale,
  ];
  ctx.strokeStyle = '#a39469';
  ctx.lineWidth = 1.7;
  for (const path of paths) {
    ctx.beginPath();
    let started = false;
    for (const p of path) {
      if (!p) {
        started = false;
        continue;
      }
      const [x, y] = pixel(p);
      if (started) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      started = true;
    }
    ctx.stroke();
  }
  ctx.font = '19px sans-serif';
  points.forEach(({ star, point }, i) => {
    const [x, y] = pixel(point),
      radius = Math.max(2.3, Math.min(5.3, 5 - (star.mag ?? 5) * 0.45));
    ctx.fillStyle = '#fff2ce';
    ctx.shadowColor = '#b6c8f0';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(x, y, star.kind === 'deep' ? 9 : radius, 0, Math.PI * 2);
    if (star.kind === 'deep') {
      ctx.strokeStyle = '#b6dcdf';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else ctx.fill();
    ctx.shadowBlur = 0;
    if (points.length <= 18) {
      ctx.fillStyle = '#d7dfec';
      ctx.fillText(String(i + 1), Math.min(width - 30, x + 9), Math.max(22, y - 9));
    }
  });
  ctx.fillStyle = '#8796ab';
  ctx.font = '17px sans-serif';
  ctx.fillText(t('北'), width / 2 - 9, 24);
  ctx.fillText(t('东'), 14, height / 2);
  canvas.setAttribute(
    'aria-label',
    label(asterism, language) +
      ': ' +
      members.map((s) => label(s, language) || s.physicalId).join(', ')
  );
}

export function installSkyCultureControls(sim) {
  const $ = (id) => document.getElementById(id),
    env = sim.environment;
  const culture = getSkyCulture('chinese'),
    groupSelect = $('chineseSkyGroup'),
    objectSelect = $('chineseSkyObject');
  const artwork = env.chineseSkyArt?.images || [];
  const individualTargets = new Set(
    artwork
      .filter((record) => record.kind === 'asterisms')
      .flatMap((record) => record.targetIds || [])
  );
  const illustratedFigures = new Set(
    artwork
      .filter((record) => record.kind === 'asterisms')
      .map((record) => record.original || record.imageId)
  );
  const illustratedOverviews = new Set(
    artwork
      .filter((record) => record.kind === 'symbols')
      .map((record) => record.original || record.imageId)
  );
  function selectedOverview() {
    if (!groupSelect.value) return null;
    const groupTargets = new Set(
      culture.asterisms
        .filter((record) => record.groupId === groupSelect.value)
        .map((record) => record.targetId)
    );
    return artwork.find(
      (record) => record.kind === 'symbols' && record.targetIds?.some((id) => groupTargets.has(id))
    );
  }
  function updateOverviewControl() {
    $('observeChineseOverview').disabled = !selectedOverview();
    $('observeChineseOverview').title = selectedOverview() ? '' : t('请选择已有总览插画的天区。');
  }
  let selected = culture.asterisms.find((a) => a.zh === '北斗') || culture.asterisms[0];
  let signature = '';
  const chooseObject = () => {
    selected = culture.asterisms.find((a) => a.targetId === objectSelect.value) || selected;
    env.skyCultureFocus = env.settings.skyCulture === 'chinese' ? selected?.targetId : null;
    const language = getLanguage();
    paintAsterismDiagram($('chineseSkyDiagram'), selected, culture, language);
    if (!selected) return;
    const group = culture.groups.find((g) => g.id === selected.groupId);
    const members = asterismPrimaryMembers(selected, culture);
    const memberNames = members.map((s, i) => `${i + 1}. ${label(s, language) || s.physicalId}`);
    const art = artwork.find(
      (record) => record.kind === 'asterisms' && record.targetIds?.includes(selected.targetId)
    );
    const meaning = art?.meaning?.[language] || art?.meaning?.en || art?.meaning?.zh || '';
    $('chineseSkyArtMeaning').textContent = meaning ? t('图意：{meaning}', { meaning }) : '';
    $('chineseSkyArtMeaning').hidden = !meaning;
    $('chineseSkyObjectInfo').textContent = [
      label(group, language),
      t('{count} 个已识别成员', { count: members.length }),
      (selected.addedMemberHips?.length || 0) + (selected.addedMemberObjectIds?.length || 0)
        ? t('另有 {count} 个已识别增补对象', {
            count:
              (selected.addedMemberHips?.length || 0) +
              (selected.addedMemberObjectIds?.length || 0),
          })
        : '',
      selected.isSubsidiary ? t('附属星官') : '',
      selected.primaryMemberStatus?.state?.startsWith('source-') ||
      selected.primaryMemberStatus?.uncertainPhysicalIds?.length
        ? t('来源中的成员数量或识别存在差异，详情见资料说明。')
        : '',
      individualTargets.has(selected.targetId)
        ? t('已提供单独艺术插画')
        : t('此星官提供成员星图与连线，暂无单独艺术插画。'),
      memberNames.join(' · '),
    ]
      .filter(Boolean)
      .join(' · ');
    $('chineseSkyStatus').textContent = '';
    updateOverviewControl();
    sim.dirty = true;
  };
  function listObjects() {
    const records = culture.asterisms.filter(
      (a) => !groupSelect.value || a.groupId === groupSelect.value
    );
    objectSelect.replaceChildren(
      ...records.map((a) => new Option(label(a, getLanguage()), a.targetId))
    );
    if (records.some((a) => a.targetId === selected?.targetId))
      objectSelect.value = selected.targetId;
    chooseObject();
  }
  function refresh() {
    const value = env.settings.skyCulture || 'western',
      language = getLanguage();
    const next = value + ':' + language;
    $('skyCultureNote').textContent =
      value === 'chinese'
        ? t('清代通行整理 · 三垣二十八宿；近南极增补单列。图像为现代教学意象。')
        : t('88 个现代星座 · 名称、连线与教学插画。');
    $('chineseSkyExplorer').hidden = value !== 'chinese';
    const displayHint =
      env.settings.stars === false
        ? t('恒星显示已关闭，插画也会隐藏。')
        : !env.settings.starChartEnabled
          ? t('主画面星图显示已关闭；巡天取景与照片可分别开启。')
          : '';
    $('chineseSkyDisplayHint').textContent = displayHint;
    $('chineseSkyDisplayHint').hidden = value !== 'chinese' || !displayHint;
    $('skyCultureNamesLabel').textContent = t(value === 'chinese' ? '星官名称' : '星座名称');
    $('skyCultureLinesLabel').textContent = t(value === 'chinese' ? '星官连线' : '星座连线');
    $('skyCultureArtLabel').textContent = t(
      value === 'chinese' ? '星官插画' : '星座图像 · 教学示意'
    );
    $('chineseSkyArtCoverage').textContent = t(
      '星官目录共 {records} 条；按来源已识别成员显示星点和连线。已提供 {figures} 幅星官插画、{overviews} 幅总览插画。总览可重叠显示，透明度可调。',
      {
        records: culture.asterisms.length,
        figures: illustratedFigures.size,
        overviews: illustratedOverviews.size,
      }
    );
    if (next === signature) return;
    if (signature && signature.split(':')[0] !== value) {
      env.skyCultureFocus = null;
      sim.xuntian?.onSkyCultureChange?.();
    }
    const previousGroup =
      signature && signature.split(':')[0] === value ? groupSelect.value : selected?.groupId || '';
    signature = next;
    groupSelect.replaceChildren(new Option(t('全部天区'), ''));
    const groups = new Map();
    for (const group of culture.groups) {
      const key = themeNames[group.theme] || '三垣';
      if (!groups.has(key)) {
        const node = document.createElement('optgroup');
        node.label = t(key);
        groupSelect.append(node);
        groups.set(key, node);
      }
      groups.get(key).append(new Option(label(group, language), group.id));
    }
    groupSelect.value = previousGroup;
    listObjects();
    if (value !== 'chinese') env.skyCultureFocus = null;
  }
  function locateMain() {
    if (!selected || !sim.current) return;
    if (sim.freeFlight?.active || sim.sceneBusy || sim.missions?.busy) {
      $('chineseSkyStatus').textContent = t('请先退出独立飞行或等待场景恢复。');
      return;
    }
    const direction = equatorial(selected.ra, selected.dec);
    const orbit = sim.view === 'orbit',
      camera = orbit ? sim.spaceCamera : sim.api.camera;
    const controls = orbit ? sim.orbitControls : sim.api.controls;
    const local = orbit ? direction : sim.current.basis.map((axis) => dot(axis, direction));
    const distance = Math.max(20, camera.position.distanceTo(controls.target));
    controls.stopMotion();
    controls.target.copy(camera.position).addScaledVector(new Vector3(...local), distance);
    camera.lookAt(controls.target);
    controls.update();
    sim.cameraFocus?.resetAnchor();
    env.settings.starChartEnabled = true;
    syncStarChartControls(env.settings);
    env.save();
    const eye = sim.spaceCamera.position.toArray();
    $('chineseSkyStatus').textContent = sphereHidesDirection(
      direction,
      eye.map((v) => -v),
      6371
    )
      ? t('当前目标被地球遮挡；视线已定位，时刻保持不变。')
      : t('已定位；拖动继续探索，使用“巡天定位”可放大星空细节。');
    sim.dirty = true;
  }
  groupSelect.onchange = listObjects;
  objectSelect.onchange = chooseObject;
  $('lookAtChineseSky').onclick = locateMain;
  $('observeChineseSky').onclick = () => {
    const target = selected && getXuntianTarget(selected.targetId, getLanguage(), 'chinese');
    if (!target || !sim.xuntian?.observeTarget(target, { annotations: true }))
      $('chineseSkyStatus').textContent = t('巡天取景需选择中国空间站任务。');
  };
  $('observeChineseOverview').onclick = () => {
    const overview = selectedOverview(),
      target = skyOverviewTarget(overview, culture);
    if (!target || !sim.xuntian?.observeRegion({ ...target, artworkId: overview.original })) {
      $('chineseSkyStatus').textContent = t('巡天取景需选择中国空间站任务。');
      return;
    }
    env.settings.chineseSymbolArt = true;
    syncStarChartControls(env.settings);
    env.skyCultureFocus = null;
    env.save();
    const group = culture.groups.find((record) => record.id === groupSelect.value);
    const name = ['ziwei', 'taiwei', 'tianshi'].includes(group.theme)
      ? label(group, getLanguage())
      : t(themeNames[group.theme]);
    $('chineseSkyStatus').textContent = t('已打开 {name} 总览；可在取景窗拖动与变焦。', { name });
    sim.dirty = true;
  };
  window.addEventListener('starorbit-sky-culture', refresh);
  $('stars')?.addEventListener('change', refresh);
  onLanguageChange(refresh);
  refresh();
  return {
    refresh,
    select(id) {
      const record = culture.asterisms.find((a) => a.targetId === id);
      if (!record) return false;
      selected = record;
      groupSelect.value = record.groupId;
      listObjects();
      return true;
    },
    get selected() {
      return selected;
    },
    get culture() {
      return cultureName(env.settings.skyCulture, getLanguage());
    },
  };
}
