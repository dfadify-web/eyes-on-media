import { useEffect, useRef, useState } from 'react';

// Miniaturas reales del vídeo (se busca cada instante en un <video> oculto y se pinta en canvas)
const memo = new Map();
export default function Filmstrip({ src, duration, progress = 0, onSeek, count = 10, height = 40 }) {
  const [thumbs, setThumbs] = useState(memo.get(src) || []);
  const wrap = useRef(null);
  useEffect(() => {
    if (!src || !duration || memo.has(src)) { setThumbs(memo.get(src) || []); return; }
    let dead = false;
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = src; v.crossOrigin = 'anonymous';
    const out = [];
    const cv = document.createElement('canvas');
    const grab = (i) => {
      if (dead || i >= count) { if (!dead) { memo.set(src, out); setThumbs([...out]); } v.removeAttribute('src'); v.load(); return; }
      v.currentTime = Math.min(duration - 0.05, ((i + 0.5) / count) * duration);
      v.onseeked = () => {
        const h = 72, w = Math.round((v.videoWidth / v.videoHeight) * h) || 128;
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(v, 0, 0, w, h);
        out.push(cv.toDataURL('image/jpeg', 0.7));
        if (!dead) setThumbs([...out]);
        grab(i + 1);
      };
    };
    v.onloadeddata = () => grab(0);
    v.onerror = () => {};
    return () => { dead = true; };
  }, [src, duration, count]);

  if (!thumbs.length) return <div className="filmstrip empty" style={{ height }} />;
  return (
    <div className="filmstrip" ref={wrap} style={{ height }}
      onClick={(e) => { e.stopPropagation(); const r = wrap.current.getBoundingClientRect(); onSeek?.(((e.clientX - r.left) / r.width) * duration); }}>
      {thumbs.map((s, i) => <img key={i} src={s} alt="" draggable="false" />)}
      <i className="filmstrip-head" style={{ left: `${progress * 100}%` }} />
    </div>
  );
}
