import { birthdayCalendar } from './birthday-calendar.js';
import { earthAxes, sunPosition } from './orbit.js';
import { normalizeStarChartSettings } from './star-chart-settings.js';

export const BIRTHDAY_SKY_DEFAULT_TIME = '20:00';

// A date without a birth time still needs one explicit instant for the moving
// planets. This display convention never resolves an ambiguous zodiac birthday.
export function birthdaySkyMoment({ date, time = '', utcOffset = 8 } = {}) {
  birthdayCalendar({ date, time, utcOffset });
  const localTime = time || BIRTHDAY_SKY_DEFAULT_TIME;
  const [hour, minute] = localTime.split(':').map(Number);
  const epoch = Date.parse(date + 'T00:00:00Z') + (hour - utcOffset) * 3600000 + minute * 60000;
  return { date, epoch, localTime, utcOffset, timeAssumed: !time };
}

// The target axes, stellar catalogue and imagery all stay in EQJ/J2000. The
// independent epoch changes planets and true-of-date coordinate overlays, not
// the camera target, the simulator clock, or the borrowed historical imagery.
export function birthdaySkyFrame({
  date,
  time = '',
  utcOffset = 8,
  view,
  culture = 'western',
  targetId = null,
  chartSettings = {},
  language = 'zh',
} = {}) {
  const moment = birthdaySkyMoment({ date, time, utcOffset });
  if (!['western', 'chinese'].includes(culture)) throw Error('Unknown birthday sky culture');
  if (
    !view ||
    !Number.isFinite(view.fovY) ||
    view.fovY <= 0 ||
    view.fovY >= 179 ||
    !Number.isFinite(view.aspect) ||
    view.aspect <= 0
  )
    throw Error('Invalid birthday sky camera');
  const axes = Object.fromEntries(
    ['right', 'up', 'forward'].map((key) => {
      const values = view[key];
      if (
        !Array.isArray(values) ||
        values.length !== 3 ||
        !values.every(Number.isFinite) ||
        Math.abs(Math.hypot(...values) - 1) > 1e-6
      )
        throw Error('Invalid birthday sky camera axes');
      return [key, [...values]];
    })
  );
  for (const [a, b] of [
    ['right', 'up'],
    ['right', 'forward'],
    ['up', 'forward'],
  ])
    if (Math.abs(axes[a].reduce((sum, value, index) => sum + value * axes[b][index], 0)) > 1e-6)
      throw Error('Invalid birthday sky camera axes');
  return {
    moment,
    q: {
      t: moment.epoch,
      position: [0, 0, 0],
      basis: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      earthAxes: earthAxes(moment.epoch),
      sun: sunPosition(moment.epoch),
    },
    eyeKm: [0, 0, 0],
    eyeLocal: [0, 0, 0],
    axes,
    localAxes: structuredClone(axes),
    fovY: view.fovY,
    aspect: view.aspect,
    chartSettings: normalizeStarChartSettings({ ...chartSettings, skyCulture: culture }),
    focusTargetId: targetId,
    language,
    photoNames: true,
    previewNames: true,
    apertureMm: 600,
    exposure: 1,
    showStars: true,
    showGalaxy: true,
    skyExposure: 'cinematic',
    skyBrightness: 1,
    showStation: false,
    solarChannel: 'none',
    solarObservation: null,
    overviewArtworkId: null,
  };
}
