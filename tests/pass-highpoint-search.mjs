import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  findHighPass,
  findHighPassInSource,
  highPassReachability,
} from '../src/pass-highpoint-search.js';
import { createPassSampler, observerFrame } from '../src/pass-prediction.js';
import { stateAt, MIN_TIME, MAX_TIME } from '../src/orbit.js';

const DAY = 86400000,
  HOUR = 3600000,
  DEG = Math.PI / 180,
  origin = Date.UTC(2026, 10, 10),
  observer = { name: 'Equator', latitude: 0, longitude: 0, height: 0 };

// Controlled geometric passes, with actual solar elevation at the observer.
// A synthetic source lets ordering/threshold/boundary regressions be tested
// independently of the current catalog's particular pass schedule.
function synthetic(
  peaks,
  { start = origin - 20 * DAY, end = origin + 20 * DAY, floorElevation = -20 } = {}
) {
  const frame = observerFrame(observer);
  return {
    start,
    end,
    epoch: origin,
    kind: 'oem',
    recordStart: origin - DAY,
    recordEnd: origin + DAY,
    position(time, axes) {
      const elevation = Math.max(
          floorElevation,
          ...peaks.map((p) => p.elevation - 100 * ((time - p.time) / 120000) ** 2)
        ),
        angle = elevation * DEG,
        fixed = frame.position.map(
          (x, i) => x + 20000 * (Math.cos(angle) * frame.east[i] + Math.sin(angle) * frame.up[i])
        ),
        inertial = fixed.map((_, i) => axes.reduce((sum, axis, j) => sum + fixed[j] * axis[i], 0));
      return { fixed, inertial };
    },
  };
}

const peaks = [
    { time: origin + 2 * HOUR, elevation: 65 },
    { time: origin + 12 * HOUR, elevation: 72 },
    { time: origin + DAY, elevation: 85 },
    { time: origin + 36 * HOUR, elevation: 89 },
  ],
  source = synthetic(peaks);
const near = (actual, expected) =>
  assert(Math.abs(actual - expected) <= 1000, `${actual} near ${expected}`);
const search = (time, options = {}) => findHighPassInSource(source, observer, time, options);

const next = await search(origin);
assert.equal(next.status, 'found');
near(next.passes[0].maximum.time, peaks[0].time);
assert.equal(next.minimumElevation, 0);
assert.equal(next.query.minimumPeakElevation, 60);
assert.equal(next.passes.length, 1);
assert(next.passes[0].maximum.time > origin);
assert(next.start <= next.passes[0].maximum.time && next.end >= next.passes[0].maximum.time);
const continuous = await findHighPassInSource(
  synthetic(peaks, { floorElevation: 20 }),
  observer,
  origin
);
near(continuous.passes[0].maximum.time, peaks[0].time);
assert(continuous.clipped, 'continuous above-horizon visibility remains explicitly clipped');

const higher = await search(origin, { minimumPeakElevation: 70 });
near(higher.passes[0].maximum.time, peaks[1].time);
const following = await search(next.passes[0].maximum.time);
near(following.passes[0].maximum.time, peaks[1].time);
assert(following.passes[0].maximum.time > next.passes[0].maximum.time);
const justBefore = await search(peaks[0].time - 10);
near(justBefore.passes[0].maximum.time, peaks[0].time);
assert(
  justBefore.passes[0].maximum.time > peaks[0].time - 10,
  'a nearby future peak is not skipped'
);

// The third pass rises before, and sets after, the 24-hour core boundary.
const boundary = await search(origin, { minimumPeakElevation: 80 });
near(boundary.passes[0].maximum.time, peaks[2].time);
assert(boundary.passes[0].start < peaks[2].time && boundary.passes[0].end > peaks[2].time);
assert(!boundary.passes[0].clippedStart && !boundary.passes[0].clippedEnd);
assert.equal(boundary.passes[0].estimated, true);
assert.equal(boundary.mode, 'mixed');

const previous = await search(origin + 40 * HOUR, { direction: -1 });
near(previous.passes[0].maximum.time, peaks[3].time);
const previousNight = await search(origin + 40 * HOUR, { direction: -1, daylight: 'night' });
near(previousNight.passes[0].maximum.time, peaks[2].time);
const previousDay = await search(origin + 40 * HOUR, { direction: -1, daylight: 'day' });
near(previousDay.passes[0].maximum.time, peaks[3].time);

const day = await search(origin, { daylight: 'day' });
near(day.passes[0].maximum.time, peaks[1].time);
assert(day.passes[0].maximum.sunElevation >= 0);
assert.equal(day.passes[0].visible.length, 0, 'day filtering does not require optical visibility');
const night = await search(origin, { daylight: 'night' });
near(night.passes[0].maximum.time, peaks[0].time);
assert(night.passes[0].maximum.sunElevation < 0);

const farPeak = { time: origin + 8.2 * DAY, elevation: 75 },
  farSource = synthetic([farPeak]),
  progress = [];
const far = await findHighPassInSource(farSource, observer, origin, {
  onProgress: (p) => progress.push(p),
});
near(far.passes[0].maximum.time, farPeak.time);
assert(far.passes[0].maximum.time > origin + 72 * HOUR, 'extends beyond a 72-hour list');
assert(far.chunksScanned >= 9);
assert.equal(far.mode, 'estimate');
assert(progress.some((p) => p.daysScanned >= 8));
assert(progress.every((p, i) => i === 0 || p.daysScanned >= progress[i - 1].daysScanned));

const pastPeak = { time: origin - 8.2 * DAY, elevation: 75 },
  farPast = await findHighPassInSource(synthetic([pastPeak]), observer, origin, { direction: -1 });
near(farPast.passes[0].maximum.time, pastPeak.time);
assert(farPast.passes[0].maximum.time < origin - 72 * HOUR);

const cancelled = new AbortController();
cancelled.abort();
await assert.rejects(
  search(origin, { signal: cancelled.signal }),
  (error) => error.name === 'AbortError'
);
const running = new AbortController();
let completedChunks = 0;
await assert.rejects(
  findHighPassInSource(synthetic([]), observer, origin, {
    signal: running.signal,
    onProgress(p) {
      completedChunks = p.chunksScanned;
      if (completedChunks >= 2) running.abort();
    },
  }),
  (error) => error.name === 'AbortError'
);
assert.equal(completedChunks, 2);

const exhausted = await findHighPassInSource(
  synthetic([], { start: origin, end: origin + DAY }),
  observer,
  origin
);
assert.equal(exhausted.status, 'exhausted');
assert.deepEqual(exhausted.passes, []);
// A rising/setting edge is not an actual maximum simply because the usable
// source or Date range ends there.
const finiteEnd = origin + HOUR,
  risingEdge = await findHighPassInSource(
    synthetic([{ time: finiteEnd + 10000, elevation: 85 }], {
      start: origin,
      end: finiteEnd,
    }),
    observer,
    origin
  ),
  settingEdge = await findHighPassInSource(
    synthetic([{ time: origin - 10000, elevation: 85 }], {
      start: origin,
      end: finiteEnd,
    }),
    observer,
    finiteEnd,
    { direction: -1 }
  );
assert.equal(risingEdge.status, 'exhausted');
assert.equal(settingEdge.status, 'exhausted');

function zenithSource(start, peakTime) {
  const frame = observerFrame(observer);
  return {
    start,
    end: start + 2 * HOUR,
    epoch: start,
    kind: 'oem',
    position(time, axes) {
      const fixed = frame.position.map(
        (x, i) => x + 400 * frame.up[i] + ((time - peakTime) / 1000) * 7.5 * frame.east[i]
      );
      return {
        fixed,
        inertial: fixed.map((_, i) => axes.reduce((sum, axis, j) => sum + fixed[j] * axis[i], 0)),
      };
    },
  };
}
// A real angular zenith cusp, not a smooth elevation parabola. A 1-ms-only
// peak search can miss the exact 90-degree threshold at this fractional time.
const exactZenith = origin + HOUR + 13.217,
  zenith = await findHighPassInSource(zenithSource(origin, exactZenith), observer, origin, {
    minimumPeakElevation: 90,
  });
assert.equal(zenith.status, 'found');
assert.equal(zenith.passes[0].maximum.elevation, 90);
assert(Math.abs(zenith.passes[0].maximum.time - exactZenith) < 1);
const zenithAgain = await findHighPassInSource(
  zenithSource(origin, exactZenith),
  observer,
  zenith.passes[0].maximum.time,
  { minimumPeakElevation: 90 }
);
assert.equal(zenithAgain.status, 'exhausted', 'the same numerical maximum is not returned twice');
const farOrigin = 8.64e15 - 10 * DAY,
  farZenith = await findHighPassInSource(
    zenithSource(farOrigin, farOrigin + HOUR + 13),
    observer,
    farOrigin,
    { minimumPeakElevation: 90 }
  );
assert.equal(farZenith.status, 'found', 'far-date floating point refinement terminates');
assert.equal(farZenith.passes[0].maximum.elevation, 90);
for (const options of [
  { direction: 0 },
  { minimumPeakElevation: 91 },
  { minimumPeakElevation: NaN },
  { daylight: 'visible' },
])
  await assert.rejects(search(origin, options), /参数/);

const station = JSON.parse(fs.readFileSync(new URL('../assets/orbit.json', import.meta.url))),
  arctic = { name: 'Arctic', latitude: 80, longitude: 15, height: 0 },
  reachability = highPassReachability(station, arctic);
assert.equal(reachability.basis, 'near-earth-envelope');
assert(reachability.upperBoundElevation < 60);
const unreachable = await findHighPass(station, arctic, station.rows.at(-1)[0]);
assert.equal(unreachable.status, 'unreachable');
assert.equal(unreachable.chunksScanned, 0);
assert.deepEqual(unreachable.passes, []);
assert(unreachable.reachability.upperBoundElevation < unreachable.query.minimumPeakElevation);

// Real CSS, well past the OEM sample window. This source deliberately uses
// the application's shared stateAt rather than the finite list-window helper.
const beijing = { name: 'Beijing', latitude: 39.9042, longitude: 116.4074, height: 50 },
  cssSource = {
    start: MIN_TIME,
    end: MAX_TIME,
    kind: 'oem',
    epoch: station.rows[0][0],
    recordStart: station.rows[0][0],
    recordEnd: station.rows.at(-1)[0],
    position(time, axes) {
      const q = stateAt(station, time);
      if (!q) throw Error('Missing CSS state');
      return {
        inertial: q.position,
        fixed: axes.map((a) => a.reduce((sum, x, i) => sum + x * q.position[i], 0)),
      };
    },
  },
  cssStart = cssSource.recordEnd + 5 * DAY,
  cssNext = await findHighPassInSource(cssSource, beijing, cssStart, {
    minimumPeakElevation: 60,
    reachability: highPassReachability(station, beijing),
  }),
  cssPass = cssNext.passes[0];
assert.equal(cssNext.status, 'found');
assert(cssPass.maximum.time > cssStart && cssPass.maximum.elevation >= 60);
assert(cssPass.estimated);
const sampledMaximum = createPassSampler(cssSource, beijing)(cssPass.maximum.time);
assert(Math.abs(sampledMaximum.elevation - cssPass.maximum.elevation) < 1e-9);
const cssPrevious = await findHighPassInSource(cssSource, beijing, cssPass.maximum.time + 1000, {
  direction: -1,
  minimumPeakElevation: 60,
});
near(cssPrevious.passes[0].maximum.time, cssPass.maximum.time);
console.log(
  'High-pass search: nearest forward/backward, 60-degree default, thresholds, day/night, chunk overlap, 8-day extension, cancellation, geometry rejection and real CSS passed',
  {
    farChunks: far.chunksScanned,
    arcticUpperBound: reachability.upperBoundElevation,
    cssTime: new Date(cssPass.maximum.time).toISOString(),
    cssElevation: cssPass.maximum.elevation,
  }
);
