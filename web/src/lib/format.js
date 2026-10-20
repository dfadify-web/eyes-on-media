import { LANG } from './i18n';

export const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n | 0} B`);
export const fmtRate = (bps) => `${fmtBytes(bps)}/s`;
export const fmtBitrate = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} Mb/s` : `${Math.round(b / 1e3)} kb/s`);
export function fmtDur(s) {
  if (s == null || !isFinite(s)) return '—';
  const m = Math.floor(s / 60), r = s - m * 60;
  return m ? `${m}:${r.toFixed(0).padStart(2, '0')}` : `${r.toFixed(r < 10 ? 1 : 0)}s`;
}
export function fmtClock(s) {
  if (!isFinite(s)) s = 0;
  const m = Math.floor(s / 60), r = Math.floor(s % 60), cs = Math.floor((s % 1) * 10);
  return `${m}:${String(r).padStart(2, '0')}.${cs}`;
}
export function fmtElapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`;
}
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString(LANG === 'es' ? 'es-ES' : undefined, { hour12: false });

// Velocidad de escritura real a partir del historial [t, bytes] que manda el servidor
export function writeRate(history, win = 2500) {
  if (!history || history.length < 2) return 0;
  const last = history[history.length - 1];
  let first = history[0];
  for (let i = history.length - 1; i >= 0; i--) { if (last[0] - history[i][0] > win) { first = history[i]; break; } first = history[i]; }
  const dt = (last[0] - first[0]) / 1000;
  return dt > 0 ? Math.max(0, (last[1] - first[1]) / dt) : 0;
}

export function shortPath(p, home) {
  if (!p) return '';
  let s = p;
  if (home && s.toLowerCase().startsWith(home.toLowerCase())) s = '~' + s.slice(home.length);
  return s.replace(/\\/g, '/');
}

// "en-US-AndrewNeural" → { locale, name, flag }
export function voiceInfo(v) {
  const m = /^([a-z]{2,3})-([A-Z]{2,3}|[A-Za-z]+)-(.+?)(Multilingual)?Neural$/.exec(v || '');
  if (!m) return { name: v || '', locale: '', flag: '' };
  const cc = m[2].length === 2 ? m[2].toUpperCase() : '';
  const flag = cc ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '';
  return { name: m[3], locale: `${m[1]}-${m[2]}`, flag, cc, multi: !!m[4] };
}
