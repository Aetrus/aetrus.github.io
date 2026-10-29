// PNG text-chunk codec for character cards.
// Reads and writes tEXt chunks on the raw byte stream and never decodes the
// bitmap, so every other chunk (colour profiles, other tools' metadata) survives.

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
let CRC_TABLE = null;

function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}

export function crc32(bytes, start = 0, end = bytes.length) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function isPng(bytes) {
  if (!bytes || bytes.length < 8) return false;
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

const typeOf = (bytes, at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
const u32 = (bytes, at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

/** Every chunk as { type, start, end, dataStart, dataEnd }. Throws on a malformed file. */
export function listChunks(bytes) {
  if (!isPng(bytes)) throw new Error('This file is not a PNG.');
  const chunks = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const len = u32(bytes, at);
    const type = typeOf(bytes, at + 4);
    const end = at + 12 + len;
    if (end > bytes.length) throw new Error('The PNG is truncated or damaged.');
    chunks.push({ type, start: at, end, dataStart: at + 8, dataEnd: at + 8 + len });
    at = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

const latin1 = (bytes, a, b) => {
  let s = '';
  for (let i = a; i < b; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(b, i + 0x8000)));
  return s;
};

/** Map of tEXt (and uncompressed iTXt) keyword → text. */
export function readTextChunks(bytes) {
  const out = {};
  for (const c of listChunks(bytes)) {
    if (c.type !== 'tEXt' && c.type !== 'iTXt') continue;
    const data = bytes.subarray(c.dataStart, c.dataEnd);
    const nul = data.indexOf(0);
    if (nul < 1) continue;
    const keyword = latin1(data, 0, nul);
    if (c.type === 'tEXt') {
      out[keyword] = latin1(data, nul + 1, data.length);
    } else {
      // iTXt: keyword\0 compFlag compMethod lang\0 translated\0 text(utf8)
      const compressed = data[nul + 1] === 1;
      if (compressed) continue;
      let p = nul + 3;
      p = data.indexOf(0, p) + 1; // language tag
      p = data.indexOf(0, p) + 1; // translated keyword
      out[keyword] = new TextDecoder().decode(data.subarray(p));
    }
  }
  return out;
}

function makeChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const len = data.length;
  out[0] = len >>> 24; out[1] = (len >>> 16) & 255; out[2] = (len >>> 8) & 255; out[3] = len & 255;
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out, 4, 8 + len);
  out[8 + len] = crc >>> 24; out[9 + len] = (crc >>> 16) & 255; out[10 + len] = (crc >>> 8) & 255; out[11 + len] = crc & 255;
  return out;
}

function textChunk(keyword, text) {
  const data = new Uint8Array(keyword.length + 1 + text.length);
  for (let i = 0; i < keyword.length; i++) data[i] = keyword.charCodeAt(i) & 255;
  data[keyword.length] = 0;
  for (let i = 0; i < text.length; i++) data[keyword.length + 1 + i] = text.charCodeAt(i) & 255;
  return makeChunk('tEXt', data);
}

/**
 * Returns a new PNG with the given tEXt entries written just before IEND.
 * Any existing tEXt/iTXt with the same keywords (and any in `remove`) are dropped first.
 */
export function writeTextChunks(bytes, entries, remove = []) {
  const chunks = listChunks(bytes);
  const drop = new Set([...Object.keys(entries), ...remove].map((k) => k.toLowerCase()));
  const parts = [bytes.subarray(0, 8)];
  for (const c of chunks) {
    if (c.type === 'IEND') {
      for (const [k, v] of Object.entries(entries)) parts.push(textChunk(k, v));
    }
    if (c.type === 'tEXt' || c.type === 'iTXt') {
      const data = bytes.subarray(c.dataStart, c.dataEnd);
      const nul = data.indexOf(0);
      const kw = nul > 0 ? latin1(data, 0, nul).toLowerCase() : '';
      if (drop.has(kw)) continue;
    }
    parts.push(bytes.subarray(c.start, c.end));
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Pixel size from IHDR without decoding. */
export function pngSize(bytes) {
  const ihdr = listChunks(bytes).find((c) => c.type === 'IHDR');
  if (!ihdr) return null;
  return { width: u32(bytes, ihdr.dataStart), height: u32(bytes, ihdr.dataStart + 4) };
}
