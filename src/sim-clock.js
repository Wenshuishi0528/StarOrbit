import { MIN_TIME, MAX_TIME } from './orbit.js';

// One definition of how features move simulated time. The fields stay on the
// simulation object (sessions and scenes save them directly); these helpers keep
// the multi-field updates consistent wherever playback is started or handed back.

// A view that suspended the main loop hands it back without replaying the
// wall-clock time that passed meanwhile.
export function resumeClock(sim, wall = performance.now()) {
  sim.lastWall = wall;
}

// Ask the main loop to recompute the pose; snap also re-aims the camera.
export function invalidate(sim, { snap = true } = {}) {
  sim.dirty = true;
  if (snap) sim.snap = true;
}

// Custom-time playback at the given rate (simulated seconds per second).
export function play(sim, speed = sim.speed) {
  sim.mode = 'custom';
  sim.speed = speed;
  sim.paused = false;
  sim.timeUI();
}

// Full-screen views that draw their own frames advance time here. Steps are
// capped at 0.25 s so a stalled frame never jumps; leaving the supported range
// pauses playback at the boundary.
export function advanceClock(sim, wall, dt, { min = MIN_TIME, max = MAX_TIME } = {}) {
  sim.lastWall = wall;
  if (sim.mode === 'real') sim.time = Date.now();
  else if (!sim.paused) {
    const next = sim.time + Math.max(0, Math.min(0.25, dt)) * sim.speed * 1000;
    sim.time = Math.max(min, Math.min(max, next));
    if (sim.time !== next) sim.paused = true;
  }
}
