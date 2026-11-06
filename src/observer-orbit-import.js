import { parseMissionOrbit } from './gp-orbit.js';
import { predictionSource } from './pass-prediction.js';
import { orbitSelection, sameSelection } from './observer-settings.js';

// Reading the file and persisting it may both yield. Keep a late import in its
// own mission's library, and preserve any more recent explicit selection.
export async function importObserverOrbit(sim, id, file, isCurrent = () => true) {
  if (!file || file.size > 30e6) throw Error('文件超过 30 MB');
  const initial = orbitSelection(sim, id),
    weather = sim.environment.weather;
  const data = parseMissionOrbit(await file.text(), id),
    source = predictionSource(data);
  await weather.ready;
  const record = await weather.store(
    'orbit',
    new Blob([JSON.stringify(data)], { type: 'application/json' }),
    { missionId: id, time: source.epoch, source: '导入轨道', favorite: true }
  );
  let applied = false;
  try {
    if (isCurrent() && sameSelection(initial, orbitSelection(sim, id))) {
      sim.orbits.accept(data, record.id, id);
      applied = true;
    }
    await weather.trim([record.id]);
    return { applied, record };
  } finally {
    weather.pendingRecords?.delete(record.id);
  }
}
