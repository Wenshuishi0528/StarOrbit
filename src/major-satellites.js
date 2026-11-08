// Mean radii: JPL Solar System Dynamics satellite physical parameters.
// Periods describe the orbit-track sampling window; positions never use these
// mean elements as a Keplerian propagator. See assets/satellites/README.md.
const rows = [
  ['Moon', '月球', 'Earth', 301, 1737.4, 27.322, 384400, 0xbcb9ae],
  ['Phobos', '火卫一', 'Mars', 401, 11.08, 0.3187, 9376, 0x9d8b78],
  ['Deimos', '火卫二', 'Mars', 402, 6.2, 1.2625, 23463, 0xc1ad91],
  ['Io', '木卫一 · 艾奥', 'Jupiter', 501, 1821.49, 1.769138, 421800, 0xd9bf64],
  ['Europa', '木卫二 · 欧罗巴', 'Jupiter', 502, 1560.8, 3.551181, 671100, 0xd2c2aa],
  ['Ganymede', '木卫三 · 盖尼米德', 'Jupiter', 503, 2631.2, 7.154553, 1070400, 0xa79983],
  ['Callisto', '木卫四 · 卡利斯托', 'Jupiter', 504, 2410.3, 16.689018, 1882700, 0x8e8170],
  ['Mimas', '土卫一 · 米玛斯', 'Saturn', 601, 198.2, 0.942422, 185500, 0xb6b3af],
  ['Enceladus', '土卫二 · 恩克拉多斯', 'Saturn', 602, 252.1, 1.370218, 238000, 0xe6e8e5],
  ['Tethys', '土卫三 · 忒堤斯', 'Saturn', 603, 531.1, 1.887802, 294700, 0xd0cfca],
  ['Dione', '土卫四 · 狄俄涅', 'Saturn', 604, 561.4, 2.736916, 377400, 0xb6b5ae],
  ['Rhea', '土卫五 · 瑞亚', 'Saturn', 605, 763.5, 4.517503, 527100, 0xc8c4bb],
  ['Titan', '土卫六 · 泰坦', 'Saturn', 606, 2574.76, 15.945448, 1221900, 0xd3ab63],
  ['Iapetus', '土卫八 · 伊阿珀托斯', 'Saturn', 608, 734.3, 79.331002, 3560800, 0x9b9388],
  ['Ariel', '天卫一 · 艾瑞尔', 'Uranus', 701, 578.9, 2.520379, 190900, 0xc3c4bd],
  ['Umbriel', '天卫二 · 乌姆布里尔', 'Uranus', 702, 584.7, 4.144177, 266000, 0x878984],
  ['Titania', '天卫三 · 泰坦妮亚', 'Uranus', 703, 788.9, 8.705869, 436300, 0xadafa7],
  ['Oberon', '天卫四 · 奥伯龙', 'Uranus', 704, 761.4, 13.463237, 583400, 0xa49d92],
  ['Miranda', '天卫五 · 米兰达', 'Uranus', 705, 235.8, 1.413479, 129900, 0xc0b9ad],
  ['Triton', '海卫一 · 特里同', 'Neptune', 801, 1352.6, 5.87685, 354800, 0xc6bfb5],
];
export const MAJOR_SATELLITES = Object.freeze(
  rows.map(([id, name, parent, code, radiusKm, period, orbitRadiusKm, color]) =>
    Object.freeze({ id, name, parent, code, radiusKm, period, orbitRadiusKm, color })
  )
);
export const EXTRA_SATELLITES = Object.freeze(
  MAJOR_SATELLITES.filter((body) => body.id !== 'Moon')
);
export const SATELLITE_SYSTEMS = Object.freeze([
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
]);
export const SATELLITE_BY_ID = new Map(MAJOR_SATELLITES.map((body) => [body.id, body]));
export function satelliteSystemRadiusKm(parent) {
  return (
    Math.max(
      ...MAJOR_SATELLITES.filter((body) => body.parent === parent).map((body) => body.orbitRadiusKm)
    ) * 1.1
  );
}
