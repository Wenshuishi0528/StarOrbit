import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const fixture = 'tests/render-surface.mjs';
const run = (...args) =>
  spawnSync(process.execPath, ['scripts/run-tests.mjs', ...args], { encoding: 'utf8' });

for (const args of [
  ['--jobs', '-1'],
  ['--jobs=0'],
  ['--jobs', '0.5'],
  ['--jobs', 'bad'],
  ['--jobs', '9007199254740992'],
  ['--serial', '--jobs=0'],
  ['--jobs'],
]) {
  const result = run(fixture, ...args);
  assert.equal(result.status, 2, args.join(' '));
  assert.match(result.stderr, /--jobs/);
  assert.doesNotMatch(result.stdout, /passed,/);
}
for (const args of [
  ['--jobs', '2'],
  ['--serial', '--jobs=2'],
]) {
  const result = run(...args, fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 passed, 0 failed, 1 total/);
}
