import { useEffect, useRef, useState, useCallback } from 'react';
import { decode, peaks, audioCtx } from './audio';

// Decodifica el audio real del archivo. Mientras el archivo crece se vuelve a decodificar (como mucho 1 vez/s)
export function useDecoded(url, enabled = true, live = false) {
  const [st, setSt] = useState({ buffer: null, error: null, loading: false });
  const last = useRef(0), timer = useRef(null);
  useEffect(() => {
    if (!enabled || !url) return;
    let dead = false;
    const run = () => {
      last.current = Date.now();
      setSt((s) => ({ ...s, loading: true }));
      decode(url).then((buffer) => !dead && setSt({ buffer, error: null, loading: false }))
        .catch((e) => !dead && setSt((s) => ({ buffer: s.buffer, error: s.buffer ? null : String(e?.message || e), loading: false })));
    };
    const wait = live ? Math.max(0, 1000 - (Date.now() - last.current)) : 0;
    timer.current = setTimeout(run, wait);
    return () => { dead = true; clearTimeout(timer.current); };
  }, [url, enabled, live]);
  return st;
}

export function usePeaks(buffer, n = 900) {
  const [p, setP] = useState(null);
  useEffect(() => { setP(buffer ? peaks(buffer, n) : null); }, [buffer, n]);
  return p;
}

// Estado de reproducción de un <video>/<audio> con tiempo suave (rAF)
export function usePlayer(el) {
  const [s, setS] = useState({ playing: false, time: 0, duration: 0, muted: false });
  useEffect(() => {
    if (!el) return;
    let raf;
    const upd = () => setS({ playing: !el.paused, time: el.currentTime, duration: isFinite(el.duration) ? el.duration : 0, muted: el.muted });
    const loop = () => { upd(); if (!el.paused) raf = requestAnimationFrame(loop); };
    const onPlay = () => { audioCtx().resume?.(); cancelAnimationFrame(raf); loop(); };
    const evs = ['pause', 'seeked', 'loadedmetadata', 'volumechange', 'ended', 'durationchange', 'timeupdate'];
    el.addEventListener('play', onPlay); evs.forEach((e) => el.addEventListener(e, upd));
    upd();
    return () => { cancelAnimationFrame(raf); el.removeEventListener('play', onPlay); evs.forEach((e) => el.removeEventListener(e, upd)); };
  }, [el]);
  const toggle = useCallback(() => { if (!el) return; audioCtx().resume?.(); el.paused ? el.play().catch(() => {}) : el.pause(); }, [el]);
  const seek = useCallback((t) => { if (el && isFinite(t)) el.currentTime = Math.max(0, Math.min(t, el.duration || t)); }, [el]);
  const setMuted = useCallback((m) => { if (el) el.muted = m; }, [el]);
  return { ...s, toggle, seek, setMuted };
}

export function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return size;
}

// Canvas nítido en pantallas HiDPI
export function prepCanvas(cv, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

export const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
