import assert from 'node:assert/strict';
import { SkyDetail } from '../src/sky-detail.js';
import { frameSkyArtwork } from '../src/sky-camera-pointing.js';
import fs from 'node:fs';
import { registeredPlate } from '../src/pillar-astrometry.js';
import { createWebbPlate, webbPlateRay } from '../src/webb-plate.js';

// Actual image centroids and held-out Gaia DR3 coordinates propagated to
// the observing epochs. Each row contains image u,v and reference RA,Dec.
const checks = {
  // Native Spiderweb Galaxy zoom tiles and independent Pan-STARRS DR2
  // objects 76221751951810455, 76211752080812654 and 76211752004952585.
  heic0614a: [
    [0.949877390, 0.253519056, 175.1952411048, -26.4832435496],
    [0.030394604, 0.877025830, 175.2080580399, -26.4896409762],
    [0.606130844, 0.832794348, 175.2004360197, -26.4897154841],
  ],
  heic1501a: [
    [0.6592920354, 0.1220022624, 274.6922223658, -13.8231842114],
    [0.4093973873, 0.3154088559, 274.7170829903, -13.8247864544],
    [0.1921337266, 0.2726244344, 274.7289467721, -13.8127417225],
    [0.2374926254, 0.0429510747, 274.7153452025, -13.7999191253],
    [0.0729813509, 0.1635238515, 274.7313915697, -13.8005448844],
    [0.9701311743, 0.6807126697, 274.6984015541, -13.8725822106],
    [0.1183952802, 0.3497794118, 274.7371502844, -13.8144994131],
    [0.7326778106, 0.401531339, 274.7005116975, -13.8443571507],
    [0.2817978575, 0.870746011, 274.750949754, -13.855070698],
    [0.3093552465, 0.7331629767, 274.7428118352, -13.8474097921],
    [0.9199693813, 0.7109692709, 274.7029786445, -13.8723605102],
    [0.3442196938, 0.7623653307, 274.7419438962, -13.8508006135],
    [0.4460504753, 0.284778085, 274.7133123606, -13.8244525831],
    [0.1842777264, 0.6040217465, 274.7447494512, -13.8337139357],
    [0.0614904827, 0.4296630535, 274.7444668177, -13.8171766001],
    [0.1388872882, 0.5356466379, 274.7444732497, -13.8273420292],
    [0.7887016494, 0.6315029316, 274.7076317133, -13.8615843321],
    [0.9886376624, 0.9068504063, 274.7076840676, -13.8879414516],
    [0.5348128508, 0.1398698435, 274.7009489271, -13.8189722085],
    [0.5324300292, 0.4587036416, 274.7158931303, -13.8393947867],
    [0.6122457024, 0.1241064811, 274.69535988, -13.8212352147],
    [0.4372179648, 0.272963346, 274.7133350224, -13.8233346257],
    [0.1783308399, 0.2629968948, 274.7293202756, -13.8114972182],
    [0.4281775429, 0.4573629225, 274.7224662976, -13.834812362],
    [0.5176288207, 0.3843012901, 274.7133821831, -13.833948997],
    [0.6073546062, 0.3830433409, 274.707619702, -13.8377531887],
    [0.9961460369, 0.5104931833, 274.688820683, -13.862755454],
    [0.9937108771, 0.1307058573, 274.6713604473, -13.8381980829],
    [0.8255967373, 0.4551993097, 274.6970991737, -13.8518270655],
    [0.5349911868, 0.0782058638, 274.6980770215, -13.815011884],
  ],
  weic2216b: [
    [0.1739377414, 0.1056322987, 274.7560236168, -13.8049759688],
    [0.2053843458, 0.1728270795, 274.7533833717, -13.8130358956],
    [0.0388528588, 0.0587114116, 274.7660367127, -13.7996984524],
    [0.34890336, 0.8828854129, 274.7390651558, -13.8988310556],
    [0.3115640863, 0.3458291554, 274.7447495658, -13.8337172321],
    [0.1710672168, 0.0866704805, 274.756337301, -13.8026788595],
    [0.1286681449, 0.0828855581, 274.7594273172, -13.8023458217],
    [0.2780586133, 0.3332561807, 274.7472470255, -13.8323205686],
    [0.7893917257, 0.8046136977, 274.7076815932, -13.8879479577],
    [0.4083126461, 0.8105362547, 274.7351700787, -13.889855194],
    [0.1101124635, 0.0671781531, 274.7608434266, -13.8005060619],
    [0.5388239856, 0.1689139871, 274.7293201998, -13.8115205811],
    [0.8234219044, 0.8183513098, 274.7051468772, -13.8895087414],
    [0.8304552219, 0.4689390502, 274.7065943164, -13.8470402624],
    [0.145243664, 0.1204846691, 274.7580153956, -13.8068648532],
    [0.8934843372, 0.8602241975, 274.699846483, -13.8943660697],
    [0.2611915038, 0.8806742516, 274.7454091124, -13.8988346496],
  ],
};
for (const [id, sample] of Object.entries(checks)) {
  const archive = id.startsWith('heic') ? 'hubble' : 'webb';
  const records = JSON.parse(
    fs.readFileSync(new URL('../src/' + archive + '-gallery-data.json', import.meta.url))
  );
  const raw = records.find((r) => r.id === id).plate;
  const plate = createWebbPlate(registeredPlate(id, raw));
  const angle = Math.PI / 180;
  const errors = sample
    .map(([u, v, ra, dec]) => {
      const ray = webbPlateRay(plate, u, v),
        scale = Math.hypot(...ray);
      const expected = [
        Math.cos(dec * angle) * Math.cos(ra * angle),
        Math.cos(dec * angle) * Math.sin(ra * angle),
        Math.sin(dec * angle),
      ];
      return (
        ((2 * Math.asin(Math.hypot(...ray.map((x, i) => x / scale - expected[i])) / 2)) / angle) *
        3600
      );
    })
    .sort((a, b) => a - b);
  const x = 0.9 * (errors.length - 1),
    i = Math.floor(x);
  const p90 = errors[i] + (errors[i + 1] - errors[i]) * (x - i);
  assert(p90 < 0.2);
  const changed = [...raw];
  changed[4] += 0.003;
  assert.equal(registeredPlate(id, changed), changed);
  console.log(id, sample.length, 'reference objects, 90th-percentile arcsec', p90.toFixed(3));
}

const manager = new SkyDetail({}, { webbGallery: true });
const hst = manager.providers.find((provider) => provider.id === 'hubble-heic1501a');
const view = { ...frameSkyArtwork(hst, hst.plate.direction, 1.6, 0.08), pixelHeight: 598 };
manager.setArtwork(hst.id);
manager.setSource('recent');
assert.equal(manager.plan(view).tiles[0].provider.id, 'webb-weic2216b');
manager.setArtwork('webb-weic2218a');
manager.setSource('hubble');
assert.equal(manager.plan(view).tiles[0].provider.id, hst.id);
manager.setSource('recent');
assert.equal(manager.plan(view).tiles[0].provider.id, 'webb-weic2218a');
