import { useEffect, useRef } from 'react';
import { fmtClock } from '../lib/format';

// Línea actual de subtítulos con barrido tipo karaoke (proporcional al tiempo real del cue)
export function SubtitleLine({ cues, time, placeholder }) {
  const i = cues.findIndex((c) => time >= c.start && time < c.end);
  const c = cues[i];
  if (!c) return <div className="sub-line idle">{placeholder}</div>;
  const k = Math.max(0, Math.min(1, (time - c.start) / (c.end - c.start)));
  return (
    <div className="sub-line" key={i}>
      <span className="sub-text" style={{ '--k': `${k * 100}%` }} data-text={c.text}>{c.text}</span>
    </div>
  );
}

export function SubtitleList({ cues, time, onSeek }) {
  const box = useRef(null);
  const active = cues.findIndex((c) => time >= c.start && time < c.end);
  useEffect(() => {
    const el = box.current?.children[active];
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);
  return (
    <ol className="sub-list" ref={box}>
      {cues.map((c, i) => (
        <li key={i} className={i === active ? 'on' : time >= c.end ? 'past' : ''} onClick={() => onSeek?.(c.start + 0.01)}>
          <time>{fmtClock(c.start)}</time><span>{c.text}</span>
        </li>
      ))}
    </ol>
  );
}
