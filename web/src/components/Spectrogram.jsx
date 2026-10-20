import { useEffect, useRef, useState } from 'react';
import { spectrogram, PALETTE } from '../lib/audio';
import { useSize } from '../lib/hooks';

// Espectrograma real (FFT del audio decodificado), eje de frecuencia logarítmico 40 Hz–16 kHz
export default function Spectrogram({ buffer, progress = 0, duration = 0, onSeek, height = 150 }) {
  const wrap = useRef(null), cv = useRef(null);
  const { w } = useSize(wrap);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!buffer || !w) return;
    setReady(false);
    const id = requestIdleCallback ? requestIdleCallback(paint, { timeout: 300 }) : setTimeout(paint, 30);
    function paint() {
      const cols = Math.min(1400, Math.round(w)), rows = 160;
      const s = spectrogram(buffer, cols, rows);
      const c = cv.current;
      c.width = cols; c.height = rows;
      const img = c.getContext('2d').createImageData(cols, rows);
      for (let x = 0; x < cols; x++) for (let r = 0; r < rows; r++) {
        const v = s.data[x * rows + r], p = PALETTE[v], o = ((rows - 1 - r) * cols + x) * 4;
        img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 255;
      }
      c.getContext('2d').putImageData(img, 0, 0);
      setReady(true);
    }
    return () => (cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id));
  }, [buffer, w]);

  return (
    <div className={`specgram ${ready ? 'ready' : ''}`} ref={wrap} style={{ height }}
      onClick={(e) => { if (!onSeek || !duration) return; const r = wrap.current.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * duration); }}>
      <canvas ref={cv} />
      <div className="specgram-axis"><span>16k</span><span>2k</span><span>250</span><span>40 Hz</span></div>
      {progress > 0 && <i className="specgram-head" style={{ left: `${progress * 100}%` }} />}
    </div>
  );
}
