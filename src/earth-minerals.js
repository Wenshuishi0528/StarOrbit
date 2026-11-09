import * as THREE from 'three';

export const MINERAL_NAMES = {
  AU: '金',
  AG: '银',
  CU: '铜',
  FE: '铁',
  AL: '铝',
  PB: '铅',
  ZN: '锌',
  NI: '镍',
  CO: '钴',
  LI: '锂',
  MN: '锰',
  CR: '铬',
  SN: '锡',
  W: '钨',
  MO: '钼',
  TI: '钛',
  V: '钒',
  U: '铀',
  REE: '稀土',
  P: '磷',
  GRF: '石墨',
  COA: '煤',
  OIL: '石油',
  GAS: '天然气',
  GEO: '地热',
  GEM_D: '金刚石',
  SDG: '砂砾',
  STN: '石材',
  STN_C: '碎石',
  LST: '石灰岩',
  CLY: '黏土',
  PGE: '铂族元素',
  PGE_PT: '铂',
  PGE_PD: '钯',
  GYP: '石膏',
  FLD: '长石',
  MIC: '云母',
  QTZ: '石英',
  TLC: '滑石',
  AS: '砷',
  BI: '铋',
  CD: '镉',
  GA: '镓',
  GE: '锗',
  IN: '铟',
  SE: '硒',
  TE: '碲',
  SR: '锶',
  S: '硫',
  CS: '铯',
  RB: '铷',
  SC: '钪',
  RE: '铼',
  PT: '铂',
  PD: '钯',
  SB: '锑',
  HG: '汞',
  BA: '钡',
  BE: '铍',
  NB: '铌',
  TA: '钽',
  ZR: '锆',
  TH: '钍',
  B: '硼',
  F: '氟',
  MG: '镁',
  K: '钾',
};
export const hasCommodity = (row, code) => !code || row[4].split(' ').includes(code);
export function mineralFeature(row) {
  return {
    id: row[0],
    name: row[1],
    nameEn: row[1],
    longitude: row[2],
    latitude: row[3],
    commodities: row[4],
    historicalStatus: row[5],
    grade: row[6],
    mineral: true,
    sourceUrl: `https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=${encodeURIComponent(row[0])}`,
  };
}
export function groupMinerals(rows, code, step) {
  const cells = new Map();
  for (const row of rows) {
    if (!hasCommodity(row, code)) continue;
    const key = `${Math.floor((row[2] + 180) / step)}:${Math.floor((row[3] + 90) / step)}`;
    let group = cells.get(key);
    if (!group) {
      // An actual catalog location anchors each group, never a fabricated mine.
      group = { ...mineralFeature(row), count: 0, records: [] };
      cells.set(key, group);
    }
    group.count++;
    group.records.push(row);
  }
  return [...cells.values()];
}
export async function readMineralCatalog(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error(`USGS MRDS HTTP ${response.status}`);
  const blob = await response.blob();
  const decoded = new Response(blob.stream().pipeThrough(new DecompressionStream('gzip')));
  const rows = await decoded.json();
  if (
    !Array.isArray(rows) ||
    rows.some(
      (r) =>
        !Array.isArray(r) ||
        r.length !== 7 ||
        !Number.isFinite(r[2]) ||
        !Number.isFinite(r[3]) ||
        Math.abs(r[2]) > 180 ||
        Math.abs(r[3]) > 90 ||
        typeof r[0] !== 'string' ||
        typeof r[1] !== 'string' ||
        typeof r[4] !== 'string'
    )
  )
    throw Error('Invalid mineral catalog');
  return rows;
}

export function createMineralLayer(scene) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { opacity: { value: 0.9 }, pixelRatio: { value: 1 } },
    vertexShader: `attribute float symbolSize;uniform float pixelRatio;varying float front;void main(){front=dot(normalize(position),normalize(cameraPosition-position));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=symbolSize*pixelRatio;}`,
    fragmentShader: `uniform float opacity;varying float front;void main(){if(front<=0.)discard;float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;vec3 c=mix(vec3(.12,.08,.02),vec3(1.,.72,.28),(1.-smoothstep(.72,1.,d)));gl_FragColor=vec4(c,opacity);}`,
  });
  const mesh = new THREE.Points(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  let catalog = null,
    key = '',
    groups = [],
    cache = new Map();
  return {
    update(rows, commodity, enabled, distance, opacity, pixelRatio) {
      mesh.visible = enabled && !!rows;
      if (!mesh.visible) return;
      if (catalog !== rows) {
        catalog = rows;
        cache.clear();
        key = '';
      }
      const step = distance > 2.5 ? 4 : distance > 1.4 ? 1 : 0.1;
      const next = `${commodity}:${step}`;
      if (key !== next) {
        key = next;
        groups = cache.get(key) ?? groupMinerals(rows, commodity, step);
        cache.set(key, groups);
        while (cache.size > 3) cache.delete(cache.keys().next().value);
        const positions = new Float32Array(groups.length * 3),
          sizes = new Float32Array(groups.length);
        groups.forEach((g, i) => {
          const lat = (g.latitude * Math.PI) / 180,
            lon = (g.longitude * Math.PI) / 180;
          positions.set(
            [
              Math.cos(lat) * Math.cos(lon) * 1.002,
              Math.cos(lat) * Math.sin(lon) * 1.002,
              Math.sin(lat) * 1.002,
            ],
            i * 3
          );
          sizes[i] = g.count > 1 ? 7 : 4;
        });
        mesh.geometry.dispose();
        mesh.geometry = new THREE.BufferGeometry();
        mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        mesh.geometry.setAttribute('symbolSize', new THREE.BufferAttribute(sizes, 1));
      }
      material.uniforms.opacity.value = opacity;
      material.uniforms.pixelRatio.value = pixelRatio;
    },
    get groups() {
      return mesh.visible ? groups : [];
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      cache.clear();
      catalog = null;
    },
  };
}
