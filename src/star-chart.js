import { SkyReferenceLayer } from './sky-reference-layer.js';
import { SKY_REFERENCE_GLYPHS } from './sky-reference.js';
import * as THREE from 'three';
import { computeBoundsTree } from 'three-mesh-bvh';
import { getSkyCulture, normalizeSkyCulture } from './sky-cultures.js';
import { equatorial } from './environment-math.js';
import { solarLabel } from './solar-targets.js';
import { getLanguage } from './i18n.js';
import { buildSkyAnnotationLayout } from './sky-annotation-layout.js';
import { DEEP_SKY_OBJECTS, deepSkyRegionLabel } from './deep-sky-catalog.js';
import { deepSkyLabel } from './star-chart-symbols.js';
import { starChartGlyphText } from './star-label-catalog.js';

const RADIUS = 1000,
  EARTH = 6371,
  MOON = 1737.4,
  CELL = 32,
  FONT = 24;
const vector = (ra, dec) => new THREE.Vector3(...equatorial(ra, dec));
const vertex = `attribute vec2 offset;attribute vec2 lifetime;attribute vec3 tint;
uniform vec2 viewport;uniform float clock;uniform vec4 earthDisc,moonDisc;
varying vec2 texUV;varying vec3 color;varying float alpha;
void main(){vec3 dir=normalize(position);bool hidden=dot(dir,earthDisc.xyz)>earthDisc.w||dot(dir,moonDisc.xyz)>moonDisc.w;
alpha=hidden?0.:smoothstep(lifetime.x,lifetime.x+.18,clock)*(1.-smoothstep(lifetime.y,lifetime.y+.18,clock));
color=tint;texUV=uv;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);p.xy+=offset*2./viewport*p.w;gl_Position=p;}`;
const fragment = `uniform sampler2D atlas;uniform float brightness;varying vec2 texUV;varying vec3 color;varying float alpha;
void main(){float a=texture2D(atlas,texUV).a*alpha*brightness;if(a<.005)discard;gl_FragColor=vec4(color,a);
#include <colorspace_fragment>
}`;
const labelVertex = `attribute vec3 anchor;attribute vec2 glyphOffset;attribute vec4 glyphRect;attribute float glyphScale;attribute vec2 lifetime;attribute vec3 tint;
uniform vec2 viewport;uniform float clock;uniform vec4 earthDisc,moonDisc;
varying vec2 texUV;varying vec3 color;varying float alpha;
void main(){vec3 dir=normalize(anchor);bool hidden=dot(dir,earthDisc.xyz)>earthDisc.w||dot(dir,moonDisc.xyz)>moonDisc.w;
alpha=hidden?0.:smoothstep(lifetime.x,lifetime.x+.18,clock)*(1.-smoothstep(lifetime.y,lifetime.y+.18,clock));
color=tint;texUV=glyphRect.xy+uv*glyphRect.zw;vec4 p=projectionMatrix*modelViewMatrix*vec4(anchor,1.);
p.xy+=(glyphOffset+position.xy*32.*glyphScale)*2./viewport*p.w;gl_Position=p;}`;
const glyphAttributes = {
  anchor: 3,
  glyphOffset: 2,
  glyphRect: 4,
  glyphScale: 1,
  tint: 3,
  lifetime: 2,
};
function labelGeometry(capacity = 0) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  for (const [name, size] of Object.entries(glyphAttributes))
    geometry.setAttribute(
      name,
      new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(
        THREE.DynamicDrawUsage
      )
    );
  geometry.instanceCount = 0;
  return geometry;
}
const symbolVertex = vertex
  .replace(
    'attribute vec2 offset;',
    'attribute float symbolType;attribute vec2 symbolSize;varying float kind;varying vec2 size;attribute vec2 offset;'
  )
  .replace('void main(){', 'void main(){kind=symbolType;size=symbolSize;');
const symbolFragment = `uniform float brightness;varying vec2 texUV;varying vec3 color;varying float alpha;varying float kind;varying vec2 size;
void main(){vec2 p=texUV*2.-1.;float radius=length(p),edge=abs(radius-.82);
if(kind>0.5&&kind<1.5)edge=abs(max(abs(p.x),abs(p.y))-.82);
float thickness=1.4/max(7.,min(size.x,size.y));float aa=max(.012,fwidth(edge));
float ink=1.-smoothstep(thickness,thickness+aa,edge);
if(kind>1.5){float crossLine=min(abs(p.x),abs(p.y));ink=max(ink,(1.-smoothstep(thickness,thickness+aa,crossLine))*step(radius,.82));}
float a=ink*alpha*brightness*.72;if(a<.005)discard;gl_FragColor=vec4(color,a);
#include <colorspace_fragment>
}`;
function lineGeometry(paths, trim) {
  const points = [];
  for (const path of paths)
    for (let i = 1; i < path.length; i++) {
      let a = vector(...path[i - 1]),
        b = vector(...path[i]),
        angle = a.angleTo(b);
      if (angle < 1e-8) continue;
      const interpolate = (t) =>
        a
          .clone()
          .multiplyScalar(Math.sin((1 - t) * angle))
          .addScaledVector(b, Math.sin(t * angle))
          .divideScalar(Math.sin(angle))
          .normalize();
      const end = Math.min(trim / angle, 0.15),
        steps = Math.max(1, Math.ceil(angle / THREE.MathUtils.degToRad(2)));
      for (let j = 0; j < steps; j++)
        points.push(
          ...interpolate(end + ((1 - 2 * end) * j) / steps)
            .multiplyScalar(RADIUS)
            .toArray(),
          ...interpolate(end + ((1 - 2 * end) * (j + 1)) / steps)
            .multiplyScalar(RADIUS)
            .toArray()
        );
    }
  return new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3)
  );
}
export class StarChart {
  constructor(env) {
    this.env = env;
    this.group = new THREE.Group();
    this.group.visible = false;
    env.backdrop.add(this.group);
    this.references = new SkyReferenceLayer(this.group);
    this.deepSky = DEEP_SKY_OBJECTS.map((object) => ({
      ...object,
      key: 'deep-' + object.id,
      dir: new THREE.Vector3(...object.direction),
      kind: 'deep',
    }));
    this.uniforms = {
      atlas: { value: null },
      viewport: { value: new THREE.Vector2(1, 1) },
      clock: { value: 0 },
      brightness: { value: 1 },
      earthDisc: { value: new THREE.Vector4(0, 0, 0, 2) },
      moonDisc: { value: new THREE.Vector4(0, 0, 0, 2) },
    };
    this.glyphs = new Map();
    this.shown = new Map();
    this.lastQuaternion = new THREE.Quaternion();
    this.lastPosition = new THREE.Vector3(Infinity, 0, 0);
    this.lastMoon = new THREE.Vector3(Infinity, 0, 0);
    this.lastLayout = -Infinity;
    this.lastKey = '';
    this.modelRecords = [];
    this.occluderCache = new WeakMap();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.hits = [];
    this.stats = { layouts: 0, uploads: 0, atlasBuilds: 0, candidates: 0, visible: 0, deepSky: 0 };
    this.setCulture(env.settings?.skyCulture);
  }
  setCulture(id) {
    const culture = normalizeSkyCulture(id);
    if (this.culture === culture) return;
    this.culture = culture;
    this.data = getSkyCulture(culture);
    this.stars = this.data.stars.map((s) => ({
      ...s,
      key: 'star-' + s.id,
      dir: vector(s.ra, s.dec),
    }));
    this.constellations = this.data.asterisms.flatMap((c) =>
      (c.labelPositions || [[c.ra, c.dec]]).map(([ra, dec], i) => ({
        ...c,
        key: (culture === 'western' ? 'const-' : 'asterism-chinese-') + c.id + '-' + i,
        dir: vector(ra, dec),
        kind: 'constellation',
      }))
    );
    if (this.lines) {
      this.lines.geometry.dispose();
      this.lines.geometry = lineGeometry(
        this.data.asterisms.flatMap((c) => c.lines),
        THREE.MathUtils.degToRad(0.08)
      );
      this.lines.material.color.set(culture === 'chinese' ? '#bd9d6b' : '#7fabc3');
      this.boundaries.geometry.dispose();
      this.boundaries.geometry = lineGeometry(this.data.boundaries, 0);
      this.boundaries.computeLineDistances();
      this.labels.geometry.instanceCount = 0;
      this.symbols.geometry.setDrawRange(0, 0);
    }
    this.shown.clear();
    this.texture?.dispose();
    this.texture = null;
    this.uniforms.atlas.value = null;
    this.glyphs.clear();
    this.language = null;
    this.lastKey = '';
    this.geometryKey = '';
    this.selectionKey = null;
    this.lastLayout = -Infinity;
    this.stats.culture = culture;
    this.stats.asterisms = this.data.asterisms.length;
    this.stats.boundaries = this.data.boundaries.length;
    this.stats.selectedTarget = null;
    this.stats.selectedMembers = 0;
    if (this.selectedLines) this.updateSelection(null);
  }
  updateSelection(targetId) {
    const key = this.culture + '|' + (targetId || '');
    if (key === this.selectionKey) return;
    this.selectionKey = key;
    const selected = this.data.asterisms.find((item) => item.targetId === targetId),
      positions = [],
      members = new Set(
        selected?.primaryMemberHips || selected?.lineMemberHips || selected?.memberHips || []
      ),
      objects = new Set(
        selected?.primaryMemberObjectIds ||
          selected?.lineMemberObjectIds ||
          selected?.memberObjectIds ||
          []
      );
    if (selected?.members?.length)
      for (const member of selected.members) {
        const primary = members.has(member.id) || objects.has(member.physicalId || member.id);
        if (primary && Number.isFinite(member.ra) && Number.isFinite(member.dec))
          positions.push(...vector(member.ra, member.dec).multiplyScalar(RADIUS).toArray());
      }
    else
      for (const star of this.stars)
        if (members.has(star.id))
          positions.push(...star.dir.clone().multiplyScalar(RADIUS).toArray());
    this.selectedLines.geometry.dispose();
    this.selectedLines.geometry = lineGeometry(
      selected?.lines || [],
      THREE.MathUtils.degToRad(0.03)
    );
    this.selectedStars.geometry.dispose();
    this.selectedStars.geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    this.stats.selectedTarget = selected?.targetId || null;
    this.stats.selectedMembers = positions.length / 3;
  }
  ensureGeometry() {
    if (this.labels) return;
    this.lines = new THREE.LineSegments(
      lineGeometry(
        this.data.asterisms.flatMap((c) => c.lines),
        THREE.MathUtils.degToRad(0.08)
      ),
      new THREE.LineBasicMaterial({
        color: this.culture === 'chinese' ? '#bd9d6b' : '#7fabc3',
        transparent: true,
        opacity: 0.35,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.boundaries = new THREE.LineSegments(
      lineGeometry(this.data.boundaries, 0),
      new THREE.LineDashedMaterial({
        color: '#b2a0ce',
        transparent: true,
        opacity: 0.24,
        dashSize: 1.5,
        gapSize: 1,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.boundaries.computeLineDistances();
    this.selectedLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: '#ffe0a0',
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.selectedStars = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: '#ffe6ba',
        size: 4,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.selectedLines.frustumCulled = this.selectedStars.frustumCulled = false;
    this.selectedLines.renderOrder = this.selectedStars.renderOrder = 1.7;
    this.labels = new THREE.Mesh(
      labelGeometry(),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: labelVertex,
        fragmentShader: fragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.labels.frustumCulled = false;
    this.labels.renderOrder = 3;
    this.symbols = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: symbolVertex,
        fragmentShader: symbolFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.symbols.frustumCulled = false;
    this.symbols.renderOrder = 2;
    this.lines.renderOrder = this.boundaries.renderOrder = 1.5;
    this.group.add(
      this.lines,
      this.boundaries,
      this.selectedLines,
      this.selectedStars,
      this.symbols,
      this.labels
    );
  }
  ensureAtlas(language) {
    if (this.language === language) return;
    const labels = this.constellations,
      chars = [
        ...new Set([
          ...labels.flatMap((s) => [...(s[language] || s.en || s.zh)]),
          ...starChartGlyphText(language, this.culture),
          ...SKY_REFERENCE_GLYPHS,
          ...this.deepSky.flatMap((s) => [...deepSkyLabel(s, language)]),
          ...deepSkyRegionLabel('', language),
        ]),
      ];
    for (const id of [
      'Sun',
      'Moon',
      'Mercury',
      'Venus',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ]) {
      for (const c of solarLabel(id, language)) if (!chars.includes(c)) chars.push(c);
    }
    const side = 2 ** Math.ceil(Math.log2(Math.ceil(Math.sqrt(chars.length)) * CELL)),
      canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d');
    ctx.font = `500 ${FONT}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'white';
    this.glyphs.clear();
    chars.forEach((char, i) => {
      const x = (i % (side / CELL)) * CELL,
        y = Math.floor(i / (side / CELL)) * CELL;
      ctx.fillText(char, x + 3, y + 25);
      this.glyphs.set(char, { x, y, advance: ctx.measureText(char).width });
    });
    this.texture?.dispose();
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.uniforms.atlas.value = this.texture;
    this.atlasSide = side;
    this.language = language;
    this.shown.clear();
    this.lastKey = '';
    this.stats.atlasBuilds++;
  }
  setDisc(uniform, center, radius) {
    const length = center.length();
    if (length <= radius) {
      uniform.set(0, 0, 0, -1);
      return;
    }
    uniform.set(
      center.x / length,
      center.y / length,
      center.z / length,
      Math.sqrt(1 - (radius * radius) / (length * length))
    );
  }
  prepareOccluders() {
    this.occluders = [];
    this.occluderBox = new THREE.Box3();
    for (const root of Object.values(this.env.sim.missions.activeGroups()))
      root?.traverseVisible((mesh) => {
        if (!mesh.isMesh) return;
        let record = this.occluderCache.get(mesh);
        if (!record) {
          mesh.geometry.computeBoundingBox();
          record = { mesh, box: new THREE.Box3(), matrix: new THREE.Matrix4().makeScale(0, 0, 0) };
          this.occluderCache.set(mesh, record);
        }
        if (!record.matrix.equals(mesh.matrixWorld)) {
          record.matrix.copy(mesh.matrixWorld);
          record.box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        }
        this.occluders.push(record);
        this.occluderBox.union(record.box);
      });
  }
  hiddenBySpacecraft(direction) {
    const { sim, api } = this.env;
    if (sim.view !== 'follow' || !sim.current) return false;
    const local = new THREE.Vector3(
      ...sim.current.basis.map(
        (axis) => direction.x * axis[0] + direction.y * axis[1] + direction.z * axis[2]
      )
    );
    const ray = this.raycaster;
    ray.set(api.camera.position, local);
    ray.near = api.camera.near;
    ray.far = api.camera.far;
    if (!ray.ray.intersectsBox(this.occluderBox)) return false;
    for (const record of this.occluders) {
      if (!ray.ray.intersectsBox(record.box)) continue;
      const mesh = record.mesh,
        geometry = mesh.geometry;
      // Imported high-detail models share one lazy BVH per static geometry.
      // Root rotation/spin changes the ray transform, so the tree stays reusable.
      if (
        !geometry.boundsTree &&
        !mesh.isSkinnedMesh &&
        !Object.keys(geometry.morphAttributes).length &&
        (geometry.index?.count || geometry.attributes.position.count) > 6144
      )
        computeBoundsTree.call(geometry);
      this.hits.length = 0;
      ray.intersectObject(mesh, false, this.hits);
      if (this.hits.length) return true;
    }
    return false;
  }
  update(camera) {
    const s = this.env.settings,
      active = s.stars && s.starChartEnabled && s.starBrightness > 0;
    this.setCulture(s.skyCulture);
    this.group.visible = active;
    if ((!active || this.env.sim.view !== 'follow') && this.modelSource) {
      this.modelSource = null;
      this.modelRecords = [];
      this.occluders = null;
    }
    if (!active) return;
    this.ensureGeometry();
    const focusTargetId = this.env.skyCultureFocus || null;
    this.updateSelection(focusTargetId);
    this.lines.visible = s.constellationLines;
    this.boundaries.visible = s.constellationBoundaries && this.data.boundaries.length > 0;
    this.selectedLines.visible = this.selectedStars.visible =
      s.constellationLines && !!this.stats.selectedTarget;
    this.symbols.visible = s.deepSkyObjects;
    this.labels.visible =
      s.starLabels ||
      s.catalogStarLabels ||
      s.solarSystemLabels ||
      s.constellationNames ||
      this.symbols.visible ||
      s.equatorialGrid ||
      s.eclipticLine;
    const brightness = Math.min(1, s.starBrightness);
    this.lines.material.opacity = 0.35 * brightness;
    this.boundaries.material.opacity = 0.24 * brightness;
    this.selectedLines.material.opacity = 0.85 * brightness;
    this.selectedStars.material.opacity = 0.8 * brightness;
    this.references.update(
      {
        settings: s,
        epoch: this.env.sim.current?.t,
        fovY: THREE.MathUtils.radToDeg(
          2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom)
        ),
        aspect: camera.aspect,
        forward: new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).toArray(),
      },
      brightness
    );
    if (!this.labels.visible) return;
    const language = getLanguage(),
      now = performance.now() / 1000,
      width = this.env.api.stage.clientWidth,
      height = this.env.api.stage.clientHeight;
    // Retire completed fades even when the camera and time are paused. This
    // reuses the layout and releases invisible glyphs without a catalogue query.
    if (now >= this.retireAt) {
      for (const [key, label] of this.shown)
        if (label.out !== undefined && now - label.out >= 0.18) this.shown.delete(key);
      this.retireAt = Infinity;
      this.geometryKey = '';
      this.upload();
    }
    this.ensureAtlas(language);
    this.uniforms.viewport.value.set(width, height);
    this.uniforms.clock.value = now;
    this.uniforms.brightness.value = brightness;
    const earth = camera.position.clone().negate(),
      moon = this.env.moon.mesh.position.clone().sub(camera.position),
      hasMoon = this.env.moon.mesh.visible;
    this.setDisc(this.uniforms.earthDisc.value, earth, EARTH);
    if (hasMoon) this.setDisc(this.uniforms.moonDisc.value, moon, MOON);
    else this.uniforms.moonDisc.value.set(0, 0, 0, 2);
    const sim = this.env.sim,
      records = sim.shadowCache.records,
      follow = sim.view === 'follow';
    const modelMoved =
      follow &&
      (this.modelSource !== records ||
        this.modelRecords.some((r) => !r.matrix.equals(r.object.matrixWorld)));
    const key = [
      language,
      this.culture,
      focusTargetId,
      width,
      height,
      camera.fov,
      camera.zoom,
      s.starLabels,
      s.catalogStarLabels,
      s.solarSystemLabels,
      s.constellationNames,
      s.equatorialGrid,
      s.eclipticLine,
      s.deepSkyObjects,
      s.deepSkyScope,
      s.starLabelDensity,
      this.env.quality,
      s.exposure,
      hasMoon,
      follow,
      s.earthElevation,
    ].join('|');
    const changed = key !== this.lastKey;
    const moved =
      1 - Math.abs(camera.quaternion.dot(this.lastQuaternion)) > 1e-12 ||
      camera.position.distanceToSquared(this.lastPosition) > 1e-6 ||
      (hasMoon && this.env.moon.mesh.position.distanceToSquared(this.lastMoon) > 1e-6);
    const epoch = sim.current?.t,
      skyMoved =
        (s.solarSystemLabels || s.equatorialGrid || s.eclipticLine) && epoch !== this.labelEpoch;
    const terrainKey = this.env.elevation?.key('main'),
      terrainMoved = terrainKey !== this.lastTerrainKey;
    if (
      !changed &&
      (!(moved || modelMoved || skyMoved || terrainMoved) || now - this.lastLayout < 0.2)
    )
      return;
    if (follow && (modelMoved || !this.occluders)) this.prepareOccluders();
    if (follow) {
      this.modelSource = records;
      this.modelRecords = records.map((r) => ({
        object: r.object,
        matrix: r.object.matrixWorld.clone(),
      }));
    }
    this.labelEpoch = epoch;
    this.lastTerrainKey = terrainKey;
    this.lastLayout = now;
    this.lastKey = key;
    this.lastQuaternion.copy(camera.quaternion);
    this.lastPosition.copy(camera.position);
    this.lastMoon.copy(this.env.moon.mesh.position);
    this.stats.layouts++;
    const axes = {
      right: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).toArray(),
      up: new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).toArray(),
      forward: new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).toArray(),
    };
    const fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom)
    );
    const earthFixed = (direction) =>
      sim.current.earthAxes.map((axis) =>
        axis.reduce((sum, value, i) => sum + value * direction[i], 0)
      );
    const terrainEye =
      this.env.elevation?.enabled && sim.current?.earthAxes
        ? earthFixed(camera.position.toArray())
        : null;
    const layout = buildSkyAnnotationLayout({
      settings: s,
      axes,
      eyeKm: camera.position.toArray(),
      q: sim.current,
      fovY: fov,
      width,
      height,
      language,
      focusTargetId,
      showMoon: hasMoon,
      blocked: (direction) =>
        (terrainEye && this.env.elevation.skyOccluded(terrainEye, earthFixed(direction), 'main')) ||
        this.hiddenBySpacecraft(new THREE.Vector3(...direction)),
    });
    const placed = layout.labels.map((label) => ({
      ...label,
      dir: new THREE.Vector3(...label.direction),
    }));
    this.stats.candidates = layout.candidates;
    this.stats.visible = layout.total;
    this.stats.deepSky = layout.stats.deepSky;
    this.stats.scanned = layout.stats.scanned;
    this.stats.unfiltered = layout.unfiltered;
    const next = new Map(
      placed.map((p) => [
        p.key,
        {
          ...p,
          born:
            this.shown.get(p.key)?.out === undefined ? (this.shown.get(p.key)?.born ?? now) : now,
        },
      ])
    );
    this.retireAt = Infinity;
    for (const [key, previous] of this.shown)
      if (!next.has(key)) {
        const out = previous.out ?? now;
        if (now - out < 0.18) {
          next.set(key, { ...previous, out });
          this.retireAt = Math.min(this.retireAt, out + 0.18);
        }
      }
    const signature = [...next.values()]
      .map((p) =>
        [
          p.key,
          p.text,
          p.kind === 'solar' || p.kind === 'reference' ? p.dir.toArray().join(',') : '',
          p.dx,
          p.dy,
          p.symbol?.width,
          p.symbol?.height,
          p.out ?? '',
          p.born,
        ].join(',')
      )
      .join(';');
    this.shown = next;
    if (signature === this.geometryKey) return;
    this.geometryKey = signature;
    this.upload();
  }
  upload() {
    const indices = [0, 1, 2, 0, 2, 3],
      count = [...this.shown.values()].reduce((sum, label) => sum + [...label.text].length, 0);
    if (!this.glyphCapacity || count > this.glyphCapacity) {
      this.glyphCapacity = 2 ** Math.ceil(Math.log2(Math.max(32, count)));
      this.labels.geometry.dispose();
      this.labels.geometry = labelGeometry(this.glyphCapacity);
    }
    const geometry = this.labels.geometry,
      attributes = geometry.attributes;
    let glyphIndex = 0;
    const symbols = {
      position: [],
      offset: [],
      uv: [],
      tint: [],
      lifetime: [],
      symbolType: [],
      symbolSize: [],
    };
    for (const label of this.shown.values()) {
      let pen = label.dx;
      const scale = label.font / FONT,
        color = new THREE.Color(
          label.selected
            ? '#ffe5b3'
            : label.color ||
              (label.kind === 'constellation'
                ? '#d0c09a'
                : label.kind === 'solar'
                  ? '#ffdcab'
                  : label.symbol?.labelColor || '#c8dce8')
        );
      const anchor = label.dir.clone().multiplyScalar(RADIUS);
      if (label.symbol) {
        const symbol = label.symbol,
          symbolColor = new THREE.Color(symbol.color),
          w = symbol.width / 2,
          h = symbol.height / 2;
        const corners = [
            [-w, -h],
            [w, -h],
            [w, h],
            [-w, h],
          ],
          uv = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ];
        const kind = symbol.shape === 'box' ? 1 : symbol.shape === 'cross-circle' ? 2 : 0;
        for (const index of indices) {
          symbols.position.push(...label.dir.clone().multiplyScalar(RADIUS).toArray());
          symbols.offset.push(...corners[index]);
          symbols.uv.push(...uv[index]);
          symbols.tint.push(symbolColor.r, symbolColor.g, symbolColor.b);
          symbols.lifetime.push(label.born, label.out ?? 1e12);
          symbols.symbolType.push(kind);
          symbols.symbolSize.push(symbol.width, symbol.height);
        }
      }
      for (const char of label.text) {
        const g = this.glyphs.get(char);
        if (!g) continue;
        attributes.anchor.setXYZ(glyphIndex, anchor.x, anchor.y, anchor.z);
        attributes.glyphOffset.setXY(glyphIndex, pen - 3 * scale, -label.dy - 25 * scale);
        attributes.glyphRect.setXYZW(
          glyphIndex,
          g.x / this.atlasSide,
          1 - (g.y + CELL) / this.atlasSide,
          CELL / this.atlasSide,
          CELL / this.atlasSide
        );
        attributes.glyphScale.setX(glyphIndex, scale);
        attributes.tint.setXYZ(glyphIndex, color.r, color.g, color.b);
        attributes.lifetime.setXY(glyphIndex, label.born, label.out ?? 1e12);
        glyphIndex++;
        pen += g.advance * scale;
      }
    }
    geometry.instanceCount = glyphIndex;
    for (const [name, size] of Object.entries(glyphAttributes)) {
      attributes[name].clearUpdateRanges();
      attributes[name].addUpdateRange(0, glyphIndex * size);
      attributes[name].needsUpdate = true;
    }
    this.stats.uploads++;
    this.stats.glyphs = glyphIndex;
    const symbolGeometry = new THREE.BufferGeometry();
    for (const [name, size] of [
      ['position', 3],
      ['offset', 2],
      ['uv', 2],
      ['tint', 3],
      ['lifetime', 2],
      ['symbolType', 1],
      ['symbolSize', 2],
    ])
      symbolGeometry.setAttribute(name, new THREE.Float32BufferAttribute(symbols[name], size));
    this.symbols.geometry.dispose();
    this.symbols.geometry = symbolGeometry;
  }
}
