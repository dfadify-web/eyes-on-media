// Eyes on Media — lectura de cabeceras reales de los archivos (sin ffprobe ni dependencias).
// MP4/MOV: cajas moov → duración, códec, resolución, fps (stts). WAV: chunk fmt/data. MP3: primera trama.
const fs = require('fs');

const CODECS = { avc1: 'H.264', avc3: 'H.264', hvc1: 'HEVC', hev1: 'HEVC', av01: 'AV1', vp09: 'VP9', vp08: 'VP8', mp4a: 'AAC', Opus: 'Opus', 'ac-3': 'AC-3', 'ec-3': 'E-AC-3', fLaC: 'FLAC', alac: 'ALAC', mjpg: 'MJPEG', apcn: 'ProRes', apch: 'ProRes' };
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  const n = fs.readSync(fd, b, 0, len, pos);
  return b.subarray(0, n);
}

function* boxes(buf, s, e) {
  while (s + 8 <= e) {
    let size = buf.readUInt32BE(s), head = 8;
    const type = buf.toString('latin1', s + 4, s + 8);
    if (size === 1) { size = Number(buf.readBigUInt64BE(s + 8)); head = 16; }
    else if (size === 0) size = e - s;
    if (size < head) return;
    yield { type, s: s + head, e: Math.min(e, s + size) };
    s += size;
  }
}

function parseMoov(buf) {
  const out = { tracks: [] };
  const walk = (s, e, trak) => {
    for (const b of boxes(buf, s, e)) {
      const v = buf[b.s];
      if (b.type === 'mvhd') {
        const ts = v === 1 ? buf.readUInt32BE(b.s + 20) : buf.readUInt32BE(b.s + 12);
        const du = v === 1 ? Number(buf.readBigUInt64BE(b.s + 24)) : buf.readUInt32BE(b.s + 16);
        if (ts) out.duration = du / ts;
      } else if (b.type === 'trak') {
        const t = {}; walk(b.s, b.e, t); out.tracks.push(t);
      } else if (trak && b.type === 'tkhd') {
        const o = v === 1 ? 88 : 76;
        trak.width = buf.readUInt32BE(b.s + o) / 65536; trak.height = buf.readUInt32BE(b.s + o + 4) / 65536;
      } else if (trak && b.type === 'mdhd') {
        trak.timescale = v === 1 ? buf.readUInt32BE(b.s + 20) : buf.readUInt32BE(b.s + 12);
        trak.duration = v === 1 ? Number(buf.readBigUInt64BE(b.s + 24)) : buf.readUInt32BE(b.s + 16);
      } else if (trak && b.type === 'hdlr') {
        trak.handler = buf.toString('latin1', b.s + 8, b.s + 12);
      } else if (trak && b.type === 'stsd') {
        const es = b.s + 8;
        trak.format = buf.toString('latin1', es + 4, es + 8);
        if (trak.handler === 'vide') { trak.w = buf.readUInt16BE(es + 32); trak.h = buf.readUInt16BE(es + 34); }
        if (trak.handler === 'soun') { trak.channels = buf.readUInt16BE(es + 24); trak.sampleRate = buf.readUInt32BE(es + 32) >>> 16; }
      } else if (trak && b.type === 'stts') {
        const n = buf.readUInt32BE(b.s + 4);
        let samples = 0;
        for (let i = 0; i < n && b.s + 8 + i * 8 + 8 <= b.e; i++) samples += buf.readUInt32BE(b.s + 8 + i * 8);
        trak.samples = samples;
      } else if (CONTAINERS.has(b.type)) walk(b.s, b.e, trak);
    }
  };
  walk(0, buf.length, null);
  return out;
}

function probeMp4(fd, size) {
  let pos = 0, moov = null, mdatFirst = false, sawMdat = false;
  while (pos + 8 <= size) {
    const h = readAt(fd, pos, 16);
    if (h.length < 8) break;
    let len = h.readUInt32BE(0);
    const type = h.toString('latin1', 4, 8);
    if (len === 1) len = Number(h.readBigUInt64BE(8));
    else if (len === 0) len = size - pos;
    if (len < 8 || !/^[\w ©-]{4}$/.test(type)) break;
    if (type === 'mdat') { sawMdat = true; if (!moov) mdatFirst = true; }
    if (type === 'moov') {
      if (len > 64 * 1024 * 1024 || pos + len > size) return { container: 'mp4', incomplete: true };
      moov = readAt(fd, pos + 8, len - 8);
    }
    pos += len;
  }
  if (!moov) return { container: 'mp4', incomplete: true, mdat: sawMdat };
  const m = parseMoov(moov);
  const res = { container: 'mp4', duration: m.duration, faststart: !mdatFirst };
  for (const t of m.tracks) {
    const dur = t.timescale ? t.duration / t.timescale : m.duration;
    if (t.handler === 'vide' && !res.video) {
      res.video = { codec: CODECS[t.format] || t.format, width: Math.round(t.width || t.w), height: Math.round(t.height || t.h),
        frames: t.samples, fps: t.samples && dur ? Math.round((t.samples / dur) * 100) / 100 : undefined };
      if (!res.duration) res.duration = dur;
    }
    if (t.handler === 'soun' && !res.audio) res.audio = { codec: CODECS[t.format] || t.format, sampleRate: t.sampleRate, channels: t.channels };
  }
  if (res.duration) res.bitrate = Math.round((size * 8) / res.duration);
  return res;
}

function probeWav(fd, size) {
  const h = readAt(fd, 0, Math.min(size, 4096));
  if (h.toString('latin1', 0, 4) !== 'RIFF' || h.toString('latin1', 8, 12) !== 'WAVE') return { container: 'wav' };
  const res = { container: 'wav' };
  let p = 12, byteRate = 0, dataStart = 0, dataLen = 0;
  while (p + 8 <= h.length) {
    const id = h.toString('latin1', p, p + 4), len = h.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      res.audio = { codec: h.readUInt16LE(p + 8) === 3 ? 'PCM float' : 'PCM', channels: h.readUInt16LE(p + 10), sampleRate: h.readUInt32LE(p + 12), bits: h.readUInt16LE(p + 22) };
      byteRate = h.readUInt32LE(p + 16);
    }
    if (id === 'data') { dataStart = p + 8; dataLen = len; break; }
    p += 8 + len + (len & 1);
  }
  // Mientras se escribe, la cabecera aún no lleva el tamaño final: se usa el tamaño real del archivo
  const real = Math.max(0, size - dataStart);
  if (byteRate) res.duration = (dataLen && dataLen <= real ? dataLen : real) / byteRate;
  if (res.duration) res.bitrate = Math.round((size * 8) / res.duration);
  return res;
}

const MP3_BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
const MP3_SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function probeMp3(fd, size) {
  const h = readAt(fd, 0, Math.min(size, 64 * 1024));
  let p = 0;
  if (h.toString('latin1', 0, 3) === 'ID3' && h.length >= 10) p = 10 + ((h[6] << 21) | (h[7] << 14) | (h[8] << 7) | h[9]);
  for (; p + 4 <= h.length; p++) {
    if (h[p] !== 0xff || (h[p + 1] & 0xe0) !== 0xe0) continue;
    const ver = (h[p + 1] >> 3) & 3, layer = (h[p + 1] >> 1) & 3, bri = h[p + 2] >> 4, sri = (h[p + 2] >> 2) & 3;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) continue;
    const kbps = MP3_BR[ver === 3 ? 1 : 2][bri], sampleRate = MP3_SR[ver][sri];
    const channels = (h[p + 3] >> 6) === 3 ? 1 : 2;
    return { container: 'mp3', audio: { codec: 'MP3', sampleRate, channels, kbps }, bitrate: kbps * 1000, duration: ((size - p) * 8) / (kbps * 1000), approx: true };
  }
  return { container: 'mp3' };
}

function probe(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const x = file.toLowerCase().split('.').pop();
    if (['mp4', 'mov', 'm4v', 'm4a'].includes(x)) return probeMp4(fd, size);
    if (x === 'wav') return probeWav(fd, size);
    if (x === 'mp3') return probeMp3(fd, size);
    return { container: x };
  } catch (e) {
    return { error: e.code || String(e.message || e) };
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

module.exports = { probe };
