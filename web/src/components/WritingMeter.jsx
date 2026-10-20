import { useEffect, useRef } from 'react';
import { prepCanvas, useSize, cssVar } from '../lib/hooks';
import { fmtBytes, fmtRate, fmtElapsed, writeRate } from '../lib/format';
import { t } from '../lib/i18n';
import { useNow } from '../lib/store';

// Curva real del tamaño del archivo a lo largo del tiempo mientras se escribe
export function Sparkline({ history, height = 34, unit = 'bytes' }) {
  const wrap = useRef(null), cv = useRef(null);
  const { w } = useSize(wrap);
  useEffect(() => {
    if (!w || !cv.current) return;
    const g = prepCanvas(cv.current, w, height);
    if (!history || history.length < 2) return;
    const t0 = history[0][0], t1 = history[history.length - 1][0] || t0 + 1;
    const v0 = unit === 'bytes' ? 0 : history[0][1], v1 = Math.max(...history.map((h) => h[1]));
    const X = (x) => ((x - t0) / Math.max(1, t1 - t0)) * (w - 4) + 2, Y = (y) => height - 3 - ((y - v0) / Math.max(1, v1 - v0)) * (height - 6);
    const a = cssVar('--accent-2') || '#a78bfa';
    const grad = g.createLinearGradient(0, 0, 0, height); grad.addColorStop(0, a + '66'); grad.addColorStop(1, a + '00');
    g.beginPath(); g.moveTo(X(history[0][0]), height);
    for (const [x, y] of history) g.lineTo(X(x), Y(y));
    g.lineTo(X(t1), height); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); history.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    g.strokeStyle = a; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
    const [lx, ly] = history[history.length - 1];
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(lx), Y(ly), 2.6, 0, Math.PI * 2); g.fill();
  }, [history, w, height, unit]);
  return <div className="spark" ref={wrap} style={{ height }}><canvas ref={cv} /></div>;
}

export default function WritingMeter({ item, label }) {
  const now = useNow(500);
  const rate = writeRate(item.history);
  return (
    <div className="writing">
      <div className="writing-scan" />
      <div className="writing-top">
        <span className="rec"><i />{label || t('writing')}</span>
        <span className="writing-el">{fmtElapsed(now - item.born)}</span>
      </div>
      <div className="writing-size">{fmtBytes(item.size)}</div>
      <div className="writing-rate">{rate > 0 ? `+${fmtRate(rate)}` : t('growing')}</div>
      <Sparkline history={item.history} />
    </div>
  );
}
