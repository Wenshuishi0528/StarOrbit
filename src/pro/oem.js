// CCSDS 502.0-B-3 §§5, 7: KVN orbit ephemerides for Earth / EME2000 / UTC.
// Each segment owns its interpolation stencil, including any producer-supplied padding.
export const OEM_MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 100000;
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
const timePattern =
  /^(\d{4})-(?:(\d{2})-(\d{2})|(\d{3}))T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,16}))?Z?$/;
const headerKeys = new Set([
  'CCSDS_OEM_VERS',
  'CREATION_DATE',
  'ORIGINATOR',
  'MESSAGE_ID',
  'CLASSIFICATION',
]);
const metaKeys = new Set([
  'OBJECT_NAME',
  'OBJECT_ID',
  'CENTER_NAME',
  'REF_FRAME',
  'REF_FRAME_EPOCH',
  'TIME_SYSTEM',
  'START_TIME',
  'USEABLE_START_TIME',
  'USEABLE_STOP_TIME',
  'STOP_TIME',
  'INTERPOLATION',
  'INTERPOLATION_DEGREE',
]);

// Effective UTC midnights in the IERS TAI-UTC table. The simulator's Unix clock cannot
// represent an inserted UTC second, even when an ephemeris has no row explicitly marked :60.
const leapMidnights = (
  '1972-07 1973-01 1974-01 1975-01 1976-01 1977-01 1978-01 1979-01 1980-01 1981-07 1982-07 ' +
  '1983-07 1985-07 1988-01 1990-01 1991-01 1992-07 1993-07 1994-07 1996-01 1997-07 1999-01 ' +
  '2006-01 2009-01 2012-07 2015-07 2017-01'
)
  .split(' ')
  .map((s) => Date.parse(s + '-01T00:00:00Z'));

export function crossesUtcLeapSecond(startMs, stopMs) {
  return leapMidnights.some((t) => startMs < t && t <= stopMs);
}

function invalid(line, detail) {
  const error = new RangeError('oemInvalid');
  error.line = line;
  error.detail = (line ? 'L' + line + ' · ' : '') + detail;
  throw error;
}
function numeric(s, line) {
  const n = Number(s);
  if (!numberPattern.test(s) || !Number.isFinite(n))
    invalid(line, 'Invalid numeric field: ' + s.slice(0, 50));
  return n;
}
function timeMs(value, line) {
  const m = timePattern.exec(value);
  if (!m)
    invalid(line, 'Expected a CCSDS UTC calendar or day-of-year epoch: ' + value.slice(0, 64));
  const [year, month, day, doy, hh, mm, ss] = m.slice(1, 8).map(Number);
  if (ss === 60) invalid(line, 'UTC leap-second labels (:60) require a leap-aware time scale');
  const date = new Date(0);
  date.setUTCFullYear(year, m[4] ? 0 : month - 1, m[4] ? doy : day);
  if (
    date.getUTCFullYear() !== year ||
    (!m[4] && (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day)) ||
    hh > 23 ||
    mm > 59 ||
    ss > 59
  )
    invalid(line, 'Invalid UTC date/time: ' + value);
  date.setUTCHours(hh, mm, ss, 0);
  // Date.parse truncates .999999 to .999. Retain the fraction up to binary64 precision.
  return date.getTime() + (m[8] ? Number('0.' + m[8]) * 1000 : 0);
}
function timeText(ms) {
  let whole = Math.floor(ms / 1000) * 1000;
  let nanos = Math.round((ms - whole) * 1e6);
  if (nanos === 1e9) {
    whole += 1000;
    nanos = 0;
  }
  const fraction = String(nanos).padStart(9, '0').replace(/0+$/, '');
  return new Date(whole).toISOString().slice(0, 19) + (fraction ? '.' + fraction : '') + 'Z';
}
function value(fields, key, line) {
  if (!Object.hasOwn(fields, key)) invalid(line, 'Missing ' + key);
  return fields[key].value;
}
function assignment(line, lineNo) {
  const match = /^([A-Z][A-Z0-9_]*)\s*=\s*(\S.*?)\s*$/.exec(line);
  if (!match) invalid(lineNo, 'Expected KEY = VALUE');
  return [match[1], match[2]];
}
function put(fields, keys, line, lineNo) {
  const [key, v] = assignment(line, lineNo);
  if (!keys.has(key)) invalid(lineNo, 'Unsupported keyword ' + key);
  if (Object.hasOwn(fields, key)) invalid(lineNo, 'Duplicate ' + key);
  fields[key] = { value: v, line: lineNo };
}
function validateHeader(header, line) {
  const version = value(header, 'CCSDS_OEM_VERS', line);
  if (!['2.0', '3.0'].includes(version))
    invalid(header.CCSDS_OEM_VERS.line, 'CCSDS_OEM_VERS must be 2.0 or 3.0');
  return {
    version,
    originator: value(header, 'ORIGINATOR', line),
    createdMs: timeMs(value(header, 'CREATION_DATE', line), header.CREATION_DATE.line),
  };
}
function setupSegment(meta, line) {
  for (const [key, correct] of [
    ['CENTER_NAME', 'EARTH'],
    ['REF_FRAME', 'EME2000'],
    ['TIME_SYSTEM', 'UTC'],
  ]) {
    const v = value(meta, key, line);
    if (v.toUpperCase() !== correct)
      invalid(meta[key].line, key + ' = ' + v + ' (supported: ' + correct + ')');
  }
  if (meta.REF_FRAME_EPOCH) {
    // EME2000 has an intrinsic epoch. Do not silently accept a different equinox.
    const frameEpoch = timeMs(meta.REF_FRAME_EPOCH.value, meta.REF_FRAME_EPOCH.line);
    const j2000 = Date.UTC(2000, 0, 1, 12);
    if (frameEpoch !== j2000 && Math.abs(frameEpoch - (j2000 - 64184)) > 0.001) {
      invalid(meta.REF_FRAME_EPOCH.line, 'REF_FRAME_EPOCH conflicts with fixed EME2000');
    }
  }
  const start = timeMs(value(meta, 'START_TIME', line), meta.START_TIME.line);
  const stop = timeMs(value(meta, 'STOP_TIME', line), meta.STOP_TIME.line);
  const usableStart = meta.USEABLE_START_TIME
    ? timeMs(meta.USEABLE_START_TIME.value, meta.USEABLE_START_TIME.line)
    : start;
  const usableStop = meta.USEABLE_STOP_TIME
    ? timeMs(meta.USEABLE_STOP_TIME.value, meta.USEABLE_STOP_TIME.line)
    : stop;
  if (!(start <= usableStart && usableStart <= usableStop && usableStop <= stop))
    invalid(line, 'Inconsistent START/STOP/USEABLE times');
  return {
    objectName: value(meta, 'OBJECT_NAME', line),
    objectId: value(meta, 'OBJECT_ID', line),
    declaredStartMs: start,
    declaredStopMs: stop,
    startMs: usableStart,
    stopMs: usableStop,
    rows: [],
    covarianceCount: 0,
  };
}
function finishSegment(s, meta, line) {
  if (!s.rows.length) invalid(line, 'Missing ephemeris data');
  s.dataStartMs = s.rows[0][0];
  s.dataStopMs = s.rows.at(-1)[0];
  if (s.dataStartMs < s.declaredStartMs || s.dataStopMs > s.declaredStopMs)
    invalid(line, 'State epochs outside declared START_TIME / STOP_TIME');
  s.startMs = Math.max(s.startMs, s.dataStartMs);
  s.stopMs = Math.min(s.stopMs, s.dataStopMs);
  if (s.startMs > s.stopMs) invalid(line, 'No states bracket the usable interval');
  if (crossesUtcLeapSecond(s.dataStartMs, s.dataStopMs))
    invalid(line, 'State segment spans a UTC leap second; split at the time discontinuity');
  const method = meta.INTERPOLATION,
    order = meta.INTERPOLATION_DEGREE;
  if (Boolean(method) !== Boolean(order))
    invalid((method ?? order).line, 'Supply both INTERPOLATION and INTERPOLATION_DEGREE');
  if (!method) {
    s.interpolation = s.rows.length === 1 ? 'NONE' : 'HERMITE';
    s.multiplicity = s.rows.length === 1 ? 1 : 2;
    s.degree = s.rows.length === 1 ? 0 : 2 * Math.min(s.rows.length, 4) - 1;
  } else {
    s.interpolation = method.value.toUpperCase();
    s.degree = Number(order.value);
    if (!/^\+?\d+$/.test(order.value) || s.degree < 1 || s.degree > 15)
      invalid(order.line, 'Supported interpolation degree: 1–15');
    s.multiplicity = 1;
    if (s.interpolation === 'LINEAR') {
      if (s.degree !== 1) invalid(order.line, 'LINEAR uses degree 1');
    } else if (s.interpolation === 'HERMITE') {
      const count = s.degree + 1;
      if (s.rows[0].length === 10 && count >= 6 && count % 3 === 0) s.multiplicity = 3;
      else if (count >= 4 && count % 2 === 0) s.multiplicity = 2;
      else
        invalid(
          order.line,
          'HERMITE degree requires complete position/velocity or position/velocity/acceleration nodes'
        );
    } else if (s.interpolation !== 'LAGRANGE')
      invalid(method.line, 'Unsupported INTERPOLATION: ' + method.value);
  }
  s.nodeCount = (s.degree + 1) / s.multiplicity;
  if (s.nodeCount > s.rows.length)
    invalid(line, 'Too few state records for interpolation degree ' + s.degree);
}

// Covariance is structurally checked and counted. Its numbers are not used as observations.
function covarianceLine(cov, line, n) {
  if (line.includes('=')) {
    const [key, v] = assignment(line, n);
    if (key === 'EPOCH') {
      if (cov.count && cov.rows !== 6) invalid(n, 'Incomplete 6×6 covariance matrix');
      const t = timeMs(v, n);
      if (t <= cov.epoch) invalid(n, 'Covariance epochs must increase');
      if (t < cov.start || t > cov.stop)
        invalid(n, 'Covariance epoch outside declared START_TIME / STOP_TIME');
      cov.epoch = t;
      cov.rows = 0;
      cov.hasFrame = false;
      cov.count++;
      return;
    }
    if (key === 'COV_REF_FRAME' && cov.count && !cov.rows && !cov.hasFrame) {
      cov.hasFrame = true;
      return;
    }
    invalid(n, 'Unexpected covariance keyword: ' + key);
  }
  const nums = line.split(/\s+/, 7);
  if (!cov.count || cov.rows >= 6 || nums.length !== cov.rows + 1)
    invalid(n, 'Expected lower-triangular covariance row');
  nums.forEach((v) => numeric(v, n));
  cov.rows++;
}

export function parseOem(text) {
  if (typeof text !== 'string') invalid(0, 'Expected CCSDS OEM KVN text');
  if (text.length > OEM_MAX_BYTES || new TextEncoder().encode(text).length > OEM_MAX_BYTES)
    invalid(0, 'OEM file exceeds 8 MiB');
  const header = Object.create(null),
    segments = [];
  let info,
    meta,
    segment,
    cov,
    phase = 'header',
    rowCount = 0,
    lineNo = 0;
  function finish() {
    finishSegment(segment, meta, lineNo);
    const last = segments.at(-1);
    if (last && (last.objectId !== segment.objectId || last.objectName !== segment.objectName))
      invalid(lineNo, 'All segments must describe one object');
    if (last && segment.startMs < last.stopMs)
      invalid(lineNo, 'Overlapping or out-of-order usable segments');
    segments.push(segment);
  }
  // Iterate lines instead of splitting an 8 MiB file with many short/empty lines into millions of strings.
  for (const match of text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    lineNo++;
    const line = match[0].trim();
    if (!line) continue;
    if (!header.CCSDS_OEM_VERS && !/^CCSDS_OEM_VERS\s*=/.test(line))
      invalid(lineNo, 'Expected CCSDS_OEM_VERS header (KVN)');
    if (/^COMMENT(?:\s|$)/.test(line)) continue;
    if (line === 'META_START') {
      if (phase === 'header') info = validateHeader(header, lineNo);
      else if (phase === 'rows' || phase === 'afterCov') finish();
      else invalid(lineNo, 'Unexpected META_START inside ' + phase);
      phase = 'meta';
      meta = Object.create(null);
      continue;
    }
    if (line === 'META_STOP') {
      if (phase !== 'meta') invalid(lineNo, 'Unexpected META_STOP');
      segment = setupSegment(meta, lineNo);
      phase = 'rows';
      continue;
    }
    if (line === 'COVARIANCE_START') {
      if (phase !== 'rows' || !segment.rows.length)
        invalid(lineNo, 'COVARIANCE_START must follow state data');
      cov = {
        count: 0,
        rows: 0,
        epoch: -Infinity,
        hasFrame: false,
        start: segment.declaredStartMs,
        stop: segment.declaredStopMs,
      };
      phase = 'cov';
      continue;
    }
    if (line === 'COVARIANCE_STOP') {
      if (phase !== 'cov' || !cov.count || cov.rows !== 6)
        invalid(lineNo, 'Incomplete covariance block');
      segment.covarianceCount = cov.count;
      phase = 'afterCov';
      continue;
    }
    if (phase === 'header') put(header, headerKeys, line, lineNo);
    else if (phase === 'meta') put(meta, metaKeys, line, lineNo);
    else if (phase === 'cov') covarianceLine(cov, line, lineNo);
    else if (phase === 'rows') {
      const columns = line.split(/\s+/, 11);
      if (columns.length !== 7 && columns.length !== 10)
        invalid(lineNo, 'Expected epoch, position, velocity and optional acceleration');
      const previous = segment.rows.at(-1),
        t = timeMs(columns[0], lineNo);
      if (previous && (t <= previous[0] || previous.length !== columns.length))
        invalid(lineNo, 'State epochs must increase with consistent columns in each segment');
      if (++rowCount > MAX_ROWS) invalid(lineNo, 'More than 100000 state records');
      segment.rows.push([t, ...columns.slice(1).map((v) => numeric(v, lineNo))]);
    } else invalid(lineNo, 'Expected the next META_START after covariance data');
  }
  if (phase !== 'rows' && phase !== 'afterCov')
    invalid(lineNo, 'Missing or unterminated OEM segment');
  finish();
  return {
    ...info,
    objectName: segments[0].objectName,
    objectId: segments[0].objectId,
    center: 'EARTH',
    frame: 'EME2000',
    timeSystem: 'UTC',
    startMs: segments[0].startMs,
    stopMs: segments.at(-1).stopMs,
    rowCount,
    segments,
    covarianceCount: segments.reduce((n, seg) => n + seg.covarianceCount, 0),
  };
}

function lastAtOrBefore(items, time, epoch) {
  let lo = 0,
    hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (epoch(items[mid]) <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
const segmentStart = (s) => s.startMs;
const rowTime = (r) => r[0];
export function coversOem(parsed, startMs, stopMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || startMs > stopMs) return false;
  const segs = parsed.segments,
    i = lastAtOrBefore(segs, startMs, segmentStart);
  if (i < 0 || startMs > segs[i].stopMs) return false;
  let end = segs[i].stopMs;
  for (let j = i + 1; end < stopMs && j < segs.length; j++) {
    if (segs[j].startMs > end) return false;
    end = segs[j].stopMs;
  }
  return end >= stopMs;
}
export function* oemEpochs(parsed, startMs = parsed.startMs, stopMs = parsed.stopMs) {
  for (let i = 0; i < parsed.segments.length; i++) {
    const s = parsed.segments[i],
      next = parsed.segments[i + 1];
    if (s.stopMs < startMs || s.startMs > stopMs) continue;
    for (const [t] of s.rows) {
      if (t < startMs || t < s.startMs) continue;
      if (t > stopMs || t > s.stopMs) break;
      // The right segment owns a shared timestamp, even across a velocity discontinuity.
      if (t !== next?.startMs) yield t;
    }
  }
}

// Confluent Newton coefficients on a normalized, local time axis. A 2-fold node
// contributes (p,v), a 3-fold node (p,v,a). For Lagrange each PV component is independent.
const polynomialCache = new WeakMap();
function polynomial(s, first) {
  const cached = polynomialCache.get(s);
  if (cached?.first === first) return cached;
  const t0 = s.rows[first][0],
    span = s.rows[first + s.nodeCount - 1][0] - t0;
  const seconds = span / 1000,
    m = s.multiplicity,
    n = s.degree + 1,
    dims = m === 1 ? 6 : 3;
  const nodes = [],
    c = [];
  for (let j = 0; j < n; j++) {
    const row = s.rows[first + Math.floor(j / m)];
    nodes.push((row[0] - t0) / span);
    c.push(row.slice(1, 1 + dims));
  }
  for (let order = 1; order < n; order++) {
    for (let j = n - 1; j >= order; j--) {
      const dx = nodes[j] - nodes[j - order],
        row = s.rows[first + Math.floor(j / m)];
      for (let k = 0; k < dims; k++) {
        if (dx) c[j][k] = (c[j][k] - c[j - 1][k]) / dx;
        else c[j][k] = order === 1 ? row[4 + k] * seconds : (row[7 + k] * seconds * seconds) / 2;
      }
    }
  }
  const data = { first, t0, span, seconds, nodes, c };
  polynomialCache.set(s, data);
  return data;
}
function sampleSegment(s, t) {
  const lower = lastAtOrBefore(s.rows, t, rowTime);
  if (s.rows[lower][0] === t) return s.rows[lower].slice(1, 7);
  const first = Math.min(
    s.rows.length - s.nodeCount,
    Math.max(0, lower - Math.floor((s.nodeCount - 1) / 2))
  );
  const { t0, span, seconds, nodes, c } = polynomial(s, first);
  const x = (t - t0) / span,
    values = c.at(-1).slice(),
    derivatives = [0, 0, 0];
  for (let j = c.length - 2; j >= 0; j--) {
    const factor = x - nodes[j];
    for (let k = 0; k < values.length; k++) {
      if (s.multiplicity > 1) derivatives[k] = derivatives[k] * factor + values[k];
      values[k] = values[k] * factor + c[j][k];
    }
  }
  if (s.multiplicity > 1) values.push(...derivatives.map((v) => v / seconds));
  if (!values.every(Number.isFinite))
    invalid(0, 'Ill-conditioned interpolation stencil at ' + timeText(t));
  return values;
}
export function sampleOem(parsed, utcMs) {
  if (!Number.isFinite(utcMs)) return null;
  const i = lastAtOrBefore(parsed.segments, utcMs, segmentStart),
    s = parsed.segments[i];
  return !s || utcMs > s.stopMs ? null : sampleSegment(s, utcMs);
}

function exportField(name) {
  return typeof name === 'string' && /^[\x20-\x7e]{1,200}$/.test(name.trim())
    ? name.trim()
    : 'UNKNOWN';
}
export function writeOem(result, cadenceSec = 60) {
  const epoch = Date.parse(result.mission.epochUtc),
    h = result.stepSeconds,
    duration = result.durationSec;
  if (!Number.isSafeInteger(cadenceSec) || cadenceSec <= 0)
    invalid(0, 'Export cadence must be a positive whole second');
  if (
    result.frame !== 'EME2000' ||
    result.timeSystem !== 'UTC' ||
    !Number.isFinite(epoch) ||
    !(duration > 0) ||
    !(h > 0) ||
    !Array.isArray(result.orbit) ||
    result.orbit.length !== duration / h + 1
  )
    invalid(0, 'Expected uniformly sampled EME2000/UTC solver results');
  const end = epoch + duration * 1000;
  if (crossesUtcLeapSecond(epoch, end))
    invalid(0, 'Cannot export a uniformly timed result spanning a UTC leap second');
  const trajectory = result.mission.trajectory,
    mode = trajectory?.mode;
  const source = mode === 'oemInitial' || mode === 'oemReplay' ? result.trajectoryInfo : null;
  const replay = mode === 'oemReplay';
  const message = replay
    ? 'Resampled supplied ephemeris. This is a derived product.'
    : mode === 'oemInitial'
      ? 'Simulated trajectory propagated from a supplied OEM state.'
      : 'Simulated trajectory propagated from mission orbital elements.';
  const localName = String(result.mission.spacecraft.name);
  const name = exportField(source?.objectName ?? localName),
    id = exportField(source?.objectId);
  const lines = ['CCSDS_OEM_VERS = 3.0', 'COMMENT Generated by StarOrbit Pro. ' + message];
  // CCSDS KVN is printable ASCII. Keep a non-ASCII user label without inventing an object ID.
  if (name === 'UNKNOWN' && localName && localName !== 'UNKNOWN') {
    const encoded = Array.from(localName, (c) =>
      encodeURIComponent(/^[\uD800-\uDFFF]$/.test(c) ? '\uFFFD' : c)
    );
    let chunk = '';
    for (const token of encoded) {
      if (chunk.length + token.length > 200) {
        lines.push('COMMENT Local name (percent-encoded): ' + chunk);
        chunk = '';
      }
      chunk += token;
    }
    if (chunk) lines.push('COMMENT Local name (percent-encoded): ' + chunk);
  }
  lines.push('CREATION_DATE = ' + new Date().toISOString(), 'ORIGINATOR = STARORBIT', '');
  let rowsWritten = 0;
  // A replay can have a state discontinuity at a shared segment boundary. Emit both
  // one-sided states in separate blocks, each evaluated with its original stencil.
  const parsed = replay ? parseOem(trajectory.oemText) : null;
  if (replay && !coversOem(parsed, epoch, end))
    invalid(0, 'Source OEM does not continuously cover the exported replay');
  const stored = replay
    ? null
    : {
        rows: result.orbit.map((state, i) => [epoch + i * h * 1000, ...state]),
        degree: 3,
        multiplicity: 2,
        nodeCount: 2,
      };
  const segments = replay ? parsed.segments : [{ startMs: epoch, stopMs: end }];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i],
      start = Math.max(epoch, segment.startMs),
      stop = Math.min(end, segment.stopMs);
    if (start > stop) continue;
    // Exclude a previous segment which contributes only the left side of the mission start.
    if (stop === epoch && segments[i + 1]?.startMs === epoch) continue;
    lines.push(
      'META_START',
      'OBJECT_NAME = ' + name,
      'OBJECT_ID = ' + id,
      'CENTER_NAME = EARTH',
      'REF_FRAME = EME2000',
      'TIME_SYSTEM = UTC',
      'START_TIME = ' + timeText(start),
      'STOP_TIME = ' + timeText(stop)
    );
    if (start < stop) lines.push('INTERPOLATION = HERMITE', 'INTERPOLATION_DEGREE = 3');
    lines.push('META_STOP');
    const write = (t) => {
      const state = sampleSegment(replay ? segment : stored, t);
      if (state.length !== 6 || !state.every(Number.isFinite))
        invalid(0, 'Invalid exported state at ' + timeText(t));
      lines.push(timeText(t) + ' ' + state.map((v) => v.toExponential(15).toUpperCase()).join(' '));
      if (++rowsWritten > MAX_ROWS) invalid(0, 'Export exceeds 100000 rows; increase the cadence');
    };
    write(start);
    const dt = cadenceSec * 1000;
    for (let k = Math.floor((start - epoch) / dt) + 1; epoch + k * dt < stop; k++)
      write(epoch + k * dt);
    if (start < stop) write(stop);
    lines.push('');
  }
  const text = lines.join('\n');
  if (text.length > OEM_MAX_BYTES) invalid(0, 'Export exceeds 8 MiB; increase the cadence');
  return text;
}
