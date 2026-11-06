// These are editable teaching controls, not published thruster specifications.
// Translation is m/s²; angular values are degrees/s² and degrees/s.
export const FREE_FLIGHT_RCS_DEFAULTS = Object.freeze({
  acceleration: 0.08,
  angularAcceleration: 3,
  maxAngularRate: 6,
});
export const FREE_FLIGHT_RCS_RANGES = Object.freeze({
  acceleration: Object.freeze({ min: 0.005, max: 1, step: 0.005 }),
  angularAcceleration: Object.freeze({ min: 0.1, max: 15, step: 0.1 }),
  maxAngularRate: Object.freeze({ min: 0.25, max: 30, step: 0.25 }),
});

// Values are teaching controls, in m/s². An attached module becomes flyable
// only when both its docking interface and its control profile are configured.
const vessels = {
  SZ: { name: '神舟', port: 'SZ_INBOARD', acceleration: 0.08 },
  TZ: { name: '天舟', port: 'TZ_INBOARD', acceleration: 0.08 },
};
export function flightVessel(type) {
  return Object.hasOwn(vessels, type) ? vessels[type] : null;
}
