import * as THREE from 'three';
import { solarApparent } from './solar-system.js';

export class MainPlanets {
  constructor(environment) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, size] of [
      ['position', 3],
      ['color', 3],
      ['mag', 1],
    ]) {
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(7 * size, size).setUsage(THREE.DynamicDrawUsage)
      );
    }
    this.points = new THREE.Points(geometry, environment.stars.material);
    this.points.name = 'Solar system planets';
    this.points.frustumCulled = false;
    this.points.renderOrder = 1.4;
    geometry.setDrawRange(0, 0);
    environment.backdrop.add(this.points);
  }
  update(q, camera, stars, limit = Infinity) {
    this.points.visible = !!q && stars;
    if (!this.points.visible) return;
    const eye = camera.position.toArray();
    if (this.time === q.t && this.limit === limit && this.eye?.every((v, i) => v === eye[i]))
      return;
    this.time = q.t;
    this.eye = eye;
    this.limit = limit;
    const geometry = this.points.geometry,
      attrs = geometry.attributes,
      tint = new THREE.Color();
    let count = 0;
    for (const body of solarApparent(q, eye)) {
      // The Moon, Sun, Earth and foreground spacecraft render over this backdrop.
      if (body.id === 'Moon' || body.id === 'Sun' || body.behindEarth || body.mag > limit) continue;
      const [x, y, z] = body.direction;
      attrs.position.setXYZ(count, x * 1000, y * 1000, z * 1000);
      tint.setHex(body.color);
      attrs.color.setXYZ(count, tint.r, tint.g, tint.b);
      attrs.mag.setX(count, body.mag);
      count++;
    }
    for (const attr of Object.values(attrs)) attr.needsUpdate = true;
    geometry.setDrawRange(0, count);
  }
}
