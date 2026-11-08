import * as THREE from 'three';
import { skyReferenceLayers } from './sky-reference.js';

export function referenceLineGeometry(paths, radius = 1) {
  const positions = [];
  for (const path of paths)
    for (let i = 1; i < path.length; i++)
      for (const point of [path[i - 1], path[i]]) positions.push(...point.map((x) => x * radius));
  return new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
}

// Lines are rendered in the sky backdrop, before physical Earth/Moon/terrain
// and spacecraft. Epoch changes only rotate a mesh; they never rebuild stars.
export class SkyReferenceLayer {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.layers = new Map();
  }
  update(options, brightness = 1) {
    const active = skyReferenceLayers(options);
    for (const layer of this.layers.values()) layer.mesh.visible = false;
    for (const definition of active) {
      let layer = this.layers.get(definition.setting);
      if (!layer) {
        const material = new THREE.LineBasicMaterial({
          color: definition.color,
          transparent: true,
          opacity: definition.opacity,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        const mesh = new THREE.LineSegments(new THREE.BufferGeometry(), material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1.3;
        mesh.matrixAutoUpdate = false;
        layer = { mesh, key: '' };
        this.group.add(mesh);
        this.layers.set(definition.setting, layer);
      }
      if (layer.key !== definition.key) {
        layer.mesh.geometry.dispose();
        layer.mesh.geometry = referenceLineGeometry(definition.paths, 1000);
        layer.key = definition.key;
      }
      layer.mesh.visible = true;
      layer.mesh.material.opacity = definition.opacity * brightness;
      const columns = definition.columns;
      layer.mesh.matrix.set(
        columns[0][0],
        columns[1][0],
        columns[2][0],
        0,
        columns[0][1],
        columns[1][1],
        columns[2][1],
        0,
        columns[0][2],
        columns[1][2],
        columns[2][2],
        0,
        0,
        0,
        0,
        1
      );
      layer.mesh.matrixWorldNeedsUpdate = true;
    }
  }
  dispose() {
    for (const { mesh } of this.layers.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.group.removeFromParent();
    this.layers.clear();
  }
}
