// PNGs are already compressed. A small STORE archive lets browsers download
// both sides together without a compressor or a second download permission.
const ZIP_ERROR = '生日卡打包失败，请重新生成预览';
const MAX_PNG_BYTES = 128 * 1024 * 1024;
const UTF8_NAMES = 0x0800;
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function header(length, signature) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  return { bytes, view };
}

export async function birthdayCardZip(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 2) throw Error(ZIP_ERROR);
  const encoder = new TextEncoder();
  const names = new Set();
  const entries = files.map((file) => {
    if (
      typeof file?.name !== 'string' ||
      !file.name ||
      /[\\/:\x00-\x1f\x7f]/.test(file.name) ||
      !/\.png$/i.test(file.name) ||
      !(file.blob instanceof Blob) ||
      !file.blob.size ||
      file.blob.size > MAX_PNG_BYTES
    )
      throw Error(ZIP_ERROR);
    const name = file.name.normalize('NFC');
    const key = name.toLowerCase();
    const encoded = encoder.encode(name);
    if (names.has(key) || encoded.length > 255) throw Error(ZIP_ERROR);
    names.add(key);
    return { name: encoded, blob: file.blob };
  });
  const content = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  for (const entry of entries) {
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const local = header(30 + entry.name.length, 0x04034b50);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, UTF8_NAMES, true);
    // Compression method and time are zero (STORE, midnight). DOS date:
    // 1980-01-01, a fixed valid date rather than the recipient's birthday.
    local.view.setUint16(12, 0x0021, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, entry.name.length, true);
    local.bytes.set(entry.name, 30);
    content.push(local.bytes, data);

    const central = header(46 + entry.name.length, 0x02014b50);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, UTF8_NAMES, true);
    central.view.setUint16(14, 0x0021, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, data.length, true);
    central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, entry.name.length, true);
    central.view.setUint32(42, offset, true);
    central.bytes.set(entry.name, 46);
    directory.push(central.bytes);
    directorySize += central.bytes.length;
    offset += local.bytes.length + data.length;
  }
  const end = header(22, 0x06054b50);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, directorySize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...content, ...directory, end.bytes], { type: 'application/zip' });
}
