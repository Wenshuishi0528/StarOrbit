import { Quaternion, Vector3 } from 'three';
import { onLanguageChange, t } from './i18n.js';

const DEG = 180 / Math.PI,
  clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const length = (v) => Math.hypot(...v),
  subtract = (a, b) => a.map((v, i) => v - b[i]);
const vec = (a) => new Vector3().fromArray(a),
  rotation = (a) => new Quaternion().fromArray(a).normalize();
const pilot = (a) => [-a[0], a[1], a[2]];
const fmt = (v, d = 2, unit = '') =>
  Number.isFinite(v) ? v.toFixed(d) + (unit ? ' ' + unit : '') : '—';
const limitText = (v, unit) =>
  Number.isFinite(v) ? String(Number(v.toFixed(3))) + ' ' + unit : '—';
const signed = (v, d = 2) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(d) : '—');
const text = (el, value) => {
  if (el.textContent !== value) el.textContent = value;
};
const number = (v) => Number.isFinite(v);

/** Instrument truth uses the same port and body axes as the flight model.
 * Heading is measured in the orbital plane from along-track toward orbit normal;
 * it is not terrestrial north. Pilot forward/right/up = body -X/+Y/+Z. */
export function deriveFreeFlightInstruments(ship, definition) {
  const q = rotation(ship.quaternion),
    inverse = q.clone().invert(),
    home = rotation(definition.quaternion);
  const forward = vec([-1, 0, 0]).applyQuaternion(q),
    right = vec([0, 1, 0]).applyQuaternion(q),
    up = vec([0, 0, 1]).applyQuaternion(q);
  const arm = vec(subtract(definition.port, definition.position))
    .applyQuaternion(home.clone().invert())
    .applyQuaternion(q);
  const port = vec(ship.position).add(arm),
    target = vec(definition.port).sub(port);
  const targetBody = pilot(target.clone().applyQuaternion(inverse).toArray());
  const velocityBody = pilot(vec(ship.velocity).applyQuaternion(inverse).toArray());
  const heading = (Math.atan2(forward.y, forward.x) * DEG + 360) % 360;
  const pitch = Math.asin(clamp(forward.z, -1, 1)) * DEG;
  // At a vertical attitude heading and bank are undefined. Do not invent a
  // compass direction at the singularity; pitch and the ball remain useful.
  const vertical = Math.hypot(forward.x, forward.y) < 1e-7;
  return {
    forward: forward.toArray(),
    right: right.toArray(),
    up: up.toArray(),
    target: target.toArray(),
    targetBody,
    velocityBody,
    speed: length(ship.velocity),
    heading: vertical ? null : heading,
    pitch,
    roll: vertical ? null : Math.atan2(right.z, up.z) * DEG,
    angularRate: ship.angularVelocity.map((v) => v * DEG),
  };
}

/** Orthographic front hemisphere; a rear target is explicitly pinned to the
 * rim and marked rear, never shown as an apparently aligned forward marker. */
export function projectFlightDirection(direction, quaternion) {
  const magnitude = length(direction);
  if (magnitude < 1e-8) return null;
  const body = vec(direction)
    .multiplyScalar(1 / magnitude)
    .applyQuaternion(rotation(quaternion).invert());
  const front = -body.x >= -1e-10;
  let x = body.y,
    y = -body.z;
  if (!front) {
    const radius = Math.hypot(x, y);
    if (radius < 1e-7) {
      x = 0;
      y = -0.9;
    } else {
      x *= 0.9 / radius;
      y *= 0.9 / radius;
    }
  }
  return { x, y, front, depth: -body.x };
}

export function projectDockingTarget(targetBody, { fov = 52, aspect = 1 } = {}) {
  const [forward, right, up] = targetBody,
    tan = Math.tan((fov * Math.PI) / 360);
  const behind = forward <= 1e-7;
  const depth = Math.max(1e-7, Math.abs(forward));
  const x = right / (depth * tan * aspect),
    y = up / (depth * tan);
  return {
    x,
    y,
    behind,
    visible: !behind && Math.abs(x) <= 1 && Math.abs(y) <= 1,
    forwardDistance: forward,
    bore: { x: 0, y: 0 },
  };
}

const modeNames = {
  off: '手动姿态',
  prograde: '相对顺行',
  retrograde: '相对逆行',
  target: '朝向接口',
  port: '匹配接口姿态',
};
const checkNames = {
  lateral: '横向偏差',
  speed: '接触速度',
  sideSpeed: '横向速度',
  closing: '接近方向',
  angle: '对准误差',
  angularSpeed: '转动速度',
};
const reasonNames = {
  lateral: '横向偏差过大',
  speed: '接触速度过快',
  sideSpeed: '横向速度过快',
  closing: '正在远离接口',
  angle: '姿态偏差过大',
  angularSpeed: '转动速度过快',
  structure: '碰到飞船或空间站结构',
  departure: '退离时反向接触接口',
};

export function createFlightNavball(canvas) {
  const ctx = canvas.getContext('2d'),
    raster = document.createElement('canvas');
  const size = 184;
  raster.width = raster.height = size;
  const paint = raster.getContext('2d'),
    pixels = paint.createImageData(size, size),
    hemisphere = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = (x + 0.5 - size / 2) / (size / 2),
        sy = -(y + 0.5 - size / 2) / (size / 2),
        r2 = sx * sx + sy * sy;
      if (r2 <= 1)
        hemisphere.push({ index: (y * size + x) * 4, x: sx, y: sy, z: Math.sqrt(1 - r2) });
    }
  function draw(ship, nav) {
    const dpr = Math.min(2, window.devicePixelRatio || 1),
      width = 216;
    if (canvas.width !== width * dpr) {
      canvas.width = canvas.height = width * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, width);
    for (const point of hemisphere) {
      const elevation = nav.forward[2] * point.z + nav.right[2] * point.x + nav.up[2] * point.y;
      const light = 0.64 + 0.36 * point.z;
      const color =
        elevation >= 0
          ? [25 + 12 * elevation, 76 + 27 * elevation, 108 + 26 * elevation]
          : [103 - 17 * elevation, 66 - 10 * elevation, 36 - 7 * elevation];
      for (let j = 0; j < 3; j++) pixels.data[point.index + j] = color[j] * light;
      pixels.data[point.index + 3] = 255;
    }
    paint.putImageData(pixels, 0, 0);
    ctx.drawImage(raster, 16, 16, 184, 184);
    const inverse = rotation(ship.quaternion).invert();
    const project = (direction) => {
      const p = vec(direction).applyQuaternion(inverse);
      return { x: 108 + 92 * p.y, y: 108 - 92 * p.z, front: p.x <= 0 };
    };
    function line(points, color, weight = 1) {
      ctx.beginPath();
      let pen = false;
      for (const point of points) {
        const p = project(point);
        if (!p.front) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p.x, p.y);
        else {
          ctx.moveTo(p.x, p.y);
          pen = true;
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.stroke();
    }
    for (const latitude of [-60, -30, 0, 30, 60]) {
      const lat = latitude / DEG;
      line(
        Array.from({ length: 181 }, (_, i) => {
          const a = (i * Math.PI) / 90;
          return [Math.cos(a) * Math.cos(lat), Math.sin(a) * Math.cos(lat), Math.sin(lat)];
        }),
        latitude === 0 ? '#c5dce4' : '#87a6b3a0',
        latitude === 0 ? 1.6 : 0.65
      );
    }
    for (let heading = 0; heading < 360; heading += 45) {
      const a = heading / DEG;
      line(
        Array.from({ length: 91 }, (_, i) => {
          const lat = (i * 2 - 90) / DEG;
          return [Math.cos(a) * Math.cos(lat), Math.sin(a) * Math.cos(lat), Math.sin(lat)];
        }),
        '#88aab276',
        0.65
      );
    }
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [label, direction] of [
      ['T+', [1, 0, 0]],
      ['T−', [-1, 0, 0]],
      ['N+', [0, 1, 0]],
      ['N−', [0, -1, 0]],
      ['R+', [0, 0, 1]],
      ['R−', [0, 0, -1]],
    ]) {
      const p = project(direction);
      if (p.front) {
        ctx.fillStyle = '#def1fb';
        ctx.strokeStyle = '#142735';
        ctx.lineWidth = 3;
        ctx.strokeText(label, p.x, p.y);
        ctx.fillText(label, p.x, p.y);
      }
    }
    ctx.strokeStyle = '#7498a9';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(108, 108, 93, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 36; i++) {
      const a = (i * Math.PI) / 18,
        r = i % 3 ? 98 : 102;
      ctx.beginPath();
      ctx.moveTo(108 + 96 * Math.sin(a), 108 - 96 * Math.cos(a));
      ctx.lineTo(108 + r * Math.sin(a), 108 - r * Math.cos(a));
      ctx.strokeStyle = i % 3 ? '#4b6978' : '#a0b5bf';
      ctx.stroke();
    }
    function marker(vector, color, kind) {
      const p = projectFlightDirection(vector, ship.quaternion);
      if (!p) return;
      const x = 108 + 88 * p.x,
        y = 108 + 88 * p.y;
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.7;
      if (!p.front) ctx.setLineDash([2, 2]);
      ctx.shadowColor = '#03070b';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      if (kind === 'target' || kind === 'anti-target') {
        ctx.moveTo(0, -7);
        ctx.lineTo(7, 0);
        ctx.lineTo(0, 7);
        ctx.lineTo(-7, 0);
        ctx.closePath();
      } else if (kind === 'normal' || kind === 'anti-normal') {
        const sign = kind === 'normal' ? 1 : -1;
        ctx.moveTo(0, -8 * sign);
        ctx.lineTo(7, 5 * sign);
        ctx.lineTo(-7, 5 * sign);
        ctx.closePath();
      } else {
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (['retro', 'anti-target', 'radial-in'].includes(kind)) {
        ctx.beginPath();
        ctx.moveTo(-4, -4);
        ctx.lineTo(4, 4);
        ctx.moveTo(-4, 4);
        ctx.lineTo(4, -4);
        ctx.stroke();
      }
      if (kind === 'pro') {
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(7 * Math.sin(a), -7 * Math.cos(a));
          ctx.lineTo(11 * Math.sin(a), -11 * Math.cos(a));
          ctx.stroke();
        }
      }
      if (kind === 'radial-out' || kind === 'radial-in') {
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(8 * Math.sin(a), -8 * Math.cos(a));
          ctx.lineTo(11 * Math.sin(a), -11 * Math.cos(a));
          ctx.stroke();
        }
      }
      if (kind === 'normal') {
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      if (kind === 'anti-normal') {
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(3, 0);
        ctx.stroke();
      }
      if (!p.front) {
        ctx.font = '9px system-ui';
        ctx.fillText(t('后'), 0, 15);
      }
      ctx.restore();
    }
    if (nav.markers) {
      for (const item of nav.markers) marker(item.direction, item.color, item.kind);
    } else {
      if (nav.speed >= 0.005) {
        marker(ship.velocity, '#c9ed79', 'pro');
        marker(
          ship.velocity.map((v) => -v),
          '#c9ed79',
          'retro'
        );
      }
      marker(nav.target, '#eeb4ef', 'target');
      marker(
        nav.target.map((v) => -v),
        '#eeb4ef',
        'anti-target'
      );
      if (nav.orbitalDirections) {
        marker([0, 0, 1], '#86dceb', 'radial-out');
        marker([0, 0, -1], '#86dceb', 'radial-in');
        marker([0, 1, 0], '#bba7f6', 'normal');
        marker([0, -1, 0], '#bba7f6', 'anti-normal');
      }
    }
    // Fixed aircraft symbol: everything on the ball moves relative to the pilot.
    ctx.strokeStyle = '#ffc877';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(80, 108);
    ctx.lineTo(99, 108);
    ctx.lineTo(104, 113);
    ctx.moveTo(112, 113);
    ctx.lineTo(117, 108);
    ctx.lineTo(136, 108);
    ctx.stroke();
    ctx.fillStyle = '#ffc877';
    ctx.beginPath();
    ctx.arc(108, 108, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return { draw };
}

export function mountFreeFlightInstruments({ host = document.body, onAction } = {}) {
  const root = document.createElement('div');
  root.id = 'freeFlightInstruments';
  root.hidden = true;
  root.innerHTML = `<div class="ffi-stack">
  <section class="ffi-card ffi-docking" aria-labelledby="ffiDockTitle">
   <h3 id="ffiDockTitle" data-fi18n="对接导航"></h3>
   <div class="ffi-dock-state" data-fi="dockState"></div>
   <dl class="ffi-reads ffi-dock-reads">
    <div><dt data-fi18n="接口距离"></dt><dd data-fi="range"></dd></div>
    <div><dt data-fi18n="闭合速度"></dt><dd data-fi="closing"></dd></div>
    <div><dt data-fi18n="右向偏差"></dt><dd data-fi="rightOffset"></dd></div>
    <div><dt data-fi18n="上向偏差"></dt><dd data-fi="upOffset"></dd></div>
    <div><dt data-fi18n="右向漂移"></dt><dd data-fi="rightRate"></dd></div>
    <div><dt data-fi18n="上向漂移"></dt><dd data-fi="upRate"></dd></div>
   </dl>
   <div class="ffi-align" data-fi="alignment"></div>
   <details class="ffi-capture" open><summary data-fi18n="捕获条件"></summary><ul data-fi="checks"></ul></details>
   <p class="ffi-note" data-fi18n="偏差以目标接口为基准；将菱形移到准星中心。"></p>
  </section>
  <section class="ffi-card ffi-navigation" aria-labelledby="ffiNavTitle">
   <h3 id="ffiNavTitle" data-fi18n="姿态导航"></h3>
   <div class="ffi-nav-top"><span data-fi18n="相对空间站"></span><strong data-fi="relativeSpeed"></strong></div>
   <canvas class="ffi-ball" role="img"></canvas>
   <div class="ffi-attitude" data-fi="attitude"></div>
   <div class="ffi-legend"><span class="ffi-velocity" data-fi18n="⊙ 速度 / ⊗ 反向"></span><span class="ffi-target" data-fi18n="◇ 接口 · 虚线为后方"></span></div>
   <details class="ffi-attitude-controls" open><summary data-fi18n="姿态辅助"></summary>
    <div class="ffi-modes">${Object.entries(modeNames)
      .map(
        ([mode, label]) =>
          `<button type="button" data-attitude-mode="${mode}" data-fi18n="${label}"></button>`
      )
      .join('')}</div>
   </details>
   <details class="ffi-more"><summary data-fi18n="轨道与操纵数据"></summary>
    <dl class="ffi-reads"><div><dt data-fi18n="参考轨道高度"></dt><dd data-fi="altitude"></dd></div><div><dt data-fi18n="参考轨道速度"></dt><dd data-fi="orbitSpeed"></dd></div>
    <div><dt data-fi18n="累计 Δv"></dt><dd data-fi="deltaV"></dd></div><div><dt data-fi18n="RCS 加速度"></dt><dd data-fi="acceleration"></dd></div></dl>
    <p class="ffi-note" data-fi="rates"></p><p class="ffi-note" data-fi18n="T 顺轨 · N 轨道法向 · R 径向；航向以顺轨为 0°。"></p>
   </details>
  </section>
 </div>
 <div class="ffi-sight" aria-hidden="true"><i></i><b></b></div>
 <div class="ffi-target-marker" aria-hidden="true"><i></i><span></span></div>`;
  host.append(root);
  const find = (s) => root.querySelector(s),
    reads = Object.fromEntries(
      [...root.querySelectorAll('[data-fi]')].map((el) => [el.dataset.fi, el])
    );
  const navPanel = find('.ffi-navigation'),
    dockPanel = find('.ffi-docking'),
    canvas = find('canvas'),
    sight = find('.ffi-sight'),
    target = find('.ffi-target-marker');
  const navball = createFlightNavball(canvas),
    modes = [...root.querySelectorAll('[data-attitude-mode]')],
    checkRows = {};
  for (const [key, label] of Object.entries(checkNames)) {
    const li = document.createElement('li');
    li.dataset.check = key;
    li.innerHTML = '<span></span><b></b>';
    reads.checks.append(li);
    checkRows[key] = {
      row: li,
      label: li.firstElementChild,
      value: li.lastElementChild,
      key: label,
    };
  }
  let latest = null,
    disposed = false;
  const abort = new AbortController();
  root.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('[data-attitude-mode]');
      if (button && !button.disabled) onAction?.('attitude', button.dataset.attitudeMode);
    },
    { signal: abort.signal }
  );
  function translate() {
    for (const el of root.querySelectorAll('[data-fi18n]')) text(el, t(el.dataset.fi18n));
    for (const row of Object.values(checkRows)) text(row.label, t(row.key));
    if (latest) update(latest);
  }
  function update(data) {
    if (disposed) return;
    latest = data;
    root.hidden = !data?.ship || !data.definition || (!data.navball && data.view !== 'port');
    if (root.hidden) return;
    const {
      ship,
      definition,
      metrics: m = {},
      limits: displayLimits = {},
      projection,
      camera,
      reference = {},
    } = data;
    const limits = m.limits ?? displayLimits;
    const nav = deriveFreeFlightInstruments(ship, definition),
      inDock = data.view === 'port';
    navPanel.hidden = !data.navball;
    dockPanel.hidden = !inDock;
    sight.hidden = target.hidden = !inDock;
    root.classList.toggle('ffi-is-docking', inDock);
    root.classList.toggle('ffi-has-navball', !!data.navball);
    if (data.navball) {
      nav.orbitalDirections =
        Number.isFinite(reference.altitude) && Number.isFinite(reference.speed);
      navball.draw(ship, nav);
      text(reads.relativeSpeed, fmt(nav.speed, 3, 'm/s'));
      const attitude = t('航向 {heading} · 俯仰 {pitch} · 滚转 {roll}', {
        heading: fmt(nav.heading, 0, '°'),
        pitch: signed(nav.pitch, 1) + '°',
        roll: number(nav.roll) ? signed(nav.roll, 1) + '°' : '—',
      });
      text(reads.attitude, attitude);
      canvas.setAttribute('aria-label', t('轨道坐标导航球，{attitude}', { attitude }));
      text(reads.altitude, fmt(reference.altitude, 1, 'km'));
      text(reads.orbitSpeed, fmt(reference.speed, 3, 'km/s'));
      text(reads.deltaV, fmt(ship.deltaV, 2, 'm/s'));
      text(reads.acceleration, fmt(data.rcs?.acceleration ?? ship.rcs?.acceleration, 3, 'm/s²'));
      text(
        reads.rates,
        t('角速度 滚转 {roll} / 俯仰 {pitch} / 偏航 {yaw} °/s', {
          roll: signed(nav.angularRate[0], 2),
          pitch: signed(nav.angularRate[1], 2),
          yaw: signed(nav.angularRate[2], 2),
        })
      );
      for (const button of modes) {
        const mode = button.dataset.attitudeMode,
          disabled =
            !!data.paused ||
            ship.status !== 'free' ||
            ((mode === 'prograde' || mode === 'retrograde') && nav.speed < 0.005);
        button.disabled = disabled;
        button.setAttribute(
          'aria-pressed',
          String(mode === (data.attitudeMode ?? ship.attitudeMode ?? 'off'))
        );
      }
    }
    if (inDock) {
      const collision = ship.status === 'collision';
      const contact = collision && m.impact ? { ...m, ...m.impact } : m;
      const failure = collision ? ship.collisionReason : m.captureReason;
      const state = collision
        ? reasonNames[failure] || '发生碰撞'
        : ship.status === 'docked'
          ? '已停靠'
          : m.captureReady
            ? m.axial <= limits.capturePlane
              ? '等待接口捕获'
              : '条件满足，缓慢接近'
            : reasonNames[failure] || '调整对接姿态';
      text(reads.dockState, t(state));
      reads.dockState.dataset.ready = String(!collision && !!m.captureReady);
      text(reads.range, fmt(m.distance, 2, 'm'));
      text(reads.closing, signed(contact.closing, 3) + ' m/s');
      text(reads.rightOffset, signed(m.offsetPort?.[1], 2) + ' m');
      text(reads.upOffset, signed(m.offsetPort?.[2], 2) + ' m');
      text(reads.rightRate, signed(m.velocityPort?.[1], 3) + ' m/s');
      text(reads.upRate, signed(m.velocityPort?.[2], 3) + ' m/s');
      const angles = m.attitudeError || [null, null, null];
      text(
        reads.alignment,
        t('姿态差 滚转 {roll} / 俯仰 {pitch} / 偏航 {yaw} °', {
          roll: signed(angles[0], 1),
          pitch: signed(angles[1], 1),
          yaw: signed(angles[2], 1),
        })
      );
      const values = {
        lateral: [contact.lateral, limits.captureLateral, 2, 'm'],
        speed: [contact.speed, limits.captureSpeed, 3, 'm/s'],
        sideSpeed: [contact.sideSpeed, limits.captureLateralSpeed, 3, 'm/s'],
        angle: [contact.angle, limits.captureAngle, 1, '°'],
        angularSpeed: [contact.angularSpeed * DEG, limits.captureAngularSpeed * DEG, 2, '°/s'],
      };
      for (const [key, row] of Object.entries(checkRows)) {
        const ok = !!m.captureChecks?.[key];
        row.row.dataset.pass = String(ok);
        const read =
          key === 'closing'
            ? contact.closing >= 0
              ? t('接近')
              : t('远离')
            : fmt(values[key][0], values[key][2]) +
              ' / ≤' +
              limitText(values[key][1], values[key][3]);
        text(row.value, (ok ? '✓ ' : '! ') + read);
      }
      const p = projection || projectDockingTarget(m.targetBody || nav.targetBody, camera);
      const bore = p.bore || { x: 0, y: 0 };
      sight.style.left = (bore.x + 1) * 50 + '%';
      sight.style.top = (1 - bore.y) * 50 + '%';
      let x = number(p.x) ? p.x : bore.x,
        y = number(p.y) ? p.y : bore.y;
      if (p.behind && Math.hypot(x, y) < 1e-5) {
        x = bore.x;
        y = bore.y + 0.85;
      }
      const bounds = p.bounds || { left: -1, right: 1, bottom: -1, top: 1 };
      const marginX = Math.min(0.06, (bounds.right - bounds.left) * 0.1),
        marginY = Math.min(0.06, (bounds.top - bounds.bottom) * 0.1);
      const left = bounds.left + marginX,
        right = bounds.right - marginX,
        bottom = bounds.bottom + marginY,
        top = bounds.top - marginY;
      const offscreen = p.behind || x < left || x > right || y < bottom || y > top;
      if (offscreen) {
        let dx = x - bore.x,
          dy = y - bore.y;
        if (Math.hypot(dx, dy) < 1e-5) dy = 1;
        const edgeX = dx > 0 ? (right - bore.x) / dx : dx < 0 ? (left - bore.x) / dx : Infinity;
        const edgeY = dy > 0 ? (top - bore.y) / dy : dy < 0 ? (bottom - bore.y) / dy : Infinity;
        const scale = Math.max(0, Math.min(p.behind ? Infinity : 1, edgeX, edgeY));
        x = clamp(bore.x + dx * scale, left, right);
        y = clamp(bore.y + dy * scale, bottom, top);
      }
      target.style.left = (x + 1) * 50 + '%';
      target.style.top = (1 - y) * 50 + '%';
      target.dataset.offscreen = String(offscreen);
      target.dataset.behind = String(!!p.behind);
      text(
        target.lastElementChild,
        t(p.behind ? '接口在后方' : offscreen ? '接口在画面外' : '原对接接口')
      );
    }
  }
  const removeLanguage = onLanguageChange(translate);
  translate();
  return {
    root,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      removeLanguage();
      root.remove();
    },
  };
}
