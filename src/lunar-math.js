import * as Astronomy from 'astronomy-engine';
import { AU, cross, dot, norm, sub, unit } from './orbit.js';
import { lunarState, MOON_RADIUS } from './moon-math.js';

export const LUNAR_MIN_TIME = Date.UTC(1900, 0, 1);
export const LUNAR_MAX_TIME = Date.UTC(2101, 0, 1) - 1;
const DEG = 180 / Math.PI;
const DAY = 86400000;
const clamp = (x) => Math.max(-1, Math.min(1, x));
const array = (v) => [v.x, v.y, v.z];
const scale = (v, n) => v.map((x) => x * n);
const toBody = (v, axes) => axes.map((axis) => dot(v, axis));
const coordinates = (v) => ({
  longitude: Math.atan2(v[1], v[0]) * DEG,
  latitude: Math.asin(clamp(v[2] / norm(v))) * DEG,
});

function dateFrom(time) {
  const ms = time instanceof Date ? time.getTime() : time;
  if (!Number.isFinite(ms) || ms < LUNAR_MIN_TIME || ms > LUNAR_MAX_TIME)
    throw new RangeError(
      'Lunar observations require a Date or UTC epoch milliseconds in 1900–2100.'
    );
  return new Date(ms);
}

function makeObserver(location) {
  const { latitude, longitude, height = 0 } = location ?? {};
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(height) ||
    height < -500 ||
    height > 10000
  )
    throw new RangeError(
      'Observer: latitude ±90°, east longitude ±180°, ground height −500…10000 metres.'
    );
  return new Astronomy.Observer(latitude, longitude, height);
}

function positionAngle(direction, north, east) {
  const x = dot(direction, east),
    y = dot(direction, north);
  return Math.hypot(x, y) < 1e-12 ? null : (Math.atan2(x, y) * DEG + 360) % 360;
}

/**
 * Physical positions: geocentric J2000 equatorial kilometres. Body coordinates:
 * IAU prime meridian +X, 90° east +Y, lunar north +Z, matching moon.js.
 * Surface orientation uses the existing IAU WGCCRE model, not a second texture rotation.
 * https://astropedia.astrogeology.usgs.gov/download/Docs/WGCCRE/WGCCRE2015reprint.pdf
 * Phase fraction is geometric, not brightness; it does not include lunar eclipses.
 * Celestial north up is distinct from local zenith up or telescope optical inversion.
 * https://svs.gsfc.nasa.gov/5587/
 */
export function lunarObservation(time, location) {
  const date = dateFrom(time),
    observer = makeObserver(location);
  const state = lunarState(date.getTime());
  const axes = [state.prime, cross(state.north, state.prime), state.north];
  const moonPositionKm = state.position;
  const sunPositionKm = scale(array(Astronomy.GeoVector(Astronomy.Body.Sun, date, false)), AU);
  const observerPositionKm = scale(array(Astronomy.ObserverVector(date, observer, false)), AU);
  const observerFromMoon = sub(observerPositionKm, moonPositionKm);
  const sunFromMoon = sub(sunPositionKm, moonPositionKm);
  const earthFromMoon = scale(moonPositionKm, -1);
  const distanceKm = norm(observerFromMoon),
    earthDistanceKm = norm(earthFromMoon);
  const moonSunDistanceKm = norm(sunFromMoon);
  const observerDirection = unit(observerFromMoon),
    sunDirection = unit(sunFromMoon);
  const sight = scale(observerDirection, -1);
  const celestialPole = array(
    Astronomy.RotateVector(Astronomy.Rotation_EQD_EQJ(date), new Astronomy.Vector(0, 0, 1, date))
  );
  const skyEast = unit(cross(celestialPole, sight));
  const skyNorth = unit(cross(sight, skyEast));
  // Difference of geodetic observer vectors gives geodetic up, not geocentric radial up.
  const raisedObserver = new Astronomy.Observer(
    observer.latitude,
    observer.longitude,
    observer.height + 1000
  );
  const zenith = unit(
    sub(scale(array(Astronomy.ObserverVector(date, raisedObserver, false)), AU), observerPositionKm)
  );
  const observerPositionBodyKm = toBody(observerFromMoon, axes);
  const sunPositionBodyKm = toBody(sunFromMoon, axes);
  const observerDirectionBody = unit(observerPositionBodyKm);
  const sunDirectionBody = unit(sunPositionBodyKm);
  const earthDirectionBody = unit(toBody(earthFromMoon, axes));
  const phaseCosine = clamp(dot(observerDirection, sunDirection));
  const phaseLongitudeDeg = Astronomy.MoonPhase(date);
  const eq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const geometric = Astronomy.Horizon(date, observer, eq.ra, eq.dec);
  const apparent = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
  const libration = Astronomy.Libration(date);
  return {
    timeMs: date.getTime(),
    observer: {
      latitude: observer.latitude,
      longitude: observer.longitude,
      height: observer.height,
    },
    moonPositionKm,
    sunPositionKm,
    observerPositionKm,
    axes,
    observerPositionBodyKm,
    sunPositionBodyKm,
    observerDirectionBody,
    sunDirectionBody,
    earthDirectionBody,
    upDirectionBody: unit(toBody(skyNorth, axes)),
    distanceKm,
    earthDistanceKm,
    moonSunDistanceKm,
    angularDiameterDeg: 2 * Math.asin(MOON_RADIUS / distanceKm) * DEG,
    illuminatedFraction: (1 + phaseCosine) / 2,
    geocentricIlluminatedFraction: (1 + clamp(dot(unit(earthFromMoon), sunDirection))) / 2,
    phaseAngleDeg: Math.acos(phaseCosine) * DEG,
    phaseLongitudeDeg,
    waxing: phaseLongitudeDeg < 180,
    rightAscensionHours: eq.ra,
    declinationDeg: eq.dec,
    azimuthDeg: geometric.azimuth,
    geometricAltitudeDeg: geometric.altitude,
    apparentAltitudeDeg: apparent.altitude,
    aboveHorizon: geometric.altitude > 0,
    subObserver: coordinates(observerDirectionBody),
    subEarth: coordinates(earthDirectionBody),
    subSolar: coordinates(sunDirectionBody),
    // Meeus libration is a separate approximation; do not use it to rotate this frame.
    geocentricLibration: { longitude: libration.elon, latitude: libration.elat },
    polePositionAngleDeg: positionAngle(state.north, skyNorth, skyEast),
    brightLimbPositionAngleDeg: positionAngle(sunDirection, skyNorth, skyEast),
    zenithPositionAngleDeg: positionAngle(zenith, skyNorth, skyEast),
  };
}

/**
 * Spherical point geometry, including finite observer distance. Longitude is east-positive.
 * No DEM horizon, crater-wall shadow, atmospheric visibility or eclipse attenuation.
 * Height changes the radial point only, not its surface normal or neighbouring terrain.
 */
export function lunarFeatureState(observation, feature) {
  const { longitude, latitude, heightKm = 0 } = feature ?? {};
  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(heightKm) ||
    MOON_RADIUS + heightKm <= 0
  )
    throw new RangeError(
      'Lunar feature requires east longitude ±180°, latitude ±90°, and a valid height in km.'
    );
  const lon = longitude / DEG,
    lat = latitude / DEG;
  const normalBody = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const pointBodyKm = scale(normalBody, MOON_RADIUS + heightKm);
  const observerRay = unit(sub(observation.observerPositionBodyKm, pointBodyKm));
  const sunRay = unit(sub(observation.sunPositionBodyKm, pointBodyKm));
  const cosEmission = clamp(dot(normalBody, observerRay));
  const cosIncidence = clamp(dot(normalBody, sunRay));
  return {
    normalBody,
    pointBodyKm,
    visible: cosEmission > 0,
    sunlit: cosIncidence > 0,
    cosEmission,
    cosIncidence,
    emissionAngleDeg: Math.acos(cosEmission) * DEG,
    incidenceAngleDeg: Math.acos(cosIncidence) * DEG,
    solarAltitudeDeg: Math.asin(cosIncidence) * DEG,
  };
}

/**
 * Expensive searches: call on date/location changes, never once per animation frame.
 * Rise/set uses the upper limb, standard refraction, level local horizon, no terrain/weather.
 * Observer height is metres above sea level, NOT height above surrounding ground.
 * Event timestamps are UTC epoch milliseconds; missing events return null.
 * https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md
 */
export function lunarEvents(time, location, { limitDays = 2 } = {}) {
  const date = dateFrom(time),
    observer = makeObserver(location),
    startMs = date.getTime();
  if (!Number.isFinite(limitDays) || limitDays <= 0 || limitDays > 35)
    throw new RangeError('Lunar event search window must be greater than 0 and at most 35 days.');
  const endMs = Math.min(startMs + limitDays * DAY, LUNAR_MAX_TIME);
  const days = (endMs - startMs) / DAY;
  const inWindow = (event) => {
    const ms = event?.date.getTime();
    return Number.isFinite(ms) && ms >= startMs && ms <= endMs ? ms : null;
  };
  const riseTimeMs =
    days > 0
      ? inWindow(Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, 1, date, days))
      : null;
  const setTimeMs =
    days > 0
      ? inWindow(Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, date, days))
      : null;
  const transit =
    days > 0 ? Astronomy.SearchHourAngle(Astronomy.Body.Moon, observer, 0, date, 1) : null;
  const transitTimeMs = inWindow(transit?.time);
  const phaseEndMs = Math.min(startMs + 35 * DAY, LUNAR_MAX_TIME);
  const names = ['new', 'first-quarter', 'full', 'last-quarter'];
  const phases = [];
  let quarter = Astronomy.SearchMoonQuarter(date);
  for (let i = 0; i < 4; i++) {
    const timeMs = quarter.time.date.getTime();
    if (timeMs > phaseEndMs) break;
    phases.push({ id: names[quarter.quarter], phase: quarter.quarter, timeMs });
    if (i < 3) quarter = Astronomy.NextMoonQuarter(quarter);
  }
  return {
    startTimeMs: startMs,
    endTimeMs: endMs,
    phaseEndTimeMs: phaseEndMs,
    riseTimeMs,
    setTimeMs,
    transitTimeMs,
    transitAltitudeDeg: transitTimeMs === null ? null : transit.hor.altitude,
    phases,
  };
}
