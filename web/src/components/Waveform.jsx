import { useEffect, useRef, useState } from 'react';
import { prepCanvas, useSize, cssVar } from '../lib/hooks';
import { fmtClock } from '../lib/format';

// Forma de onda real (picos min/max + RMS) con cabezal de reproducción, hover y clic para saltar.
// `live`: el archivo aún se está escribiendo → cabezal de escritura brillante en el borde derecho.
export default function Waveform({ peaks, progress = 0, duration = 0, onSeek, live = false, height = 64, cues, accent = '--accent-2', bar = 2, gap = 1 }) {
  const wrap = useRef(null), cv = useRef(null);
  const { w } = useSize(wrap);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const c = cv.current;
    if (!c || !w) return;
    const g = prepCanvas(c, w, height);
    const mid = height / 2;
    const a = cssVar(accent) || '#a78bfa', a2 = cssVar('--accent') || '#d97757', dim = cssVar('--wave-dim') || 'rgba(255,255,255,.18)';
    const n = Math.max(1, Math.floor(w / (bar + gap)));
    if (!peaks) {
      g.fillStyle = dim;
      for (let i = 0; i < n; i++) g.fillRect(i * (bar + gap), mid - 0.5, bar, 1);
      return;
    }
    const total = peaks.length / 3;
    const played = progress * w;
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, a); grad.addColorStop(1, a2);
    for (let i = 0; i < n; i++) {
      const j0 = Math.floor((i / n) * total), j1 = Math.max(j0 + 1, Math.floor(((i + 1) / n) * total));
      let mn = 0, mx = 0, rms = 0;
      for (let j = j0; j < j1; j++) { mn = Math.min(mn, peaks[j * 3]); mx = Math.max(mx, peaks[j * 3 + 1]); rms = Math.max(rms, peaks[j * 3 + 2]); }
      const amp = Math.max(Math.abs(mn), Math.abs(mx));
      const hTop = Math.max(1, Math.pow(amp, 0.8) * (mid - 2));
      const x = i * (bar + gap);
      g.globalAlpha = 1;
      g.fillStyle = x < played ? grad : dim;
      g.beginPath(); g.roundRect ? g.roundRect(x, mid - hTop, bar, hTop * 2, 1) : g.rect(x, mid - hTop, bar, hTop * 2); g.fill();
      if (x < played && rms > 0.02) { // núcleo RMS más brillante
        g.globalAlpha = 0.55; g.fillStyle = '#fff';
        const hr = Math.max(0.5, Math.pow(rms, 0.8) * (mid - 2));
        g.fillRect(x, mid - hr, bar, hr * 2);
      }
    }
    g.globalAlpha = 1;
    if (progress > 0 && progress < 1) {
      g.fillStyle = cssVar('--text') || '#fff';
      g.fillRect(Math.round(played) - 0.5, 2, 1.5, height - 4);
    }
    if (live) {
      const lg = g.createLinearGradient(w - 40, 0, w, 0);
      lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, a);
      g.globalAlpha = 0.35; g.fillStyle = lg; g.fillRect(w - 40, 0, 40, height); g.globalAlpha = 1;
    }
  }, [peaks, progress, w, height, live, accent, bar, gap]);

  const pos = (e) => { const r = wrap.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  return (
    <div className={`wave ${live ? 'is-live' : ''} ${onSeek && duration ? 'seekable' : ''}`} ref={wrap} style={{ height }}
      onPointerMove={(e) => duration && setHover(pos(e))} onPointerLeave={() => setHover(null)}
      onClick={(e) => { e.stopPropagation(); onSeek && duration && onSeek(pos(e) * duration); }}>
      {cues?.length > 0 && duration > 0 && (
        <div className="wave-cues">{cues.map((c, i) => <i key={i} style={{ left: `${(c.start / duration) * 100}%`, width: `${((c.end - c.start) / duration) * 100}%` }} className={progress * duration >= c.start && progress * duration < c.end ? 'on' : ''} />)}</div>
      )}
      <canvas ref={cv} />
      {hover != null && duration > 0 && (
        <div className="wave-hover" style={{ left: `${hover * 100}%` }}><span>{fmtClock(hover * duration)}</span></div>
      )}
      {live && <span className="write-head" />}
    </div>
  );
}
