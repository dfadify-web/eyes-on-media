import { useEffect, useRef } from 'react';
import { analyserFor } from '../lib/audio';
import { prepCanvas, cssVar } from '../lib/hooks';

// Espectro real del audio que suena (AnalyserNode). mode: 'bars' | 'orb'
// Sin reproducir: solo un anillo/linea en reposo (no se inventa señal).
export default function LiveSpectrum({ el, playing, mode = 'bars', size = 120, height = 56, bars = 64 }) {
  const cv = useRef(null), an = useRef(null), smooth = useRef(new Float32Array(bars));

  useEffect(() => {
    if (playing && el && !an.current) { try { an.current = analyserFor(el); } catch {} }
  }, [playing, el]);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    let raf;
    const freq = new Uint8Array(1024);
    const draw = () => {
      const w = mode === 'orb' ? size : c.parentElement.clientWidth, h = mode === 'orb' ? size : height;
      const g = prepCanvas(c, w, h);
      const a = cssVar('--accent-2') || '#a78bfa', a2 = cssVar('--accent') || '#d97757';
      const s = smooth.current;
      if (an.current && playing) {
        an.current.getByteFrequencyData(freq);
        const n = an.current.frequencyBinCount;
        for (let i = 0; i < bars; i++) { // reparto logarítmico de bandas
          const f0 = Math.floor(Math.pow(n, i / bars)), f1 = Math.max(f0 + 1, Math.floor(Math.pow(n, (i + 1) / bars)));
          let m = 0; for (let j = f0; j < f1 && j < n; j++) m = Math.max(m, freq[j]);
          s[i] = Math.max(m / 255, s[i] * 0.88);
        }
      } else for (let i = 0; i < bars; i++) s[i] *= 0.9;

      if (mode === 'orb') {
        const cx = w / 2, cy = h / 2, r0 = w * 0.3;
        let energy = 0; for (let i = 0; i < bars; i++) energy += s[i]; energy /= bars;
        const glow = g.createRadialGradient(cx, cy, r0 * 0.4, cx, cy, r0 * 1.6);
        glow.addColorStop(0, hexA(a, 0.18 + energy * 0.5)); glow.addColorStop(1, hexA(a, 0));
        g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, r0 * 1.6, 0, Math.PI * 2); g.fill();
        g.lineCap = 'round'; g.lineWidth = Math.max(1.5, (Math.PI * 2 * r0) / bars / 2.2);
        for (let i = 0; i < bars; i++) {
          const v = s[i < bars / 2 ? i * 2 : (bars - 1 - i) * 2 + 1] ?? 0; // simétrico
          const ang = (i / bars) * Math.PI * 2 - Math.PI / 2, len = 2 + v * r0 * 0.62;
          g.strokeStyle = i % 2 ? a : a2;
          g.globalAlpha = 0.35 + v * 0.65;
          g.beginPath(); g.moveTo(cx + Math.cos(ang) * (r0 + 3), cy + Math.sin(ang) * (r0 + 3));
          g.lineTo(cx + Math.cos(ang) * (r0 + 3 + len), cy + Math.sin(ang) * (r0 + 3 + len)); g.stroke();
        }
        g.globalAlpha = 1;
        g.strokeStyle = hexA(a, 0.35 + energy); g.lineWidth = 1.5;
        g.beginPath(); g.arc(cx, cy, r0, 0, Math.PI * 2); g.stroke();
      } else {
        const bw = w / bars;
        const grad = g.createLinearGradient(0, h, 0, 0); grad.addColorStop(0, a); grad.addColorStop(1, a2);
        g.fillStyle = grad;
        for (let i = 0; i < bars; i++) {
          const bh = Math.max(1.5, s[i] * (h - 2));
          g.globalAlpha = 0.45 + s[i] * 0.55;
          g.beginPath(); g.roundRect ? g.roundRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh, 1.5) : g.rect(i * bw + 1, h - bh, bw - 2, bh); g.fill();
        }
        g.globalAlpha = 1;
      }
      const busy = playing || s.some((v) => v > 0.01);
      if (busy) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [playing, mode, size, height, bars]);

  return <canvas ref={cv} className={`spectrum spectrum-${mode}`} style={mode === 'orb' ? { width: size, height: size } : { height }} />;
}

function hexA(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${Math.max(0, Math.min(1, a))})`;
}
