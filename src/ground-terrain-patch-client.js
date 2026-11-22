// Send changed DEM arrays once; the orbit renderer retains its own live buffers.
export function createTerrainPatchWorker() {
  if (typeof __GROUND_PATCH_WORKER__ === 'undefined' || typeof Worker === 'undefined') return null;
  let worker,
    url,
    baseSent,
    surroundSent,
    sequence = 0,
    failed = false;
  const pending = new Map(),
    sent = new Map(),
    displayed = new Map();
  function dispose() {
    failed = true;
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
    for (const p of pending.values()) p.reject(Error('Ground worker stopped'));
    pending.clear();
    sent.clear();
    displayed.clear();
    worker = url = baseSent = surroundSent = null;
  }
  return {
    dispose,
    async build({ kind, site, options, records, base, grids, levels, surround, surroundSite }) {
      if (failed) throw Error('Ground worker unavailable');
      if (!worker) {
        url = URL.createObjectURL(new Blob([__GROUND_PATCH_WORKER__], { type: 'text/javascript' }));
        try {
          worker = new Worker(url);
        } catch (error) {
          dispose();
          throw error;
        }
        worker.onerror = dispose;
        worker.onmessage = ({ data: { id, data, error } }) => {
          const p = pending.get(id);
          pending.delete(id);
          if (p) error ? p.reject(Error(error)) : p.resolve(data);
        };
      }
      const updates = [],
        remove = [];
      for (const [k, g] of grids)
        if (sent.get(k) !== g.heights) {
          updates.push([k, g]);
          sent.set(k, g.heights);
        }
      for (const k of sent.keys())
        if (!grids.has(k)) {
          remove.push(k);
          sent.delete(k);
        }
      const id = ++sequence;
      const job = {
        id,
        kind,
        site,
        options,
        levels,
        updates,
        remove,
      };
      if (kind === 'surround') {
        job.records = records.map(({ data, fade }) => {
          const key = data.bounds.join(',');
          const record = { key, fade };
          if (displayed.get(key) !== data) {
            record.data = mesh(data);
            displayed.set(key, data);
          }
          return record;
        });
        const keep = new Set(job.records.map((r) => r.key));
        for (const key of displayed.keys()) if (!keep.has(key)) displayed.delete(key);
      }
      if (baseSent !== base) {
        job.base = {
          ...mesh(base),
          rasterHeights: base.rasterHeights,
          rasterWidth: base.rasterWidth,
          rasterHeight: base.rasterHeight,
        };
        baseSent = base;
      }
      if (kind === 'contact' && surroundSent !== surround) {
        job.surround = surround && {
          positions: surround.positions,
          segments: surround.segments,
          halfSize: surround.halfSize,
          gridDistances: surround.gridDistances,
          frame: surround.frame,
          sphereRadius: surround.sphereRadius,
        };
        job.surroundSite = surroundSite;
        surroundSent = surround;
      }
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          worker.postMessage(job);
        } catch (e) {
          dispose();
          reject(e);
        }
      });
    },
  };
}
function mesh(d) {
  const {
    positions,
    basePositions,
    normals,
    nodeHeights,
    columns,
    rows,
    gridSize,
    origin,
    radiusKm,
    bounds,
  } = d;
  return {
    positions,
    basePositions,
    normals,
    nodeHeights,
    columns,
    rows,
    gridSize,
    origin,
    radiusKm,
    bounds,
  };
}
