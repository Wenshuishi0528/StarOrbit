import { crc32 } from './crc32.js';

// iTXt stores UTF-8 strings, including non-Latin target names and full source credits.
function pngTextChunk(key, value) {
  const encoder = new TextEncoder(),
    name = encoder.encode(key),
    text = encoder.encode(value);
  const payloadLength = name.length + 5 + text.length;
  const bytes = new Uint8Array(payloadLength + 12),
    data = new DataView(bytes.buffer);
  data.setUint32(0, payloadLength);
  bytes.set(encoder.encode('iTXt'), 4);
  bytes.set(name, 8);
  // Uncompressed text, empty language tag and translated keyword.
  bytes.set(text, 8 + name.length + 5);
  data.setUint32(bytes.length - 4, crc32(bytes.subarray(4, -4)));
  return bytes;
}

export function describeEyepiecePng(blob, { title, description, sources }) {
  const chunks = [
    pngTextChunk('Title', title),
    pngTextChunk('Description', description),
    pngTextChunk('Source', [...new Set(sources.filter(Boolean))].join('\n')),
  ];
  // Canvas-generated PNGs end with the twelve-byte IEND chunk. Keep the compressed pixels intact.
  return new Blob([blob.slice(0, -12), ...chunks, blob.slice(-12)], { type: 'image/png' });
}

export function stampEyepiece(canvas, text) {
  const { width, height } = canvas;
  const fontSize = Math.min(24, Math.max(8, Math.round(height * 0.021)));
  const pad = Math.max(2, Math.round(fontSize * 0.4));
  const c = canvas.getContext('2d');
  c.save();
  c.font = fontSize + 'px system-ui';
  c.textBaseline = 'bottom';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(2, fontSize * 0.24);
  c.strokeStyle = '#07101de8';
  c.fillStyle = '#e4edf3';
  c.strokeText(text, pad, height - pad, width - 2 * pad);
  c.fillText(text, pad, height - pad, width - 2 * pad);
  c.restore();
}
