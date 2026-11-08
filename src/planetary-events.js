import {
  SearchRelativeLongitude,
  SearchLocalSolarEclipse,
  NextLocalSolarEclipse,
  SearchLunarEclipse,
  NextLunarEclipse,
  SearchRiseSet,
  Observer,
  ObserverVector,
  Equator,
  Horizon,
  GeoVector,
  HelioVector,
  JupiterMoons,
  RotationAxis,
} from 'astronomy-engine';

// API semantics checked against astronomy-engine 2.1.19 astronomy.d.ts and
// implementation: JupiterMoons uses jovicentric EQJ/AU; opposition longitude is
// heliocentric relative 0 degrees; local eclipse contacts require horizon checks.
// Independent regression references: NASA 2024 Apr 08 eclipse; USNO 2025 Mar 14
// lunar eclipse; IMCCE Mars opposition dates 2025 Jan 16 and 2027 Feb 19.
const DAY = 86400000,
  MINUTE = 60000,
  AU = 149597870.7,
  C = 299792.458;
const JUPITER = { equatorial: 71492, polar: 66854 };
const SUN_RADIUS = 695700;
const MOONS = [
  { id: 'Io', key: 'io', name: '木卫一', radius: 1821.6 },
  { id: 'Europa', key: 'europa', name: '木卫二', radius: 1560.8 },
  { id: 'Ganymede', key: 'ganymede', name: '木卫三', radius: 2634.1 },
  { id: 'Callisto', key: 'callisto', name: '木卫四', radius: 2410.3 },
];
const radius = {
  Sun: 695700,
  Moon: 1737.4,
  Mercury: 2440.53,
  Venus: 6051.8,
  Mars: 3396.19,
  Jupiter: 71492,
  Saturn: 60268,
  Uranus: 25559,
  Neptune: 24764,
};
const cache = new Map();
const vector = (v) => [v.x, v.y, v.z];
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (v) => Math.hypot(...v);
const unit = (v) => v.map((x) => x / norm(v));
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map((x) => x * s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const epoch = (t) => t.date.getTime();
const check = (signal) => {
  if (signal?.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Cancelled', 'AbortError');
};
async function yieldSearch(signal) {
  check(signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(signal);
}
function observerFor(site) {
  if (!site) return null;
  const { latitude, longitude } = site,
    height = site.height ?? 0;
  if (
    ![latitude, longitude, height].every(Number.isFinite) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new RangeError('观测地点无效');
  return new Observer(latitude, longitude, height);
}
function validateTime(time) {
  const date = new Date(time),
    year = date.getUTCFullYear();
  if (!Number.isFinite(time) || year < 1600 || year > 2200)
    throw new RangeError('天文事件支持 1600—2200 年');
  return time;
}
function altitude(body, time, observer) {
  const date = new Date(time),
    q = Equator(body, date, observer, true, true);
  return Horizon(date, observer, q.ra, q.dec, 'normal').altitude;
}
export function planetaryAngularDiameter(body, time, site = null) {
  if (!radius[body]) return null;
  const observer = observerFor(site),
    date = new Date(time);
  const distanceKm =
    (observer
      ? Equator(body, date, observer, true, true).dist
      : norm(vector(GeoVector(body, date, true)))) * AU;
  return {
    time,
    body,
    distanceKm,
    arcseconds: ((2 * Math.asin(radius[body] / distanceKm) * 180) / Math.PI) * 3600,
  };
}

// Visibility refers to a level astronomical horizon. Return a usable instant even
// when the global/local maximum itself occurs below the observer's horizon.
function visibleInterval(body, start, end, peak, observer) {
  if (!observer)
    return { visible: true, observableTime: peak, altitude: null, scope: 'geocentric' };
  const times = [start, end, clamp(peak, start, end)];
  const rise = SearchRiseSet(body, observer, 1, new Date(start), (end - start) / DAY);
  const set = SearchRiseSet(body, observer, -1, new Date(start), (end - start) / DAY);
  if (rise) times.push(Math.min(end, epoch(rise) + MINUTE));
  if (set) times.push(Math.max(start, epoch(set) - MINUTE));
  for (let t = start + 10 * MINUTE; t < end; t += 10 * MINUTE) times.push(t);
  const above = times
    .map((time) => ({ time, altitude: altitude(body, time, observer) }))
    .filter((p) => p.altitude > 0)
    .sort((a, b) => Math.abs(a.time - peak) - Math.abs(b.time - peak));
  return {
    visible: above.length > 0,
    observableTime: above[0]?.time ?? null,
    altitude: above[0]?.altitude ?? null,
    peakAltitude: altitude(body, peak, observer),
    scope: 'local-horizon',
  };
}
async function marsEvents(time, site, limit, signal) {
  await yieldSearch(signal);
  const next = epoch(SearchRelativeLongitude('Mars', 0, new Date(time)));
  let previous = epoch(SearchRelativeLongitude('Mars', 0, new Date(time - 1000 * DAY)));
  for (let i = 0; i < 3; i++) {
    const candidate = epoch(SearchRelativeLongitude('Mars', 0, new Date(previous + DAY)));
    if (candidate >= time) break;
    previous = candidate;
    await yieldSearch(signal);
  }
  const dates = limit === 1 ? [next] : [previous, next];
  return dates.map((t, i) => {
    const disc = planetaryAngularDiameter('Mars', t, site);
    return {
      id: `mars-opposition-${t}`,
      type: 'opposition',
      title: t < time ? '上一次火星冲' : '下一次火星冲',
      time: t,
      body: 'Mars',
      description: `火星与太阳分居天空两侧，适合观察火星表面。视直径 ${disc.arcseconds.toFixed(1)}″。`,
      angularDiameterArcsec: disc.arcseconds,
      distanceKm: disc.distanceKm,
      comparisonTime: dates.length > 1 ? dates[1 - i] : time,
      accuracy: 'astronomy-engine',
      source: 'Astronomy Engine · SearchRelativeLongitude',
    };
  });
}
async function lunarEvents(time, observer, limit, signal) {
  const rows = [];
  let event;
  for (let i = 0; i < 80 && rows.length < limit; i++) {
    await yieldSearch(signal);
    event = event ? NextLunarEclipse(event.peak) : SearchLunarEclipse(new Date(time));
    const peak = epoch(event.peak),
      start = peak - event.sd_penum * MINUTE,
      end = peak + event.sd_penum * MINUTE;
    if (new Date(peak).getUTCFullYear() > 2200) break;
    const visibility = visibleInterval('Moon', start, end, peak, observer);
    if (!visibility.visible) continue;
    const title = { total: '月全食', partial: '月偏食', penumbral: '半影月食' }[event.kind];
    rows.push({
      id: `lunar-eclipse-${peak}`,
      type: 'lunar-eclipse',
      kind: event.kind,
      title,
      time: peak,
      start,
      end,
      body: 'Moon',
      description:
        event.kind === 'penumbral'
          ? '月球经过地球半影，月面亮度轻微变化。'
          : '月球经过地球本影，观察地球影子在月面移动。',
      obscuration: event.obscuration,
      visibility,
      observableTime: visibility.observableTime,
      contacts: {
        penumbralStart: start,
        partialStart: event.sd_partial ? peak - event.sd_partial * MINUTE : null,
        totalStart: event.sd_total ? peak - event.sd_total * MINUTE : null,
        totalEnd: event.sd_total ? peak + event.sd_total * MINUTE : null,
        partialEnd: event.sd_partial ? peak + event.sd_partial * MINUTE : null,
        penumbralEnd: end,
      },
      accuracy: 'astronomy-engine',
      source: 'Astronomy Engine · SearchLunarEclipse',
    });
  }
  return rows;
}
async function solarEvents(time, observer, limit, signal) {
  if (!observer) throw new RangeError('查看日食需要选择地面观测地点');
  const rows = [];
  let event;
  for (let i = 0; i < 40 && rows.length < limit; i++) {
    await yieldSearch(signal);
    event = event
      ? NextLocalSolarEclipse(event.peak.time, observer)
      : SearchLocalSolarEclipse(new Date(time), observer);
    const peak = epoch(event.peak.time),
      start = epoch(event.partial_begin.time),
      end = epoch(event.partial_end.time);
    if (new Date(peak).getUTCFullYear() > 2200) break;
    const visibility = visibleInterval('Sun', start, end, peak, observer);
    if (!visibility.visible) continue;
    rows.push({
      id: `solar-eclipse-${peak}`,
      type: 'solar-eclipse',
      kind: event.kind,
      title: { total: '日全食', annular: '日环食', partial: '日偏食' }[event.kind],
      time: peak,
      start,
      end,
      body: 'Sun',
      description: `月球经过太阳前方；此地点食甚时太阳圆面遮蔽 ${(event.obscuration * 100).toFixed(1)}%。`,
      obscuration: event.obscuration,
      visibility,
      observableTime: visibility.observableTime,
      contacts: {
        partialStart: start,
        totalStart: event.total_begin ? epoch(event.total_begin.time) : null,
        totalEnd: event.total_end ? epoch(event.total_end.time) : null,
        partialEnd: end,
      },
      accuracy: 'astronomy-engine',
      source: 'Astronomy Engine · SearchLocalSolarEclipse',
    });
  }
  return rows;
}

function limbRadius(direction, north) {
  const z = dot(direction, north);
  return 1 / Math.sqrt((1 - z * z) / JUPITER.equatorial ** 2 + (z * z) / JUPITER.polar ** 2);
}
function ellipsoidRay(origin, direction, north, extra = 0) {
  const a = JUPITER.equatorial + extra,
    b = JUPITER.polar + extra;
  const metric = (u, v) =>
    dot(u, v) / (a * a) + dot(u, north) * dot(v, north) * (1 / (b * b) - 1 / (a * a));
  const A = metric(direction, direction),
    B = metric(origin, direction),
    D = B * B - A * (metric(origin, origin) - 1);
  if (D < 0) return null;
  const near = (-B - Math.sqrt(D)) / A,
    far = (-B + Math.sqrt(D)) / A;
  return far < 0 ? null : Math.max(0, near);
}
// Four independent geometric categories. Light-time is applied to Jupiter and
// its moons; oblate Jupiter is used for silhouette/shadow intersections. Limb
// overlap uses moon radii. These are visual planning estimates, not precision
// contact predictions or mutual-moon phenomena.
export function jovianEventGeometry(time, site = null) {
  const date = new Date(time),
    observer = observerFor(site),
    earth = scale(vector(HelioVector('Earth', date)), AU);
  const eye = observer
    ? add(earth, scale(vector(ObserverVector(date, observer, false)), AU))
    : earth;
  let emission = time,
    jupiter;
  for (let i = 0; i < 3; i++) {
    jupiter = scale(vector(HelioVector('Jupiter', new Date(emission))), AU);
    emission = time - (norm(sub(jupiter, eye)) / C) * 1000;
  }
  const emitted = new Date(emission),
    moons = JupiterMoons(emitted),
    north = unit(vector(RotationAxis('Jupiter', emitted).north));
  const toEarth = unit(sub(eye, jupiter)),
    toSun = unit(scale(jupiter, -1)),
    sunDistance = norm(jupiter),
    awaySun = scale(toSun, -1);
  return MOONS.map((moon) => {
    const p = scale(vector(moons[moon.key]), AU),
      front = dot(p, toEarth) > 0;
    const overlap =
      ellipsoidRay(p, front ? scale(toEarth, -1) : toEarth, north, moon.radius) !== null;
    const depth = dot(p, awaySun),
      transverse = sub(p, scale(awaySun, depth)),
      separation = norm(transverse);
    const effectiveRadius =
      separation > 0 ? limbRadius(scale(transverse, 1 / separation), north) : JUPITER.equatorial;
    const penumbra =
      effectiveRadius + (Math.max(0, depth) * (SUN_RADIUS + effectiveRadius)) / sunDistance;
    const umbra =
      effectiveRadius - (Math.max(0, depth) * (SUN_RADIUS - effectiveRadius)) / sunDistance;
    const shadowDistance = ellipsoidRay(p, awaySun, north);
    const shadowPoint = shadowDistance !== null ? add(p, scale(awaySun, shadowDistance)) : null;
    const shadowNormal =
      shadowPoint === null
        ? null
        : add(
            scale(shadowPoint, 1 / JUPITER.equatorial ** 2),
            scale(
              north,
              dot(shadowPoint, north) * (1 / JUPITER.polar ** 2 - 1 / JUPITER.equatorial ** 2)
            )
          );
    const shadowVisible = shadowPoint !== null && dot(shadowNormal, toEarth) > 0;
    return {
      moon: moon.id,
      name: moon.name,
      transit: front && overlap,
      occultation: !front && overlap,
      eclipse: depth > 0 && separation < penumbra + moon.radius,
      totalEclipse: depth > 0 && separation + moon.radius < umbra,
      shadowTransit: shadowVisible,
      emissionTime: emission,
    };
  });
}
const jovianTypes = {
  transit: { label: '凌木星', description: '卫星经过木星圆面前方。' },
  occultation: { label: '被木星掩', description: '卫星从木星背后经过，被木星遮挡。' },
  eclipse: { label: '食', description: '卫星经过木星阴影；起止采用进入、离开半影的几何估计。' },
  shadowTransit: { label: '影凌木星', description: '卫星影子中心经过木星朝向地球的圆面。' },
};
async function jupiterEvents(time, site, limit, signal, moonId = null) {
  const observer = observerFor(site),
    start = time,
    end = time + 7 * DAY,
    step = 5 * MINUTE,
    rows = [],
    open = new Map();
  let previous = jovianEventGeometry(start, site),
    previousTime = start;
  const matches = (row) => !moonId || row.moon === moonId;
  for (const row of previous.filter(matches))
    for (const type of Object.keys(jovianTypes))
      if (row[type]) open.set(`${row.moon}:${type}`, { start, ongoing: true });
  async function boundary(a, b, moon, type, before) {
    for (let i = 0; i < 12 && b - a > 3000; i++) {
      check(signal);
      const mid = (a + b) / 2,
        state = jovianEventGeometry(mid, site).find((r) => r.moon === moon)[type];
      if (state === before) a = mid;
      else b = mid;
    }
    return Math.round((a + b) / 2);
  }
  for (let now = start + step, index = 0; now <= end; now += step, index++) {
    if (index % 12 === 0) await yieldSearch(signal);
    const current = jovianEventGeometry(now, site);
    for (const [i, row] of current.entries()) {
      if (!matches(row)) continue;
      for (const [type, definition] of Object.entries(jovianTypes)) {
        const key = `${row.moon}:${type}`;
        if (row[type] === previous[i][type]) continue;
        const contact = await boundary(previousTime, now, row.moon, type, previous[i][type]);
        if (row[type]) open.set(key, { start: contact, ongoing: false });
        else {
          const begin = open.get(key);
          open.delete(key);
          if (!begin) continue;
          const middle = (begin.start + contact) / 2,
            visibility = visibleInterval('Jupiter', begin.start, contact, middle, observer);
          if (!visibility.visible) continue;
          const sunAltitude = observer
            ? altitude('Sun', visibility.observableTime, observer)
            : null;
          rows.push({
            id: `jovian-${key}-${Math.round(begin.start)}`,
            type: `jovian-${type}`,
            title: row.name + definition.label,
            body: 'Jupiter',
            satellite: row.moon,
            time: Math.round(middle),
            start: Math.round(begin.start),
            end: contact,
            ongoing: begin.ongoing,
            description: definition.description,
            visibility: {
              ...visibility,
              sunAltitude,
              darkSky: sunAltitude === null ? null : sunAltitude < -6,
            },
            observableTime: visibility.observableTime,
            accuracy: 'geometric-estimate',
            accuracyLabel: '几何估计',
            timeResolutionSeconds: 60,
            scanStepSeconds: 300,
            source: 'Astronomy Engine · JupiterMoons; oblate Jupiter / geometric shadow',
          });
        }
      }
    }
    previous = current;
    previousTime = now;
    // Finish all events already underway before selecting the first rows.
    if (rows.length >= limit && open.size === 0) break;
  }
  return rows.sort((a, b) => a.time - b.time).slice(0, limit);
}

export async function findPlanetaryEvents({
  time,
  site = null,
  body = 'Mars',
  limit = 6,
  signal,
} = {}) {
  validateTime(time);
  observerFor(site);
  check(signal);
  limit = Math.max(1, Math.min(20, Math.floor(Number(limit) || 6)));
  const key = JSON.stringify([
    time,
    site?.latitude,
    site?.longitude,
    site?.height ?? 0,
    body,
    limit,
  ]);
  if (cache.has(key)) return structuredClone(cache.get(key));
  let rows;
  if (body === 'Mars') rows = await marsEvents(time, site, limit, signal);
  else if (body === 'Sun') rows = await solarEvents(time, observerFor(site), limit, signal);
  else if (body === 'Moon') rows = await lunarEvents(time, observerFor(site), limit, signal);
  else if (body === 'Earth')
    rows = [
      ...(await solarEvents(time, observerFor(site), limit, signal)),
      ...(await lunarEvents(time, observerFor(site), limit, signal)),
    ]
      .sort((a, b) => a.time - b.time)
      .slice(0, limit);
  else if (body === 'Jupiter' || MOONS.some((m) => m.id === body))
    rows = await jupiterEvents(time, site, limit, signal, body === 'Jupiter' ? null : body);
  else rows = [];
  check(signal);
  cache.set(key, structuredClone(rows));
  while (cache.size > 12) cache.delete(cache.keys().next().value);
  return rows;
}
export async function planetaryComparisonDates({ time, site = null, body = 'Mars', signal } = {}) {
  const events = await findPlanetaryEvents({ time, site, body, limit: 2, signal });
  const chosen = body === 'Mars' ? events : events.slice(0, 1);
  return chosen.map((row) => ({
    time: row.time,
    label: row.title,
    body: row.body,
    ...planetaryAngularDiameter(row.body, row.time, site),
  }));
}
