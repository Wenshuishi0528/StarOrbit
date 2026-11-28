import { onLanguageChange, t } from './i18n.js';

const key = 'starorbit-aim-markers-v1';
const profiles = {
  xuntian: { shape: 'cross', size: 23, color: '#a8efdc' },
  ground: { shape: 'cross', size: 23, color: '#b5e6eb' },
  interstellar: { shape: 'cross', size: 21, color: '#b6e7ec' },
  docking: { shape: 'target', size: 90, color: '#8fe6ee' },
  camera: { shape: 'plus', size: 18, color: '#b9eadc' },
  flight: { shape: 'target', size: 64, color: '#a9e9d6' },
};
const shapes = new Map([
  ['cross', '断开十字'],
  ['plus', '十字'],
  ['ring', '空心圆'],
  ['target', '环形十字'],
  ['dot', '圆点'],
  ['hidden', '关闭标记'],
]);
const mounted = new Set();
let preferences;
function readPreferences() {
  if (!preferences) {
    try {
      preferences = JSON.parse(localStorage.getItem(key));
    } catch {}
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences))
      preferences = {};
  }
  return preferences;
}

export function normalizeAimMarker(value, profile = 'xuntian') {
  const defaults = profiles[profile] || profiles.xuntian;
  return {
    shape: shapes.has(value?.shape) ? value.shape : defaults.shape,
    size: Number.isFinite(value?.size)
      ? Math.round(Math.min(120, Math.max(6, value.size)))
      : defaults.size,
    color:
      typeof value?.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
        ? value.color.toLowerCase()
        : defaults.color,
    outline: value?.outline !== false,
  };
}

// The on-screen glyph and annotated eyepiece photos share this geometry in logical pixels.
export function drawAimMarker(ctx, x, y, settings, scale = 1) {
  const { shape, size, color, outline } = settings;
  if (shape === 'hidden') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const stroke = Math.max(1.25, Math.min(3, size * 0.067));
  const r = Math.max(1, (size - stroke) / 2);
  ctx.beginPath();
  if (shape === 'dot' || shape === 'ring' || shape === 'target') {
    ctx.arc(0, 0, shape === 'target' ? r * 0.68 : r, 0, Math.PI * 2);
  }
  if (shape === 'cross' || shape === 'plus' || shape === 'target') {
    const gap = shape === 'plus' ? 0 : r * (shape === 'target' ? 0.48 : 0.38);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(dx * gap, dy * gap);
      ctx.lineTo(dx * r, dy * r);
    }
  }
  ctx.lineCap = 'round';
  if (outline) {
    ctx.strokeStyle = '#111820';
    ctx.lineWidth = stroke + 2;
    ctx.stroke();
  }
  ctx.fillStyle = ctx.strokeStyle = color;
  ctx.lineWidth = stroke;
  if (shape === 'dot') ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

export function mountAimMarker({
  marker,
  mirrors = [],
  host,
  profile,
  title = '瞄准标记',
  initial,
}) {
  const prefs = readPreferences();
  let settings = normalizeAimMarker(prefs[profile] ?? initial, profile);
  const controls = document.createElement('details');
  controls.className = 'aim-marker-settings';
  controls.dataset.markerProfile = profile;
  controls.innerHTML = `<summary></summary><div class="aim-marker-fields">
    <label><span data-marker-copy="形状"></span><select data-marker-shape></select></label>
    <label><span data-marker-copy="标记颜色"></span><input type="color" data-marker-color></label>
    <span class="aim-marker-preview" role="img"><i></i></span>
    <label class="aim-marker-range"><span data-marker-copy="标记大小"></span><input type="range" min="6" max="120" step="1" data-marker-size><output></output></label>
    </div><label class="aim-marker-outline"><input type="checkbox" data-marker-outline> <span data-marker-copy="深色描边"></span></label>
    <div class="aim-marker-actions"><button type="button" data-marker-all></button><button type="button" data-marker-reset></button></div><span class="aim-marker-status" role="status"></span>`;
  host.append(controls);
  const shape = controls.querySelector('select'),
    color = controls.querySelector('[type=color]'),
    size = controls.querySelector('[type=range]'),
    outline = controls.querySelector('[type=checkbox]'),
    status = controls.querySelector('[role=status]');
  for (const [value, label] of shapes) shape.add(new Option(t(label), value));
  const glyphs = [marker, ...mirrors, controls.querySelector('.aim-marker-preview i')].map(
    (element) => {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      element.classList.add('aim-marker-glyph');
      element.setAttribute('aria-hidden', 'true');
      element.append(canvas);
      return { element, canvas };
    }
  );
  function render() {
    shape.value = settings.shape;
    color.value = settings.color;
    size.value = String(settings.size);
    outline.checked = settings.outline;
    controls.querySelector('output').textContent = settings.size + ' px';
    for (const { element, canvas } of glyphs) {
      element.dataset.shape = settings.shape;
      element.hidden = settings.shape === 'hidden';
      if (element.hidden) continue;
      const preview = element.parentElement.classList.contains('aim-marker-preview');
      const diameter = preview ? Math.min(settings.size, 39) : settings.size;
      const side = diameter + 4,
        resolution = Math.min(devicePixelRatio || 1, 3);
      canvas.style.width = canvas.style.height = side + 'px';
      canvas.width = canvas.height = Math.ceil(side * resolution);
      const ctx = canvas.getContext('2d');
      ctx.scale(canvas.width / side, canvas.height / side);
      drawAimMarker(ctx, side / 2, side / 2, settings, diameter / settings.size);
    }
  }
  const entry = {
    profile,
    update(value) {
      settings = normalizeAimMarker(value, profile);
      render();
    },
  };
  function save(everywhere = false) {
    const targets = everywhere ? Object.keys(profiles) : [profile];
    for (const target of targets) prefs[target] = { ...settings };
    try {
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch {}
    for (const other of mounted) {
      if (other !== entry && targets.includes(other.profile)) other.update(settings);
    }
  }
  const change = () => {
    settings = normalizeAimMarker(
      {
        shape: shape.value,
        size: Number(size.value),
        color: color.value,
        outline: outline.checked,
      },
      profile
    );
    status.textContent = '';
    render();
  };
  controls.addEventListener('input', change);
  controls.addEventListener('change', () => {
    change();
    save();
  });
  controls.querySelector('[data-marker-all]').onclick = () => {
    save(true);
    status.textContent = t('已应用到所有瞄准标记');
  };
  controls.querySelector('[data-marker-reset]').onclick = () => {
    entry.update();
    save();
    status.textContent = '';
  };
  function translate() {
    controls.querySelector('summary').textContent = t(title);
    controls.querySelector('[role=img]').setAttribute('aria-label', t('外观预览'));
    for (const item of controls.querySelectorAll('[data-marker-copy]'))
      item.textContent = t(item.dataset.markerCopy);
    for (const option of shape.options) option.textContent = t(shapes.get(option.value));
    controls.querySelector('[data-marker-all]').textContent = t('应用到所有瞄准标记');
    controls.querySelector('[data-marker-reset]').textContent = t('恢复默认');
    if (status.textContent) status.textContent = t('已应用到所有瞄准标记');
  }
  mounted.add(entry);
  render();
  translate();
  const offLanguage = onLanguageChange(translate);
  return {
    get settings() {
      return settings;
    },
    dispose() {
      offLanguage();
      mounted.delete(entry);
      controls.remove();
      for (const { canvas } of glyphs) canvas.remove();
    },
  };
}
