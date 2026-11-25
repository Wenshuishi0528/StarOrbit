#!/usr/bin/env node
// Runs every test listed in tests/suite.json and reports all failures together.
//
//   npm test                    all tests, in parallel
//   npm test -- sky cloud       only tests whose path contains "sky" or "cloud"
//   npm test -- --serial        one at a time, in suite order
//   npm test -- --jobs 4        at most four tests at once
//
// Python tests prefer the project's .venv (npm run setup:python), so a broken
// system or Anaconda numpy/h5py install cannot hide the rest of the suite.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let filters, jobs;
try {
  const { values, positionals } = parseArgs({
    options: { serial: { type: 'boolean' }, jobs: { type: 'string', multiple: true } },
    allowPositionals: true,
  });
  filters = positionals;
  jobs = Math.min(8, os.availableParallelism());
  for (const value of values.jobs ?? []) {
    jobs = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(jobs) || jobs < 1)
      throw Error('--jobs requires a positive integer.');
  }
  if (values.serial) jobs = 1;
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const suite = JSON.parse(fs.readFileSync(path.join(root, 'tests/suite.json'), 'utf8'));
for (const file of suite)
  if (!fs.existsSync(path.join(root, file)))
    throw Error('tests/suite.json lists a missing file: ' + file);
const selected = filters.length
  ? suite.filter((file) => filters.some((f) => file.includes(f)))
  : suite;
if (!selected.length) {
  console.error('No test matches: ' + filters.join(' '));
  process.exit(1);
}

const venv = path.join(root, '.venv', 'bin');
const env = { ...process.env };
if (fs.existsSync(path.join(venv, 'python3'))) env.PATH = venv + path.delimiter + env.PATH;
else
  console.warn('Note: no .venv found; Python tests use the system python3 (npm run setup:python).');

function run(file) {
  const command = file.endsWith('.py') ? 'python3' : process.execPath;
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(command, [file], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => chunks.push(Buffer.from(String(error))));
    child.on('close', (code, signal) =>
      resolve({
        file,
        ok: code === 0,
        code: signal || code,
        seconds: (performance.now() - started) / 1000,
        output: Buffer.concat(chunks).toString('utf8'),
      })
    );
  });
}

const results = [];
let next = 0;
const tty = process.stdout.isTTY;
async function worker() {
  while (next < selected.length) {
    const result = await run(selected[next++]);
    results.push(result);
    const mark = result.ok ? '✓' : '✗';
    const line = `${mark} ${result.file} (${result.seconds.toFixed(1)}s)`;
    if (!result.ok || !tty) console.log(line);
    else process.stdout.write(`\r\x1b[K${results.length}/${selected.length} ${line}`);
  }
}
const started = performance.now();
await Promise.all(Array.from({ length: Math.min(jobs, selected.length) }, worker));
if (tty) process.stdout.write('\r\x1b[K');

const failed = results.filter((result) => !result.ok);
for (const result of failed) {
  const tail = result.output.trimEnd().split('\n').slice(-40).join('\n');
  console.log(`\n──── ${result.file} failed (exit ${result.code}) ────\n${tail}`);
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total in ${seconds}s` +
    (failed.length ? '\nFailed:\n' + failed.map((result) => '  ' + result.file).join('\n') : '')
);
process.exit(failed.length ? 1 : 0);
