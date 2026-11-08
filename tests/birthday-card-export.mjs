import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { birthdayCardZip } from '../src/birthday-card-export.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
  'base64'
);
const backPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg5Vf+DwABiwE3zSsQpwAAAABJRU5ErkJggg==',
  'base64'
);
const blob = new Blob([png], { type: 'image/png' });
// Use Python's independently implemented ZIP reader to verify directory
// offsets, flags, STORE method, CRCs and byte-for-byte PNG round trips.
const verify = String.raw`
import base64, io, json, struct, sys, zipfile, zlib
data = json.load(sys.stdin)
with zipfile.ZipFile(io.BytesIO(base64.b64decode(data['archive']))) as z:
    assert z.namelist() == data['names']
    assert z.testzip() is None
    for index, info in enumerate(z.infolist()):
        assert info.compress_type == zipfile.ZIP_STORED
        assert info.flag_bits & 0x800
        assert info.date_time == (1980, 1, 1, 0, 0, 0)
        payload = z.read(info.filename)
        assert payload == base64.b64decode(data['pngs'][index])
        assert payload.startswith(b'\x89PNG\r\n\x1a\n')
        assert not info.is_dir()
        offset = 8
        while offset < len(payload):
            size = struct.unpack('>I', payload[offset:offset + 4])[0]
            kind = payload[offset + 4:offset + 8]
            chunk = payload[offset + 8:offset + 8 + size]
            crc = struct.unpack('>I', payload[offset + 8 + size:offset + 12 + size])[0]
            assert zlib.crc32(kind + chunk) & 0xffffffff == crc
            if kind == b'IDAT':
                assert len(zlib.decompress(chunk)) == 5
            offset += size + 12
print('ok')
`;
for (const names of [['front.png', 'back.png'], ['正面.png', '赠予背面.png'], ['front.png']]) {
  const pngs = names.map((_, index) => (index === 0 ? png : backPng));
  const zipped = await birthdayCardZip(
    names.map((name, index) => ({
      name,
      blob: new Blob([pngs[index]], { type: 'image/png' }),
    }))
  );
  assert.equal(zipped.type, 'application/zip');
  const checked = execFileSync('python3', ['-c', verify], {
    encoding: 'utf8',
    input: JSON.stringify({
      archive: Buffer.from(await zipped.arrayBuffer()).toString('base64'),
      names,
      pngs: pngs.map((bytes) => bytes.toString('base64')),
    }),
  });
  assert.equal(checked.trim(), 'ok');
}

for (const name of [
  '../front.png',
  '/front.png',
  'folder/front.png',
  'folder\\front.png',
  'C:front.png',
  'bad\0.png',
  'front.txt',
  'a'.repeat(256) + '.png',
])
  await assert.rejects(birthdayCardZip([{ name, blob }]), /生日卡打包失败/);
for (const files of [
  null,
  [],
  [
    { name: 'front.png', blob },
    { name: 'front.png', blob },
  ],
  [
    { name: 'Front.png', blob },
    { name: 'front.png', blob },
  ],
  [
    { name: 'é.png', blob },
    { name: 'e\u0301.png', blob },
  ],
  ['front.png', 'back.png', 'third.png'].map((name) => ({ name, blob })),
  [{ name: 'front.png', blob: new Blob([]) }],
  [{ name: 'front.png', blob: png }],
  [null],
])
  await assert.rejects(birthdayCardZip(files), /生日卡打包失败/);
class OversizedBlob extends Blob {
  get size() {
    return 128 * 1024 * 1024 + 1;
  }
}
await assert.rejects(
  birthdayCardZip([{ name: 'front.png', blob: new OversizedBlob([png]) }]),
  /生日卡打包失败/
);
console.log('Birthday front/back ZIPs pass independent Python extraction, UTF-8 and input checks');
