import { predictPasses } from './pass-prediction.js';
import { findPassList } from './pass-list-search.js';
import { findHighPass } from './pass-highpoint-search.js';

// Both planners dispatch through this contract; presentation and skyline remain local.
export const PREDICTION_HOURS = [24, 48, 72, 168];
export const DEFAULT_PREDICTION = { hours: 24, minimumElevation: 5, minimumPeakElevation: 60 };
export function queryObservation(
  data,
  observer,
  start,
  {
    direction = 0,
    list = false,
    end,
    visibleOnly = false,
    hours = DEFAULT_PREDICTION.hours,
    minimumElevation = DEFAULT_PREDICTION.minimumElevation,
    minimumPeakElevation = DEFAULT_PREDICTION.minimumPeakElevation,
    daylight = 'any',
    history = false,
    signal,
    onProgress,
  } = {}
) {
  if (list)
    return findPassList(data, observer, start, {
      end,
      minimumPeakElevation,
      daylight,
      visibleOnly,
      signal,
      onProgress,
    });
  return direction
    ? findHighPass(data, observer, start, {
        direction,
        minimumPeakElevation,
        daylight,
        signal,
        onProgress,
      })
    : predictPasses(data, observer, start, hours, { minimumElevation, history, signal });
}
