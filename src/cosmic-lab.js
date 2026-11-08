import { getLanguage, onLanguageChange } from './i18n.js';
import { COSMIC_TOPICS } from './cosmic-content.js';
import {
  COSMIC_DEFAULTS,
  normalizeCosmicParams,
  cosmicMetrics,
  pulseProfile,
} from './cosmic-math.js';
import { createCosmicRenderer } from './cosmic-renderer.js';
import { cosmicUI } from './cosmic-ui-copy.js';
import { cosmicStyle } from './cosmic-lab-style.js';

const STORAGE = 'starorbit-cosmic-v1';
const controls = {
  blackhole: [
    ['bhMass', 'massBH', 3, 100, 1, 'M☉'],
    ['bhInclination', 'inclination', 10, 85, 1, '°'],
  ],
  neutron: [
    ['nsMass', 'massNS', 1, 2.2, 0.05, 'M☉'],
    ['nsRadius', 'radius', 10, 14, 0.1, 'km'],
  ],
  pulsar: [
    ['period', 'period', 0.05, 2, 0.05, 's'],
    ['tilt', 'tilt', 5, 85, 1, '°'],
    ['inclination', 'observer', 10, 85, 1, '°'],
  ],
  meteor: [
    ['meteorSpeed', 'meteorSpeed', 11, 72, 1, 'km/s'],
    ['meteorAngle', 'meteorAngle', 10, 80, 1, '°'],
  ],
  supernova: [],
};
const safePhase = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
export function normalizeCosmicState(value = {}) {
  return {
    topic: COSMIC_TOPICS.some((item) => item.id === value?.topic) ? value.topic : 'blackhole',
    phase: safePhase(value?.phase),
    params: normalizeCosmicParams(value?.params || COSMIC_DEFAULTS),
  };
}

export function mountCosmicLab(container, sim) {
  const root = document.createElement('section');
  root.className = 'cosmic-lab';
  root.dataset.testid = 'cosmic-lab';
  container.append(root);
  const style = document.createElement('style');
  style.textContent = cosmicStyle;
  root.append(style);
  const make = (tag, parent, className = '') => {
    const el = document.createElement(tag);
    el.className = className;
    parent.append(el);
    return el;
  };
  const ui = (key) => cosmicUI(key, getLanguage());
  const text = (value) =>
    typeof value === 'string' ? value : value?.[getLanguage()] || value?.en || value?.zh || '';
  let state = normalizeCosmicState();
  try {
    state = normalizeCosmicState(JSON.parse(localStorage.getItem(STORAGE)));
  } catch {}
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let running = !reduced.matches,
    visible = false,
    disposed = false,
    animation = 0,
    lastWall = 0,
    lastReadout = -Infinity,
    viewer = null,
    captureBusy = false,
    navigating = false;
  const topic = () => COSMIC_TOPICS.find((item) => item.id === state.topic);
  const copy = () => topic().copy[getLanguage()] || topic().copy.en;
  const persist = () => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {}
  };

  const intro = make('div', root, 'cosmic-intro'),
    heading = make('div', intro);
  make('div', heading, 'cosmic-eyebrow').textContent = 'STARORBIT / UNIVERSE';
  const title = make('h3', heading),
    subtitle = make('p', heading);
  const tabs = make('div', root, 'cosmic-topics');
  tabs.setAttribute('role', 'tablist');
  const tabButtons = new Map();
  for (const [index, item] of COSMIC_TOPICS.entries()) {
    const button = make('button', tabs);
    button.type = 'button';
    button.dataset.cosmicTopic = item.id;
    button.id = 'cosmic-topic-' + item.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'cosmic-topic-panel');
    make('span', button, 'cosmic-number').textContent = String(index + 1).padStart(2, '0');
    const label = make('span', button);
    tabButtons.set(item.id, { button, label });
    button.onclick = () => selectTopic(item.id);
    button.onkeydown = (event) => {
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? COSMIC_TOPICS.length - 1
            : event.key === 'ArrowRight'
              ? (index + 1) % COSMIC_TOPICS.length
              : event.key === 'ArrowLeft'
                ? (index + COSMIC_TOPICS.length - 1) % COSMIC_TOPICS.length
                : null;
      if (next === null) return;
      event.preventDefault();
      selectTopic(COSMIC_TOPICS[next].id);
      tabButtons.get(state.topic).button.focus();
    };
  }
  const layout = make('div', root, 'cosmic-layout');
  layout.id = 'cosmic-topic-panel';
  layout.setAttribute('role', 'tabpanel');
  const left = make('div', layout),
    right = make('div', layout);
  const visual = make('div', left, 'cosmic-visual'),
    canvas = make('canvas', visual, 'cosmic-canvas');
  canvas.dataset.cosmic = 'canvas';
  canvas.tabIndex = 0;
  const visualNote = make('div', visual, 'cosmic-visual-note'),
    badge = make('span', visualNote),
    sceneTitle = make('strong', visualNote);
  const failure = make('div', visual, 'cosmic-error');
  failure.hidden = true;
  const actions = make('div', left, 'cosmic-actions');
  const action = (key, handler, cls = '') => {
    const button = make('button', actions, cls);
    button.type = 'button';
    button.dataset.cosmic = key;
    button.onclick = handler;
    return button;
  };
  const play = action(
    'play',
    () => {
      running = !running;
      lastWall = 0;
      updatePlay();
      schedule();
    },
    'cosmic-primary'
  );
  const restart = action('restart', () => {
    state.phase = 0;
    lastWall = 0;
    persist();
    paint();
  });
  const resetCamera = action('camera', () => {
    viewer?.resetView();
    paint();
  });
  const snapshot = action('capture', capture);
  const progress = make('label', left, 'cosmic-progress'),
    progressLabel = make('span', progress);
  const seek = make('input', progress);
  seek.type = 'range';
  seek.min = '0';
  seek.max = '1000';
  seek.step = '1';
  seek.dataset.cosmic = 'progress';
  const percent = make('output', progress),
    stage = make('p', left, 'cosmic-stage');
  seek.oninput = () => {
    state.phase = Number(seek.value) / 1000;
    running = false;
    updatePlay();
    lastWall = 0;
    paint();
  };
  seek.onchange = persist;
  const hint = make('p', left, 'cosmic-hint'),
    slowNote = make('p', left, 'cosmic-hint');
  const metrics = make('dl', left, 'cosmic-metrics');
  metrics.dataset.cosmic = 'metrics';
  const curve = make('div', left, 'cosmic-curve'),
    curveHead = make('div', curve, 'cosmic-curve-head');
  const curveTitle = make('span', curveHead),
    curveScale = make('span', curveHead);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 80');
  curve.append(svg);
  svg.setAttribute('role', 'img');
  const curveLine = document.createElementNS(NS, 'path');
  curveLine.setAttribute('fill', 'none');
  curveLine.setAttribute('stroke', '#74d6e9');
  curveLine.setAttribute('stroke-width', '2');
  svg.append(curveLine);
  const phaseLine = document.createElementNS(NS, 'line');
  phaseLine.setAttribute('y1', '2');
  phaseLine.setAttribute('y2', '78');
  phaseLine.setAttribute('stroke', '#e9bb71');
  svg.append(phaseLine);
  const curveNote = make('p', curve);
  const parameterPanel = make('div', right, 'cosmic-panel'),
    parameterTitle = make('h4', parameterPanel),
    parameterBody = make('div', parameterPanel);
  parameterPanel.append(curve);
  const sciencePanel = make('div', right, 'cosmic-panel'),
    scienceTitle = make('h4', sciencePanel),
    summary = make('p', sciencePanel),
    facts = make('ul', sciencePanel, 'cosmic-facts'),
    modelNote = make('p', sciencePanel, 'cosmic-model-note');
  const skyPanel = make('div', right, 'cosmic-panel'),
    skyTitle = make('h4', skyPanel),
    targets = make('div', skyPanel);
  const sources = make('details', right, 'cosmic-panel cosmic-sources'),
    sourceTitle = make('summary', sources),
    sourceLinks = make('div', sources);
  const status = make('p', root, 'cosmic-status');
  status.setAttribute('role', 'status');

  function selectTopic(id) {
    if (!COSMIC_TOPICS.some((item) => item.id === id)) return;
    state.topic = id;
    state.phase = 0;
    lastWall = 0;
    status.textContent = '';
    viewer?.resetView();
    translate();
    persist();
    paint();
  }
  function updatePlay() {
    play.textContent = ui(running ? 'pause' : 'play');
    play.setAttribute('aria-pressed', String(running));
  }
  function parameterControls() {
    parameterBody.replaceChildren();
    for (const [key, labelKey, min, max, step, unit] of controls[state.topic]) {
      const label = make('label', parameterBody, 'cosmic-control'),
        head = make('span', label, 'cosmic-control-head');
      make('span', head).textContent = ui(labelKey);
      const output = make('output', head),
        input = make('input', label);
      input.type = 'range';
      input.setAttribute('aria-label', ui(labelKey));
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = state.params[key];
      input.dataset.cosmicParam = key;
      output.textContent = `${state.params[key]} ${unit}`;
      input.oninput = () => {
        state.params = normalizeCosmicParams({ ...state.params, [key]: Number(input.value) });
        output.textContent = `${state.params[key]} ${unit}`;
        lastWall = 0;
        updateCurve();
        paint();
      };
      input.onchange = persist;
    }
    if (!controls[state.topic].length) make('p', parameterBody).textContent = ui('snControl');
  }
  function updateCurve() {
    curve.hidden = state.topic !== 'pulsar';
    if (curve.hidden) return;
    curveScale.textContent = '0 → ' + Number(state.params.period.toPrecision(3)) + ' s';
    const profile = pulseProfile(state.params, 160);
    curveLine.setAttribute(
      'd',
      profile
        .map((y, i) => `${i ? 'L' : 'M'}${(i * 320) / (profile.length - 1)},${76 - y * 72}`)
        .join(' ')
    );
  }
  function translate() {
    const content = copy();
    root.style.setProperty('--cosmic-accent', topic().accent || '#f0b673');
    title.textContent = ui('title');
    subtitle.textContent = ui('intro');
    tabs.setAttribute('aria-label', ui('title'));
    for (const item of COSMIC_TOPICS) {
      const { button, label } = tabButtons.get(item.id);
      label.textContent = (item.copy[getLanguage()] || item.copy.en).title;
      button.setAttribute('aria-selected', String(item.id === state.topic));
      button.tabIndex = item.id === state.topic ? 0 : -1;
    }
    layout.setAttribute('aria-labelledby', 'cosmic-topic-' + state.topic);
    badge.textContent = ui('illustration') + ' · ' + ui('adjusted');
    sceneTitle.textContent = content.title;
    canvas.setAttribute('aria-label', content.title + ' · ' + ui('drag'));
    failure.textContent = ui('graphicsFailed');
    restart.textContent = ui('reset');
    resetCamera.textContent = ui('camera');
    snapshot.textContent = ui('capture');
    progressLabel.textContent = ui('progress');
    seek.setAttribute('aria-label', ui('progress'));
    hint.textContent = ui('drag');
    slowNote.textContent = ui(state.topic === 'pulsar' ? 'pulseNote' : 'cycle');
    parameterTitle.textContent = ui('controls');
    scienceTitle.textContent = ui('understand');
    summary.textContent = content.summary;
    facts.replaceChildren();
    for (const fact of content.facts) make('li', facts).textContent = fact;
    modelNote.textContent = content.modelNote;
    skyTitle.textContent = ui('realSky');
    sourceTitle.textContent = ui('sources');
    curveTitle.textContent = ui('intensity');
    curveScale.textContent = ui('phase') + ' 0 → 1';
    curveNote.textContent = ui('pulseNote');
    svg.setAttribute('aria-label', ui('intensity'));
    sourceLinks.replaceChildren();
    for (const source of topic().sources) {
      const link = make('a', sourceLinks);
      link.textContent = text(source.title);
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    targets.replaceChildren();
    for (const target of topic().targets) {
      const item = make('div', targets, 'cosmic-target'),
        button = make('button', item);
      button.type = 'button';
      button.textContent = ui('navigate') + ' · ' + text(target.label);
      button.dataset.cosmicTarget = target.id;
      button.onclick = async () => {
        if (navigating) return;
        navigating = true;
        status.textContent = ui('navigating');
        for (const b of targets.querySelectorAll('button')) b.disabled = true;
        try {
          const result = await sim.flightLab.observeCosmicTarget(target.id);
          if (!result && visible) status.textContent = ui('navigationFailed');
          else status.textContent = '';
        } catch {
          if (visible) status.textContent = ui('navigationFailed');
        } finally {
          navigating = false;
          for (const b of targets.querySelectorAll('button')) b.disabled = false;
        }
      };
      make('p', item).textContent = text(target.note);
    }
    if (state.topic === 'meteor') {
      const button = make('button', targets);
      button.type = 'button';
      button.textContent = ui('meteorMain');
      button.dataset.cosmic = 'meteor-settings';
      button.onclick = () => {
        sim.flightLab.close();
        const toggle = document.querySelector('[aria-controls="settings-phenomena"]');
        if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
        document.getElementById('showMeteors')?.scrollIntoView({ block: 'center' });
        document.getElementById('showMeteors')?.focus({ preventScroll: true });
      };
      make('p', targets).textContent = ui('meteorFootnote');
    }
    parameterControls();
    updatePlay();
    updateCurve();
    readout();
  }
  const number = (v, digits = 3) =>
    Number.isFinite(v) ? Number(v.toPrecision(digits)).toLocaleString(getLanguage()) : '—';
  function readout() {
    const m = cosmicMetrics(state.topic, state.params, state.phase),
      rows = [];
    if (state.topic === 'blackhole')
      rows.push(
        ['schwarzschild', number(m.schwarzschildKm) + ' km'],
        ['massBH', number(state.params.bhMass) + ' M☉']
      );
    if (state.topic === 'neutron')
      rows.push(
        ['density', m.neutronDensity.toExponential(2) + ' kg/m³'],
        ['compactness', number(m.compactness)]
      );
    if (state.topic === 'pulsar')
      rows.push(
        ['period', number(m.periodSeconds) + ' s'],
        ['intensity', number(m.pulseIntensity)]
      );
    if (state.topic === 'meteor')
      rows.push(
        ['altitude', number(m.meteorAltitudeKm) + ' km'],
        ['duration', number(m.meteorDurationSeconds) + ' s']
      );
    if (state.topic === 'supernova')
      rows.push(
        ['phaseLabel', ui(m.supernovaStage)],
        ['progress', Math.round(state.phase * 100) + '%']
      );
    metrics.replaceChildren();
    for (const [key, value] of rows) {
      const cell = make('div', metrics, 'cosmic-metric');
      make('dt', cell).textContent = ui(key);
      make('dd', cell).textContent = value;
    }
    seek.value = String(Math.round(state.phase * 1000));
    percent.textContent = Math.round(state.phase * 100) + '%';
    stage.textContent = state.topic === 'supernova' ? ui(m.supernovaStage) : copy().subtitle;
    phaseLine.setAttribute('x1', String(state.phase * 320));
    phaseLine.setAttribute('x2', String(state.phase * 320));
  }
  function paint() {
    if (!visible || disposed || document.hidden) return;
    try {
      viewer?.render(state);
    } catch {
      failure.hidden = false;
      snapshot.disabled = true;
    }
    readout();
  }
  function tick(now) {
    animation = 0;
    if (!visible || disposed || document.hidden) {
      lastWall = 0;
      return;
    }
    if (running && lastWall)
      state.phase = (state.phase + Math.min(0.08, (now - lastWall) / 1000) / 20) % 1;
    lastWall = now;
    try {
      viewer?.render(state);
    } catch {
      failure.hidden = false;
      snapshot.disabled = true;
      running = false;
      updatePlay();
    }
    if (now - lastReadout > 100) {
      readout();
      lastReadout = now;
    }
    if (running) schedule();
  }
  function schedule() {
    if (!animation && visible && !disposed && !document.hidden)
      animation = requestAnimationFrame(tick);
  }
  function suspend() {
    visible = false;
    cancelAnimationFrame(animation);
    animation = 0;
    lastWall = 0;
    persist();
  }
  function visibility() {
    lastWall = 0;
    if (document.hidden) {
      cancelAnimationFrame(animation);
      animation = 0;
    } else if (visible) {
      paint();
      schedule();
    }
  }
  function reduceMotion() {
    if (reduced.matches) {
      running = false;
      lastWall = 0;
      updatePlay();
    }
  }
  async function capture() {
    if (!viewer || captureBusy || failure.hidden === false) return;
    captureBusy = true;
    snapshot.disabled = true;
    const captured = normalizeCosmicState(state),
      capturedTitle = copy().title;
    try {
      viewer.render(captured);
      const out = document.createElement('canvas'),
        context = out.getContext('2d');
      out.width = canvas.width;
      out.height = canvas.height + 104;
      context.fillStyle = '#08111c';
      context.fillRect(0, 0, out.width, out.height);
      context.drawImage(canvas, 0, 0);
      context.fillStyle = '#e7edf5';
      context.font = '14px sans-serif';
      context.fillText(
        'StarOrbit · ' + capturedTitle + ' · ' + ui('illustration'),
        16,
        canvas.height + 24,
        out.width - 32
      );
      context.fillStyle = '#a9becd';
      context.font = '12px sans-serif';
      context.fillText(
        ui('adjusted') + ' · ' + ui('progress') + ' ' + Math.round(captured.phase * 100) + '%',
        16,
        canvas.height + 46,
        out.width - 32
      );
      const values = controls[captured.topic]
        .map(([key, label, , , , unit]) => `${ui(label)} ${captured.params[key]} ${unit}`)
        .join(' · ');
      context.fillText(values || ui('cycle'), 16, canvas.height + 68, out.width - 32);
      context.fillText(
        'Educational model, not an observation · StarOrbit / Wenshuishi · CC BY-NC 4.0',
        16,
        canvas.height + 90,
        out.width - 32
      );
      const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('empty image');
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'StarOrbit_cosmic_' + captured.topic + '.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      status.textContent = ui('captureFailed');
    } finally {
      captureBusy = false;
      snapshot.disabled = !failure.hidden;
    }
  }
  const unsubscribe = onLanguageChange(() => {
    translate();
    paint();
  });
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', reduceMotion);
  translate();
  return {
    selectTopic,
    resume() {
      visible = true;
      lastWall = 0;
      if (!viewer && failure.hidden) {
        try {
          viewer = createCosmicRenderer(canvas, {
            onInvalidate: () => {
              if (visible) schedule();
            },
          });
        } catch {
          failure.hidden = false;
          snapshot.disabled = true;
        }
      }
      paint();
      schedule();
    },
    deactivate: suspend,
    pause: suspend,
    dispose() {
      suspend();
      disposed = true;
      viewer?.dispose();
      unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', reduceMotion);
      root.remove();
    },
  };
}
