import { AU, EARTH_RADIUS, cross, dot, norm, snapshotFromState } from '../orbit.js';
import { createPropagator, validateForces } from './orbit-propagation.js';
import { coversOem, crossesUtcLeapSecond, OEM_MAX_BYTES, parseOem, sampleOem } from './oem.js';
import { compareOrbit, denseStateAt } from './orbit-comparison.js';
import { defaultObservation, validateObservation } from './observation-config.js';
import { buildAccess } from './access.js';
import { createObservationRun } from './observation-run.js';
import app from '../../package.json' with { type: 'json' };

export const DAY = 86400;
export const MODEL = 'starorbit-leo-electrothermal/3';
export const STEP = 5;
const MU = 398600.4418,
  RE = 6378.1363,
  SIGMA = 5.670374419e-8;
const radians = Math.PI / 180;

// Default, minimum, maximum and unit. The form and the file validator share these limits.
export const fields = {
  perigeeKm: [550, 200, 2000, 'km'],
  apogeeKm: [550, 200, 2000, 'km'],
  inclinationDeg: [51.6, 0, 180, '°'],
  raanDeg: [30, 0, 360, '°'],
  argPerigeeDeg: [0, 0, 360, '°'],
  anomalyDeg: [0, 0, 360, '°'],
  arrayM2: [0.065, 0.005, 0.5, 'm²'],
  efficiency: [0.26, 0.05, 0.4, ''],
  capacityWh: [60, 1, 1000, 'Wh'],
  initialWh: [36, 0, 1000, 'Wh'],
  reserveWh: [30, 0, 1000, 'Wh'],
  busW: [7, 0, 200, 'W'],
  initialC: [20, -80, 120, '°C'],
  coldC: [-10, -100, 120, '°C'],
  hotC: [45, -80, 160, '°C'],
  radiatorM2: [0.12, 0.02, 1, 'm²'],
  outerJK: [2200, 500, 50000, 'J/K'],
  boardJK: [700, 200, 50000, 'J/K'],
  conductance: [0.6, 0.05, 3, 'W/K'],
  absorptance: [0.82, 0.4, 1, ''],
  emissivity: [0.82, 0.1, 1, ''],
  chargeEff: [0.93, 0.5, 1, ''],
  dischargeEff: [0.94, 0.5, 1, ''],
};
export function defaultMission() {
  return {
    schemaVersion: 1,
    epochUtc: '2026-11-23T00:00:00Z',
    gravity: 'j2',
    forces: validateForces(),
    trajectory: { mode: 'elements', name: '', oemText: '' },
    spacecraft: {
      name: '晨星一号',
      parameterSource: '方案研究示例，参数为假设值',
      ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])),
    },
    plans: ['sun', 'zenith'].map((pointing, i) => ({
      name: ['对日跟踪', '天顶定向'][i],
      pointing,
      payloadW: 6,
      windows: [
        [20, 35],
        [490, 515],
        [990, 1020],
      ],
    })),
  };
}
export function observationMission() {
  const mission = defaultMission();
  mission.epochUtc = '2026-11-25T00:00:00Z';
  Object.assign(mission.spacecraft, {
    name: '湖泊观测研究星',
    parameterSource: '方案研究示例，卫星硬件与轨道参数采用假设值。',
    raanDeg: 150,
    arrayM2: 0.035,
    busW: 14,
    initialWh: 60,
    radiatorM2: 0.15,
    boardJK: 950,
    conductance: 0.8,
  });
  mission.plans = ['原图回传', '星上筛选'].map((name) => ({
    name,
    pointing: 'sun',
    payloadW: 0,
    windows: [],
  }));
  mission.observation = defaultObservation();
  return mission;
}
function invalid(key) {
  throw new RangeError(key);
}
function bounded(n, lo, hi, key) {
  if (!Number.isFinite(n) || n < lo || n > hi) invalid(key);
  return n;
}
function name(s, key) {
  if (typeof s !== 'string' || !s.trim() || s.trim().length > 60) invalid(key);
  return s.trim();
}
function trajectoryInput(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('trajectoryMode');
  const mode = raw.mode ?? 'elements',
    name = raw.name ?? '',
    oemText = raw.oemText ?? '';
  if (!['elements', 'oemInitial', 'oemReplay'].includes(mode)) invalid('trajectoryMode');
  if (
    typeof name !== 'string' ||
    name.length > 256 ||
    typeof oemText !== 'string' ||
    oemText.length > OEM_MAX_BYTES
  )
    invalid('oemInvalid');
  if (mode !== 'elements' && !oemText.trim()) invalid('oemRequired');
  return { mode, name: name.trim(), oemText };
}
export function validateMission(raw) {
  if (
    raw?.schemaVersion !== 1 ||
    !raw.spacecraft ||
    raw.plans?.length !== 2 ||
    !Array.isArray(raw.plans)
  )
    invalid('schema');
  const epoch = raw.epochUtc;
  if (
    typeof epoch !== 'string' ||
    !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(epoch) ||
    !Number.isFinite(Date.parse(epoch)) ||
    new Date(epoch).toISOString().slice(0, 19) !== epoch.slice(0, 19)
  )
    invalid('epochUtc');
  if (crossesUtcLeapSecond(Date.parse(epoch), Date.parse(epoch) + DAY * 1000)) invalid('leapDay');
  if (!['j2', 'twoBody'].includes(raw.gravity)) invalid('gravity');
  const source = raw.spacecraft.parameterSource ?? '';
  if (typeof source !== 'string' || source.length > 300) invalid('parameterSource');
  const s = { name: name(raw.spacecraft.name, 'craftName'), parameterSource: source.trim() };
  for (const [k, [, lo, hi]] of Object.entries(fields))
    s[k] = bounded(raw.spacecraft[k], lo, hi, k);
  if (s.perigeeKm > s.apogeeKm) invalid('apsides');
  if (s.initialWh > s.capacityWh || s.reserveWh > s.capacityWh) invalid('batteryRange');
  if (s.coldC >= s.hotC) invalid('thermalRange');
  const plans = raw.plans.map((plan) => {
    if (!plan || !['sun', 'zenith', 'nadir'].includes(plan.pointing)) invalid('pointing');
    if (!Array.isArray(plan.windows) || plan.windows.length > 64) invalid('windows');
    const windows = plan.windows
      .map((w) => {
        if (
          !Array.isArray(w) ||
          w.length !== 2 ||
          !w.every(Number.isInteger) ||
          w[0] < 0 ||
          w[1] > 1440 ||
          w[0] >= w[1]
        )
          invalid('windows');
        return [...w];
      })
      .sort((a, b) => a[0] - b[0]);
    if (windows.some((w, i) => i && w[0] < windows[i - 1][1])) invalid('overlap');
    return {
      name: name(plan.name, 'planName'),
      pointing: plan.pointing,
      payloadW: bounded(plan.payloadW, 0, 200, 'payloadW'),
      windows,
    };
  });
  const epochUtc = new Date(epoch).toISOString().replace('.000Z', 'Z');
  return {
    schemaVersion: 1,
    epochUtc,
    gravity: raw.gravity,
    forces: validateForces(raw.forces),
    trajectory: trajectoryInput(raw.trajectory),
    spacecraft: s,
    plans,
    ...(raw.observation == null ? {} : { observation: validateObservation(raw.observation) }),
  };
}

// Osculating elements relative to the conventional gravity reference radius, in EME2000.
export function initialOrbit(s) {
  const rp = RE + s.perigeeKm,
    ra = RE + s.apogeeKm;
  const e = (ra - rp) / (ra + rp),
    p = (2 * rp * ra) / (rp + ra);
  const O = s.raanDeg * radians,
    i = s.inclinationDeg * radians,
    w = s.argPerigeeDeg * radians,
    f = s.anomalyDeg * radians;
  const P = [Math.cos(O), Math.sin(O), 0],
    Q = [-Math.sin(O) * Math.cos(i), Math.cos(O) * Math.cos(i), Math.sin(i)];
  const r = p / (1 + e * Math.cos(f)),
    v = Math.sqrt(MU / p);
  const u = w + f;
  return [
    ...P.map((x, k) => r * (x * Math.cos(u) + Q[k] * Math.sin(u))),
    ...P.map(
      (x, k) => v * (-x * (Math.sin(u) + e * Math.sin(w)) + Q[k] * (Math.cos(u) + e * Math.cos(w)))
    ),
  ];
}
function environment(y, t) {
  return snapshotFromState({ position: y.slice(0, 3), velocity: y.slice(3) }, t);
}
function checkDrivingState(y) {
  if (!y) invalid('oemReplayCoverage');
  const r = y.slice(0, 3),
    v = y.slice(3, 6),
    radius = norm(r),
    speed = norm(v);
  // Resource/thermal models require exterior, Earth-bound flight and a defined orbital frame.
  if (
    !Number.isFinite(radius) ||
    radius <= EARTH_RADIUS + 80 ||
    !Number.isFinite(speed) ||
    speed <= 0 ||
    speed * speed >= (2 * MU) / radius ||
    norm(cross(r, v)) <= radius * speed * 1e-10
  )
    invalid('oemStateRange');
  return y;
}
export function panelNormal(env, pointing) {
  if (pointing === 'sun') return env.sunDir;
  return pointing === 'zenith' ? env.basis[2] : env.basis[2].map((v) => -v);
}
function solarFlux(env) {
  const d = norm(env.sun.map((v, i) => v - env.position[i]));
  return 1361 * (AU / d) ** 2;
}
function illumination(s, plan, env, flux, outer) {
  const incidence = Math.max(0, dot(panelNormal(env, plan.pointing), env.sunDir));
  const incidentW = flux * s.arrayM2 * env.illumination * incidence;
  const eta = Math.min(s.absorptance, Math.max(0, s.efficiency * (1 - 0.003 * (outer - 25))));
  return { incidentW, availableW: incidentW * eta };
}
function payloadOn(plan, sec) {
  return plan.windows.some(([start, end]) => start * 60 <= sec && sec < end * 60);
}
function newRun(s) {
  return {
    batteryWh: [s.initialWh],
    boardC: [s.initialC],
    outerC: [s.initialC],
    events: [],
    metrics: {
      minBatteryWh: s.initialWh,
      peakBoardC: s.initialC,
      minBoardC: s.initialC,
      solarUsedWh: 0,
      unservedWh: 0,
      energyResidualWh: 0,
    },
  };
}
function checkLimits(run, open, s, t, battery, board, includeBattery = true) {
  const readings = {
    lowBattery: [battery, s.reserveWh, true],
    hotBoard: [board, s.hotC, false],
    coldBoard: [board, s.coldC, true],
  };
  for (const [kind, [value, limit, low]] of Object.entries(readings)) {
    if (kind === 'lowBattery' && !includeBattery) continue;
    const event = open[kind];
    if (low ? value < limit : value > limit) {
      if (!event) {
        open[kind] = { kind, startSec: t, endSec: null, extreme: value, limit };
        run.events.push(open[kind]);
      } else event.extreme = low ? Math.min(event.extreme, value) : Math.max(event.extreme, value);
    } else if (event) {
      event.endSec = t;
      delete open[kind];
    }
  }
}

function recordBatterySegment(run, open, s, from, to, start, end, slope, gridEnd) {
  const crossing = (level) => Math.max(start, Math.min(end, start + (level - from) / slope));
  // A load pulse or saturation inside a telemetry interval changes the slope.
  // Retain those extra knots so event replay can recover the actual energy.
  if (slope > 0 && from < s.capacityWh && to >= s.capacityWh) {
    const full = crossing(s.capacityWh);
    if (full > start && full < end) run.batteryKnots.push([full, s.capacityWh]);
  }
  if (end < gridEnd) run.batteryKnots.push([end, to]);
  run.metrics.minBatteryWh = Math.min(run.metrics.minBatteryWh, to);
  const limit = s.reserveWh;
  if (to < limit) {
    if (!open.lowBattery) {
      const startSec = from >= limit && slope < 0 ? crossing(limit) : start;
      open.lowBattery = { kind: 'lowBattery', startSec, endSec: null, extreme: to, limit };
      run.events.push(open.lowBattery);
    } else open.lowBattery.extreme = Math.min(open.lowBattery.extreme, to);
  } else if (open.lowBattery) {
    open.lowBattery.endSec = from < limit && slope > 0 ? crossing(limit) : start;
    delete open.lowBattery;
  }
}
function supplyLoads(state, metrics, s, availableW, demand, shedW, h) {
  const { energy } = state,
    hours = h / 3600;
  const toLoad = Math.min(demand, availableW);
  const charge = Math.min(availableW - toLoad, (s.capacityWh - energy) / (hours * s.chargeEff));
  const discharge = Math.min(demand - toLoad, (energy * s.dischargeEff) / hours);
  const used = toLoad + charge,
    delivered = toLoad + discharge;
  const losses = charge * (1 - s.chargeEff) + discharge * (1 / s.dischargeEff - 1);
  const nextWh = Math.min(
    s.capacityWh,
    Math.max(0, energy + (charge * s.chargeEff - discharge / s.dischargeEff) * hours)
  );
  state.energy = nextWh;
  state.solarUsedWs += used * h;
  state.boardHeatWs += (delivered + losses) * h;
  metrics.solarUsedWh += used * hours;
  metrics.unservedWh += (shedW + demand - delivered) * hours;
}

const deviceChannels = ['activeW', 'cameraW', 'processorW', 'radioW', 'requestedW'];
function stepSystems(run, open, s, plan, env, flux, planetW, sec, h, devices) {
  const outer = run.outerC.at(-1),
    board = run.boardC.at(-1);
  const state = { energy: run.batteryWh.at(-1), solarUsedWs: 0, boardHeatWs: 0 };
  const solar = illumination(s, plan, env, flux, outer);
  const baseW = s.busW + (payloadOn(plan, sec + h / 2) ? plan.payloadW : 0);
  const stop = sec + h;
  if (!devices) {
    supplyLoads(state, run.metrics, s, solar.availableW, baseW, 0, h);
  } else {
    const samples = run.observationSamples;
    const wattSeconds = { activeW: 0, cameraW: 0, processorW: 0, radioW: 0, requestedW: 0 };
    // Keep the orbital environment fixed at the midpoint of this grid interval.
    // Internally split at equipment events and battery depletion so data moves
    // only while the responsible equipment actually receives energy.
    for (let t = sec; t < stop; ) {
      const hasBattery = state.energy > 1e-12;
      const powerBudget = hasBattery ? Infinity : Math.max(0, solar.availableW - baseW);
      const segment = devices.next(t, stop, powerBudget, hasBattery || solar.availableW >= baseW);
      if (t === sec) samples.storedMB.push(devices.storedMB);
      const demand = baseW + segment.activeW;
      let end = segment.endSec;
      let emptied = false;
      if (hasBattery && demand > solar.availableW) {
        const emptyAt = t + (state.energy * 3600 * s.dischargeEff) / (demand - solar.availableW);
        if (emptyAt <= end) {
          // At late epochs the final sliver of battery energy can span less
          // than one representable time increment. Preserve forward progress.
          end = emptyAt > t ? emptyAt : Math.min(end, t + Number.EPSILON * Math.max(1, t));
          emptied = true;
        }
      }
      const dt = end - t;
      if (!(dt > 0)) throw new Error('observationTime');
      const before = state.energy;
      supplyLoads(
        state,
        run.metrics,
        s,
        solar.availableW,
        demand,
        Math.max(0, segment.requestedW - segment.activeW),
        dt
      );
      if (emptied) state.energy = 0;
      const netW = solar.availableW - demand;
      recordBatterySegment(
        run,
        open,
        s,
        before,
        state.energy,
        t,
        end,
        (netW * (netW >= 0 ? s.chargeEff : 1 / s.dischargeEff)) / 3600,
        stop
      );
      for (const channel of deviceChannels) wattSeconds[channel] += segment[channel] * dt;
      devices.advance(segment, end);
      t = end;
    }
    for (const channel of deviceChannels) samples[channel].push(wattSeconds[channel] / h);
  }
  // Integrate loads over actual service intervals. The thermal network and PV
  // temperature coefficient share a fixed clock for both alternative plans.
  const conduction = s.conductance * (board - outer);
  const radiation = s.emissivity * SIGMA * s.radiatorM2 * ((outer + 273.15) ** 4 - 3 ** 4);
  const net = solar.incidentW * s.absorptance + planetW - radiation;
  const nextOuter = outer + (h * (net + conduction) - state.solarUsedWs) / s.outerJK;
  const nextBoard = board + (state.boardHeatWs - h * conduction) / s.boardJK;
  run.batteryWh.push(state.energy);
  run.boardC.push(nextBoard);
  run.outerC.push(nextOuter);
  const m = run.metrics;
  m.energyResidualWh -= net * (h / 3600);
  m.minBatteryWh = Math.min(m.minBatteryWh, state.energy);
  m.peakBoardC = Math.max(m.peakBoardC, nextBoard);
  m.minBoardC = Math.min(m.minBoardC, nextBoard);
  checkLimits(run, open, s, stop, state.energy, nextBoard, !devices);
}
export function runMission(input, stepSeconds = STEP) {
  const mission = validateMission(input);
  if (![1, 2, 5, 10].includes(stepSeconds)) invalid('step');
  const s = mission.spacecraft,
    epoch = Date.parse(mission.epochUtc);
  const { mode, name, oemText } = mission.trajectory;
  const oem = oemText ? parseOem(oemText) : null;
  const replay = mode === 'oemReplay';
  if (replay && !coversOem(oem, epoch, epoch + DAY * 1000)) invalid('oemReplayCoverage');
  if (mode === 'elements' && oem && (epoch > oem.stopMs || epoch + DAY * 1000 < oem.startMs))
    invalid('oemNoOverlap');
  const seed = mode === 'elements' ? initialOrbit(s) : sampleOem(oem, epoch);
  if (!seed) invalid('oemStartCoverage');
  const integrator = replay
    ? null
    : createPropagator({ gravity: mission.gravity, forces: mission.forces, epochMs: epoch });
  const orbit = [checkDrivingState(seed)],
    midpoints = [];
  for (let sec = 0; sec < DAY; sec += stepSeconds) {
    const half = stepSeconds / 2;
    const mid = checkDrivingState(
      replay
        ? sampleOem(oem, epoch + (sec + half) * 1000)
        : integrator.advance(orbit.at(-1), sec, half)
    );
    midpoints.push(mid);
    orbit.push(
      checkDrivingState(
        replay
          ? sampleOem(oem, epoch + (sec + stepSeconds) * 1000)
          : integrator.advance(mid, sec + half, half)
      )
    );
  }
  let observationAccess;
  if (mission.observation) {
    let stateAt;
    if (replay) {
      stateAt = (t) => sampleOem(oem, epoch + t * 1000);
      stateAt.segmentBreaksSec = oem.segments
        .slice(1)
        .map((segment) => (segment.startMs - epoch) / 1000)
        .filter((t) => t > 0 && t < DAY);
    }
    observationAccess = buildAccess(orbit, stepSeconds, epoch, mission.observation, stateAt);
  }
  const devices = observationAccess
    ? mission.observation.strategies.map((strategy) =>
        createObservationRun(mission.observation, observationAccess, strategy)
      )
    : null;
  const open = [{}, {}];
  const plans = mission.plans.map((plan, i) => {
    const run = newRun(s);
    if (devices) {
      run.observationSamples = Object.fromEntries(
        ['storedMB', ...deviceChannels].map((key) => [key, []])
      );
      run.batteryKnots = [];
    }
    checkLimits(run, open[i], s, 0, s.initialWh, s.initialC);
    return run;
  });
  for (let k = 0; k < midpoints.length; k++) {
    const sec = k * stepSeconds;
    const env = environment(midpoints[k], epoch + (sec + stepSeconds / 2) * 1000),
      flux = solarFlux(env);
    // Isothermal spherical-average view factor; local Lambertian albedo approximation.
    const view = (1 - Math.sqrt(1 - (EARTH_RADIUS / norm(env.position)) ** 2)) / 2;
    const planetW =
      s.radiatorM2 *
      view *
      (s.emissivity * 237 + s.absorptance * 0.3 * flux * Math.max(0, env.sunLocal[2]));
    plans.forEach((p, i) =>
      stepSystems(
        p,
        open[i],
        s,
        mission.plans[i],
        env,
        flux,
        planetW,
        sec,
        stepSeconds,
        devices?.[i]
      )
    );
  }
  for (const [i, p] of plans.entries()) {
    if (devices) {
      p.observation = devices[i].finish(DAY);
      p.observationSamples.storedMB.push(devices[i].storedMB);
      for (const channel of deviceChannels) p.observationSamples[channel].push(0);
    }
    p.metrics.energyResidualWh +=
      p.batteryWh.at(-1) -
      s.initialWh +
      (s.outerJK * (p.outerC.at(-1) - s.initialC) + s.boardJK * (p.boardC.at(-1) - s.initialC)) /
        3600;
  }
  return {
    schemaVersion: 1,
    model: MODEL,
    softwareVersion: app.displayVersion,
    frame: 'EME2000',
    timeSystem: 'UTC',
    units: {
      orbit: ['km', 'km', 'km', 'km/s', 'km/s', 'km/s'],
      batteryWh: 'Wh',
      boardC: '°C',
      outerC: '°C',
      eventTime: 's from epoch',
    },
    durationSec: DAY,
    stepSeconds,
    mission,
    trajectoryInfo: {
      mode,
      objectName: mode === 'elements' ? s.name : oem.objectName,
      objectId: mode === 'elements' ? null : oem.objectId,
      appliedGravity: replay ? null : mission.gravity,
      appliedForces: replay ? null : mission.forces,
      reference: oem
        ? {
            name,
            objectName: oem.objectName,
            objectId: oem.objectId,
            originator: oem.originator,
            createdMs: oem.createdMs,
            covarianceCount: oem.covarianceCount,
            version: oem.version,
            startMs: oem.startMs,
            stopMs: oem.stopMs,
            rowCount: oem.rowCount,
            segments: oem.segments.map(({ startMs, stopMs, interpolation, degree }) => ({
              startMs,
              stopMs,
              interpolation,
              degree,
            })),
          }
        : null,
    },
    orbitComparison: oem && !replay ? compareOrbit(orbit, stepSeconds, epoch, oem, name) : null,
    ...(observationAccess ? { observationAccess } : {}),
    orbit,
    plans,
  };
}
const replaySources = new WeakMap();
function upperKnotIndex(knots, t) {
  let lo = 0,
    hi = knots.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (knots[m][0] <= t) lo = m + 1;
    else hi = m;
  }
  return lo;
}
function energyAt(run, t, step) {
  const k = Math.floor(t / step);
  if (t === k * step) return run.batteryWh[k];
  let before = [k * step, run.batteryWh[k]],
    after = [(k + 1) * step, run.batteryWh[k + 1]];
  const knots = run.batteryKnots,
    lo = upperKnotIndex(knots, t);
  if (lo > 0 && knots[lo - 1][0] > before[0]) before = knots[lo - 1];
  if (lo < knots.length && knots[lo][0] < after[0]) after = knots[lo];
  return before[1] + ((after[1] - before[1]) * (t - before[0])) / (after[0] - before[0]);
}
export function replayAt(result, planIndex, sec, { exactOrbit = false } = {}) {
  const index = Math.max(
    0,
    Math.min(result.orbit.length - 1, Math.round(sec / result.stepSeconds))
  );
  const sampleSec = index * result.stepSeconds,
    timeSec = exactOrbit ? Math.max(0, Math.min(result.durationSec, sec)) : sampleSec;
  const t = Date.parse(result.mission.epochUtc) + 1000 * timeSec;
  let y = result.orbit[index];
  if (timeSec !== sampleSec) {
    if (result.mission.trajectory?.mode === 'oemReplay') {
      if (!replaySources.has(result))
        replaySources.set(result, parseOem(result.mission.trajectory.oemText));
      y = sampleOem(replaySources.get(result), t);
    } else y = denseStateAt(result.orbit, result.stepSeconds, timeSec);
  }
  const env = environment(y, t);
  const value = planTelemetry(result, planIndex, index, env);
  if (exactOrbit && timeSec !== sampleSec) {
    const run = result.plans[planIndex];
    if (run.batteryKnots) value.batteryWh = energyAt(run, timeSec, result.stepSeconds);
    const knots = run.observation?.storageKnots;
    if (knots) {
      const [start, stored, slope] = knots[upperKnotIndex(knots, timeSec) - 1];
      value.observation.storedMB = Math.max(0, stored + (timeSec - start) * slope);
    }
  }
  return { env, timeSec, sampleSec, t, ...value };
}
export function planTelemetry(result, planIndex, index, env) {
  const s = result.mission.spacecraft,
    timeSec = index * result.stepSeconds;
  const plan = result.mission.plans[planIndex],
    run = result.plans[planIndex];
  const active = payloadOn(plan, timeSec),
    panel = panelNormal(env, plan.pointing);
  const samples = run.observationSamples;
  return {
    panel,
    altitudeKm: norm(env.position) - RE,
    incidenceDeg: Math.acos(Math.max(-1, Math.min(1, dot(panel, env.sunDir)))) / radians,
    batteryWh: run.batteryWh[index],
    boardC: run.boardC[index],
    outerC: run.outerC[index],
    payloadOn: active,
    demandW: s.busW + (active ? plan.payloadW : 0) + (samples?.requestedW[index] ?? 0),
    ...(samples
      ? {
          observation: Object.fromEntries(
            ['storedMB', ...deviceChannels].map((k) => [k, samples[k][index]])
          ),
        }
      : {}),
    availableW: illumination(s, plan, env, solarFlux(env), run.outerC[index]).availableW,
  };
}
