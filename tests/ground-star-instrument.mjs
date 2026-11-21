import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createGroundStarMount } from '../src/ground-star-instrument.js';
import { groundViewDirection } from '../src/ground-world-math.js';

const mount = createGroundStarMount();
const tube = mount.root.getObjectByName('opticalTube');
const axes = [0, 45, 90, 180, 270, 359.99, 720, -80];
const elevations = [-5, 0, 19.25, 58, 89.99, 90];
const fixedLeg = mount.root.children.find((object) => object.isMesh);
mount.root.updateMatrixWorld(true);
const footFrame = fixedLeg.matrixWorld.clone();
for (const az of axes) {
  mount.point(az, 0);
  const bearingCentre = tube.getWorldPosition(new Vector3());
  for (const alt of elevations) {
    mount.point(az, alt);
    const pivot = tube.localToWorld(new Vector3());
    const lineOfSight = tube.localToWorld(new Vector3(0, 1, 0)).sub(pivot);
    const expected = new Vector3(...groundViewDirection(az, alt));
    assert.ok(lineOfSight.distanceTo(expected) < 1e-11);
    assert.ok(pivot.distanceTo(bearingCentre) < 1e-12);
    assert.ok(fixedLeg.matrixWorld.equals(footFrame));
  }
}
const meshes = [];
mount.root.traverse((object) => {
  if (object.isMesh) meshes.push(object);
});
assert.ok(meshes.length < 20 && meshes.length > 0);
const geometries = new Set(meshes.map((mesh) => mesh.geometry));
const materials = new Set(meshes.map((mesh) => mesh.material));
const released = new Set();
for (const resource of [...geometries, ...materials]) {
  resource.addEventListener('dispose', () => released.add(resource));
}
mount.dispose();
assert.equal(released.size, geometries.size + materials.size);
console.log(
  'Ground telescope: horizontal + zenith boresight in ENU, fixed tripod, shared batches and owned resource release passed.'
);
