import assert from 'node:assert/strict';
import {
  LABEL_LAYOUT_DEFAULTS,
  focusedLabelId,
  labelBox,
  layoutSpacecraftLabels,
} from '../src/spacecraft-label-layout.js';
import { createSpacecraftLabelPlacer, estimateLabelSize } from '../src/spacecraft-label-placer.js';

const { gap, margin, holdFrames } = LABEL_LAYOUT_DEFAULTS;
const overlap = (a, b, pad = 0) =>
  a.left < b.right + pad &&
  b.left < a.right + pad &&
  a.top < b.bottom + pad &&
  b.top < a.bottom + pad;
const shown = (result) =>
  Object.entries(result.placements).filter(([, placement]) => placement.visible);
function assertClean(result, { width, height, obstacles = [] }) {
  const visible = shown(result);
  for (const [id, placement] of visible) {
    const { box } = placement;
    assert(box.left >= margin && box.top >= margin, `${id} stays inside the top-left edge`);
    assert(
      box.right <= width - margin && box.bottom <= height - margin,
      `${id} stays inside the bottom-right edge`
    );
    for (const obstacle of obstacles)
      assert(!overlap(box, obstacle, gap), `${id} stays clear of floating windows`);
  }
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++)
      assert(
        !overlap(visible[i][1].box, visible[j][1].box, gap),
        `${visible[i][0]} and ${visible[j][0]} must not overlap`
      );
}
const label = (id, x, y, extra = {}) => ({ id, x, y, width: 100, height: 23, ...extra });

// The box follows the CSS transform translate(-50%, -130%) of .station-tag.
assert.deepEqual(labelBox(200, 100, 100, 20), { left: 150, top: 74, right: 250, bottom: 94 });

// Focus mapping: telescope, a single module, or the core module for the station.
const named = [
  { id: 'freeXT', type: 'XT' },
  { id: 'TH_WENTIAN', type: 'WT' },
  { id: 'TH', type: 'TH' },
];
assert.equal(focusedLabelId('xuntian', named), 'freeXT');
assert.equal(focusedLabelId('xuntian', named.slice(1)), null);
assert.equal(focusedLabelId('module:TH_WENTIAN', named), 'TH_WENTIAN');
assert.equal(focusedLabelId('module:TH_LOWER', named), null);
assert.equal(focusedLabelId('mission', named), 'TH');
assert.equal(focusedLabelId('mission', named.slice(0, 2)), 'TH_WENTIAN');
assert.equal(focusedLabelId('all', named), null);
assert.equal(focusedLabelId(undefined, named), null);

// Labels sharing one anchor: the priority label keeps it even when listed last;
// the others move aside in stable input order without overlapping.
{
  const view = { width: 800, height: 600 };
  const result = layoutSpacecraftLabels({
    ...view,
    labels: [label('A', 400, 300), label('B', 400, 300), label('C', 400, 300, { priority: 1 })],
  });
  assertClean(result, view);
  const { A, B, C } = result.placements;
  assert(A.visible && B.visible && C.visible);
  assert.deepEqual([C.dx, C.dy, C.left, C.top], [0, 0, 400, 300]);
  assert(A.dx || A.dy, 'A moves away from the shared anchor');
  assert(Math.hypot(A.dx, A.dy) <= Math.hypot(B.dx, B.dy), 'earlier labels get nearer slots');
  assert.equal(A.left, 400 + A.dx);
  assert.equal(A.top, 300 + A.dy);
  const css = labelBox(A.left, A.top, 100, 23);
  for (const edge of ['left', 'top', 'right', 'bottom'])
    assert(Math.abs(A.box[edge] - css[edge]) < 1e-9, `box ${edge} matches the CSS transform`);
}

// A label that already fits stays exactly at its anchor.
{
  const result = layoutSpacecraftLabels({
    width: 800,
    height: 600,
    labels: [label('A', 200, 200), label('B', 600, 400)],
  });
  for (const id of ['A', 'B']) {
    assert.equal(result.placements[id].dx, 0);
    assert.equal(result.placements[id].dy, 0);
  }
}

// A dense cluster (six modules of a narrow phone view) never overlaps.
{
  const view = { width: 375, height: 400 };
  const labels = [
    label('TH', 180, 200, { width: 70 }),
    label('TH_WENTIAN', 186, 204, { width: 96 }),
    label('TH_MENGTIAN', 176, 196, { width: 96 }),
    label('TH_FORWARD', 190, 210, { width: 96 }),
    label('TH_LOWER', 172, 214, { width: 96 }),
    label('TH_AFT', 184, 190, { width: 96 }),
  ];
  const result = layoutSpacecraftLabels({ ...view, labels });
  assertClean(result, view);
  assert(shown(result).length >= 4, 'most of a six-label cluster still finds room');
}

// Floating windows are obstacles; a label fully covered by one is hidden.
{
  const view = { width: 800, height: 600 };
  const telemetry = { left: 150, top: 150, right: 450, bottom: 290 };
  const result = layoutSpacecraftLabels({
    ...view,
    obstacles: [telemetry],
    labels: [label('A', 300, 300)],
  });
  assertClean(result, { ...view, obstacles: [telemetry] });
  assert(result.placements.A.visible);
  assert(result.placements.A.dy > 0, 'blocked above, the label moves below its anchor');
  const everything = { left: -10, top: -10, right: 900, bottom: 700 };
  const covered = layoutSpacecraftLabels({
    ...view,
    obstacles: [everything],
    labels: [label('A', 300, 300, { priority: 1 })],
  });
  assert.equal(covered.placements.A.visible, false);
  // Obstacles entirely outside the viewport (the desktop sidebar) are ignored.
  const outside = layoutSpacecraftLabels({
    ...view,
    obstacles: [{ left: -330, top: 16, right: -16, bottom: 580 }],
    labels: [label('A', 60, 300)],
  });
  assert.equal(outside.placements.A.dx, 0);
}

// Viewport edges: near the top the label flips below; near the left it shifts
// right; in a corner it still stays fully inside; too large means hidden.
{
  const view = { width: 400, height: 300 };
  const top = layoutSpacecraftLabels({ ...view, labels: [label('A', 200, 10)] });
  assertClean(top, view);
  assert.equal(top.placements.A.dx, 0);
  assert(top.placements.A.dy > 0);
  const left = layoutSpacecraftLabels({ ...view, labels: [label('A', 10, 150)] });
  assertClean(left, view);
  assert(left.placements.A.dx > 0);
  assert.equal(left.placements.A.dy, 0);
  for (const [x, y] of [
    [3, 3],
    [397, 3],
    [3, 297],
    [397, 297],
  ]) {
    const corner = layoutSpacecraftLabels({ ...view, labels: [label('A', x, y)] });
    assertClean(corner, view);
    assert(corner.placements.A.visible, `corner ${x},${y} keeps its label`);
  }
  const huge = layoutSpacecraftLabels({ ...view, labels: [label('A', 200, 150, { width: 420 })] });
  assert.equal(huge.placements.A.visible, false);
}

// Crowding hides lower-priority labels instead of drawing them on top.
{
  const view = { width: 200, height: 120 };
  const labels = Array.from({ length: 12 }, (_, i) =>
    label('L' + i, 100, 60, { width: 80, priority: i === 7 ? 1 : 0 })
  );
  const result = layoutSpacecraftLabels({ ...view, labels });
  assertClean(result, view);
  assert.equal(result.placements.L7.visible, true);
  assert.deepEqual([result.placements.L7.dx, result.placements.L7.dy], [0, 0]);
  const hidden = labels.filter(({ id }) => !result.placements[id].visible);
  assert(hidden.length > 0, 'some labels are hidden');
  assert(shown(result).length > 1, 'but not all of them');
}

// Small anchor movements keep every slot and visibility from frame to frame.
{
  const view = { width: 375, height: 400 };
  const cluster = (shift, wobble) => [
    label('TH', 180 + shift, 200 + wobble, { priority: 1 }),
    label('WT', 186 + shift, 204 - wobble),
    label('MT', 176 + shift, 196 + wobble),
    label('SZ', 190 + shift, 210 - wobble),
  ];
  let frame = layoutSpacecraftLabels({ ...view, labels: cluster(0, 0) });
  const first = JSON.stringify(
    Object.entries(frame.placements).map(([id, p]) => [id, p.visible, p.slot])
  );
  for (let i = 1; i <= 30; i++) {
    frame = layoutSpacecraftLabels({
      ...view,
      labels: cluster(i * 0.4, i % 2 ? 0.6 : -0.6),
      previous: frame.state,
    });
    assertClean(frame, view);
    assert.equal(
      JSON.stringify(Object.entries(frame.placements).map(([id, p]) => [id, p.visible, p.slot])),
      first,
      `frame ${i} keeps the previous layout`
    );
  }
}

// Spatial hysteresis: a label pushed aside returns home only once its default
// spot is clear by a margin, so a one-pixel jitter cannot make it jump back.
{
  const view = { width: 800, height: 600 };
  const wall = { left: 353, top: 100, right: 500, bottom: 300 };
  const at = (x, previous) =>
    layoutSpacecraftLabels({ ...view, obstacles: [wall], labels: [label('A', x, 200)], previous });
  const pushed = at(300);
  assert(pushed.placements.A.dx < 0, 'blocked on the right, it moves left');
  const jitter = at(298, pushed.state);
  assert.equal(jitter.placements.A.slot, pushed.placements.A.slot, 'stays put on a 2 px move');
  assert.equal(at(298).placements.A.dx, 0, 'without memory the default slot would be used');
  const back = at(280, jitter.state);
  assert.deepEqual([back.placements.A.dx, back.placements.A.dy], [0, 0], 'returns when clear');
}

// Temporal hysteresis: crowding hides a label only after holdFrames frames, and
// a freed label reappears only after holdFrames frames.
{
  const view = { width: 800, height: 600 };
  const everything = { left: 0, top: 0, right: 800, bottom: 600 };
  let frame = layoutSpacecraftLabels({ ...view, labels: [label('A', 300, 300)] });
  assert(frame.placements.A.visible);
  for (let i = 1; i <= holdFrames; i++) {
    frame = layoutSpacecraftLabels({
      ...view,
      obstacles: [everything],
      labels: [label('A', 300, 300)],
      previous: frame.state,
    });
    assert.equal(frame.placements.A.visible, i < holdFrames, `hide hold frame ${i}`);
  }
  for (let i = 1; i <= holdFrames; i++) {
    frame = layoutSpacecraftLabels({
      ...view,
      labels: [label('A', 300, 300)],
      previous: frame.state,
    });
    assert.equal(frame.placements.A.visible, i >= holdFrames, `show hold frame ${i}`);
  }
  // Turning labels off or leaving the view hides at once and forgets the slot.
  const off = layoutSpacecraftLabels({
    ...view,
    labels: [label('A', 300, 300, { visible: false })],
    previous: frame.state,
  });
  assert.equal(off.placements.A.visible, false);
  assert.equal(off.state.has('A'), false);
  const again = layoutSpacecraftLabels({
    ...view,
    labels: [label('A', 300, 300)],
    previous: off.state,
  });
  assert.equal(again.placements.A.visible, true, 'a returning label is shown immediately');
}

// ---- DOM placer with a fake DOM that records layout reads and style writes ----
function fakeElement(log, name, rect) {
  const values = {};
  const style = new Proxy(values, {
    set(target, key, value) {
      log.push(['write', name, key, value]);
      target[key] = value;
      return true;
    },
  });
  return {
    name,
    textContent: '',
    hidden: false,
    isConnected: true,
    style,
    getBoundingClientRect() {
      log.push(['read', name]);
      return rect(this);
    },
  };
}
const log = [];
const stageOrigin = { left: 100, top: 50 };
const stage = fakeElement(log, 'stage', () => ({
  ...stageOrigin,
  right: 900,
  bottom: 650,
  width: 800,
  height: 600,
}));
const pageRect = (left, top, width, height) => () => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
const telemetry = fakeElement(log, 'telemetry', pageRect(120, 60, 280, 150));
const minimap = fakeElement(log, 'minimap', pageRect(540, 420, 336, 200));
const helpPanel = fakeElement(log, 'helpPanel', pageRect(100, 50, 800, 600));
helpPanel.checkVisibility = () => false;
const xuntian = fakeElement(log, 'xuntian', pageRect(100, 50, 800, 600));
xuntian.hidden = true;
const queries = [];
const root = {
  querySelector(selector) {
    queries.push(selector);
    return (
      {
        '#telemetry': telemetry,
        '#orbitMinimap': minimap,
        '#helpPanel': helpPanel,
        '#xuntianScope': xuntian,
      }[selector] || null
    );
  },
};
let measured = 0;
const tagRect = (el) => {
  measured++;
  if (el.style.display === 'none') return { left: 0, top: 0, width: 0, height: 0 };
  return { left: 0, top: 0, width: 18 + 8 * el.textContent.length, height: 23 };
};
const tags = ['TH', 'WT', 'SZ'].map((id) => {
  const el = fakeElement(log, id, tagRect);
  el.textContent = id === 'TH' ? '天和核心舱' : id + ' module label';
  return { id, el };
});
tags[2].el.style.display = 'none';
log.length = 0;
const placer = createSpacecraftLabelPlacer({ stage, root });
const entries = (positions, visible = () => true) =>
  tags.map(({ id, el }, i) => ({
    id,
    el,
    x: positions[i][0],
    y: positions[i][1],
    visible: visible(id),
    priority: id === 'WT' ? 1 : 0,
  }));
// TH sits just below the telemetry card (stage-local 20..300 × 10..160), so its
// default spot is covered; WT and SZ share an anchor in open space.
const anchors = [
  [160, 175],
  [500, 260],
  [500, 260],
];
function assertReadsBeforeWrites(frameLog, label) {
  const firstRead = frameLog.findIndex(([kind]) => kind === 'read'),
    lastRead = frameLog.findLastIndex(([kind]) => kind === 'read');
  // Only the temporary reveal of an unmeasured hidden label may precede reads.
  for (const [kind, , key, value] of frameLog.slice(0, Math.max(firstRead, 0)))
    assert(
      kind === 'write' &&
        ((key === 'visibility' && value === 'hidden') || (key === 'display' && value === 'block')),
      `${label}: only measurement reveals precede reads`
    );
  assert(
    !frameLog.slice(firstRead, lastRead).some(([kind]) => kind === 'write'),
    `${label}: reads are not interleaved with writes`
  );
}
let placements = placer.place(entries(anchors), { width: 800, height: 600, language: 'zh-CN' });
assertReadsBeforeWrites(log, 'first frame');
assert.equal(measured, 3, 'every visible label is measured once');
assert.deepEqual(log.slice(0, 2), [
  ['write', 'SZ', 'visibility', 'hidden'],
  ['write', 'SZ', 'display', 'block'],
]);
assert.equal(tags[2].el.style.visibility, '', 'the measurement reveal is undone');
assert.equal(queries.length > 0, true);
assert.deepEqual(
  log.filter(([kind, name]) => kind === 'read' && ['helpPanel', 'xuntian'].includes(name)),
  [],
  'hidden floating windows are not measured'
);
const card = { left: 20, top: 10, right: 300, bottom: 160 };
for (const { id, el } of tags) {
  assert.equal(el.style.display, 'block', `${id} is shown`);
  assert(!overlap(placements[id].box, card, gap), `${id} avoids the telemetry card`);
}
assert(placements.TH.dy > 0, 'the label under the card moves below its anchor');
assert.deepEqual(
  [tags[1].el.style.left, tags[1].el.style.top],
  ['500px', '260px'],
  'the focused label keeps its anchor'
);
assert.notEqual(`${tags[2].el.style.left},${tags[2].el.style.top}`, '500px,260px');
assert(!overlap(placements.WT.box, placements.SZ.box, gap));

// An unchanged frame measures nothing and writes nothing.
log.length = 0;
measured = 0;
placer.place(entries(anchors), { width: 800, height: 600, language: 'zh-CN' });
assert.equal(measured, 0, 'label sizes are cached');
assert.deepEqual(
  log.filter(([kind]) => kind === 'write'),
  [],
  'unchanged styles are not rewritten'
);
assertReadsBeforeWrites(log, 'steady frame');

// Moving one anchor rewrites only that label's position.
log.length = 0;
placer.place(
  entries([
    [160, 175],
    [501, 260],
    [500, 260],
  ]),
  { width: 800, height: 600, language: 'zh-CN' }
);
assert.deepEqual(
  log.filter(([kind]) => kind === 'write'),
  [['write', 'WT', 'left', '501px']]
);
assert.equal(measured, 0);

// Text, language and viewport changes trigger re-measurement.
tags[0].el.textContent = '天和核心舱 1';
placer.place(entries(anchors), { width: 800, height: 600, language: 'zh-CN' });
assert.equal(measured, 1, 'only the relabelled tag is re-measured');
measured = 0;
placer.place(entries(anchors), { width: 800, height: 600, language: 'en' });
assert.equal(measured, 3, 'a language switch re-measures every visible label');
measured = 0;
placer.place(entries(anchors), { width: 760, height: 600, language: 'en' });
assert.equal(measured, 3, 'a viewport change re-measures every visible label');

// Hidden entries are written as display:none and need no measurement.
measured = 0;
log.length = 0;
placer.place(
  entries(anchors, (id) => id !== 'SZ'),
  { width: 760, height: 600, language: 'en' }
);
assert.equal(tags[2].el.style.display, 'none');
assert.equal(measured, 0);
// With nothing visible no layout is read at all.
log.length = 0;
placer.place(
  entries(anchors, () => false),
  { width: 760, height: 600, language: 'en' }
);
assert.deepEqual(
  log.filter(([kind]) => kind === 'read'),
  []
);
assert(tags.every(({ el }) => el.style.display === 'none'));

// Without layout information (stub elements) sizes are estimated, not zero.
{
  const stub = { textContent: '巡天望远镜', style: {} };
  const bare = createSpacecraftLabelPlacer();
  const result = bare.place([{ id: 'freeXT', el: stub, x: 100, y: 100, visible: true }], {
    width: 400,
    height: 300,
  });
  assert.equal(stub.style.display, 'block');
  assert.equal(stub.style.left, '100px');
  assert.equal(
    result.freeXT.box.right - result.freeXT.box.left,
    estimateLabelSize('巡天望远镜').width
  );
  assert(estimateLabelSize('Tianhe core module').width > estimateLabelSize('天和').width);
}

// A label that a stylesheet rule hides (zero size even when revealed) takes no
// room from the others and is re-measured later instead of every frame.
{
  const ghostLog = [];
  let ghostReads = 0,
    styled = false;
  const ghost = fakeElement(ghostLog, 'ghost', (el) => {
    ghostReads++;
    return styled && el.style.display !== 'none'
      ? { left: 0, top: 0, width: 60, height: 23 }
      : { left: 0, top: 0, width: 0, height: 0 };
  });
  const real = fakeElement(ghostLog, 'real', () => ({ left: 0, top: 0, width: 60, height: 23 }));
  ghost.textContent = 'ghost';
  real.textContent = 'real';
  const bare = createSpacecraftLabelPlacer();
  const frame = () =>
    bare.place(
      [
        { id: 'ghost', el: ghost, x: 200, y: 150, visible: true, priority: 1 },
        { id: 'real', el: real, x: 200, y: 150, visible: true },
      ],
      { width: 400, height: 300 }
    );
  let result = frame();
  assert.equal(result.ghost.visible, false);
  assert.deepEqual([result.real.dx, result.real.dy], [0, 0], 'the hidden label leaves its spot');
  for (let i = 0; i < 10; i++) frame();
  assert.equal(ghostReads, 1, 'no per-frame re-measurement while hidden by a stylesheet');
  styled = true;
  for (let i = 0; i < 40 && !result.ghost.visible; i++) result = frame();
  assert.equal(result.ghost.visible, true, 'the label returns once the rule stops hiding it');
  assert.deepEqual([result.ghost.dx, result.ghost.dy], [0, 0], 'and takes the anchor by priority');
  assert.equal(ghost.style.visibility, '');
}

console.log(
  'Spacecraft label layout: overlap avoidance, obstacles, priority, edges, stability, hiding and cached DOM placement passed.'
);
