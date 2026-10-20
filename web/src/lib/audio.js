// Audio real: decodificación del archivo, picos de la forma de onda, espectrograma (FFT) y analizador en vivo.
let ctx = null;
export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// Cola: como mucho 2 decodificaciones a la vez para no congelar la página con muchos archivos
const cache = new Map(); // url -> Promise<AudioBuffer>
let active = 0;
const queue = [];
const slot = () => new Promise((res) => { if (active < 2) { active++; res(); } else queue.push(res); });
const release = () => { const next = queue.shift(); if (next) next(); else active--; };
export function decode(url) {
  if (cache.has(url)) return cache.get(url);
  const p = slot().then(() => fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((buf) => audioCtx().decodeAudioData(buf))
    .finally(release));
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return p;
}

// [min, max, rms] por columna, mezclando canales
export function peaks(buffer, n) {
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const len = buffer.length, step = len / n;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step), b = Math.min(len, Math.floor((i + 1) * step));
    let mn = 1, mx = -1, sq = 0, cnt = 0;
    const stride = Math.max(1, Math.floor((b - a) / 400));
    for (let j = a; j < b; j += stride) {
      let v = 0;
      for (const c of chans) v += c[j];
      v /= chans.length;
      if (v < mn) mn = v; if (v > mx) mx = v;
      sq += v * v; cnt++;
    }
    if (!cnt) { mn = mx = 0; }
    out[i * 3] = mn; out[i * 3 + 1] = mx; out[i * 3 + 2] = cnt ? Math.sqrt(sq / cnt) : 0;
  }
  return out;
}

// FFT radix-2 in situ
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// Espectrograma con eje de frecuencia logarítmico: Uint8Array cols×rows (0-255), fila 0 = graves
const specCache = new WeakMap();
export function spectrogram(buffer, cols = 600, rows = 128, size = 1024) {
  const k = `${cols}x${rows}`;
  const c = specCache.get(buffer);
  if (c?.[k]) return c[k];
  const data = buffer.getChannelData(0), sr = buffer.sampleRate;
  const out = new Uint8Array(cols * rows);
  const re = new Float32Array(size), im = new Float32Array(size), win = new Float32Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const fMin = 40, fMax = Math.min(sr / 2, 16000);
  const binOf = (f) => Math.min(size / 2 - 1, Math.round((f / sr) * size));
  const edges = Array.from({ length: rows + 1 }, (_, r) => binOf(fMin * Math.pow(fMax / fMin, r / rows)));
  for (let x = 0; x < cols; x++) {
    const start = Math.floor((x / cols) * Math.max(1, data.length - size));
    for (let i = 0; i < size; i++) { re[i] = (data[start + i] || 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let r = 0; r < rows; r++) {
      let m = 0;
      for (let b = edges[r]; b <= Math.max(edges[r], edges[r + 1] - 1); b++) m = Math.max(m, Math.hypot(re[b], im[b]));
      const db = 20 * Math.log10(m / size + 1e-9);
      out[x * rows + r] = Math.max(0, Math.min(255, ((db + 100) / 80) * 255));
    }
  }
  specCache.set(buffer, { ...(c || {}), [k]: { data: out, cols, rows } });
  return { data: out, cols, rows };
}

// Paleta del espectrograma: negro → violeta → naranja Claude → amarillo
const STOPS = [[9, 9, 11], [46, 16, 101], [124, 58, 237], [217, 119, 87], [251, 191, 36], [254, 249, 195]];
export const PALETTE = Array.from({ length: 256 }, (_, i) => {
  const t = (i / 255) * (STOPS.length - 1), a = Math.floor(t), f = t - a, A = STOPS[a], B = STOPS[Math.min(STOPS.length - 1, a + 1)];
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f].map(Math.round);
});

// Analizador en vivo de un <audio>/<video> (un MediaElementSource por elemento)
const graphs = new WeakMap();
export function analyserFor(el) {
  if (graphs.has(el)) return graphs.get(el);
  const ac = audioCtx();
  const src = ac.createMediaElementSource(el);
  const an = ac.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0.78;
  src.connect(an); an.connect(ac.destination);
  graphs.set(el, an);
  return an;
}
