import * as THREE from 'three';
import {
  buildGroundPatch,
  makeMeasuredSampler,
  terrainPatchSampler,
} from './ground-world-surface.js';
import { patchBoxes } from './ground-terrain-horizon.js';
const grids = new Map(),
  displayed = new Map();
let base, surround, surroundSite;
self.onmessage = ({ data: job }) => {
  try {
    for (const k of job.remove) grids.delete(k);
    for (const [k, g] of job.updates) grids.set(k, g);
    if (job.base) base = job.base;
    if ('surround' in job) {
      surround = job.surround;
      surroundSite = job.surroundSite;
    }
    const records = (job.records || []).map(({ key, data, fade }) => {
      if (data) displayed.set(key, data);
      return { data: displayed.get(key), fade };
    });
    if (job.records) {
      const keep = new Set(job.records.map((r) => r.key));
      for (const key of displayed.keys()) if (!keep.has(key)) displayed.delete(key);
    }
    const sample = makeMeasuredSampler(grids, job.levels, base);
    const data = buildGroundPatch(
      job.site,
      terrainPatchSampler(sample, base, records, surround, surroundSite, job.options),
      job.options
    );
    const g = new THREE.BufferGeometry();
    data.kilometres = new Float32Array(data.positions.length);
    for (let i = 0; i < data.positions.length; i++) data.kilometres[i] = data.positions[i] / 1000;
    g.setAttribute('position', new THREE.BufferAttribute(data.kilometres, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    data.normals = g.attributes.normal.array;
    data.sphere = [...g.boundingSphere.center.toArray(), g.boundingSphere.radius];
    data.horizonBoxes = Float64Array.from(patchBoxes(data));
    self.postMessage(
      { id: job.id, data },
      Object.values(data)
        .filter(ArrayBuffer.isView)
        .map((a) => a.buffer)
    );
  } catch (e) {
    self.postMessage({ id: job.id, error: e.message });
  }
};
