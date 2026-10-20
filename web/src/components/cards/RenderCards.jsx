import { useEffect, useState } from 'react';
import CardShell from '../CardShell';
import { Sparkline } from '../WritingMeter';
import Icon from '../Icon';
import { fileUrl, useNow } from '../../lib/store';
import { fmtBytes, fmtRate, fmtElapsed, writeRate } from '../../lib/format';
import { t } from '../../lib/i18n';

// Secuencia de fotogramas: el último fotograma real escrito + ritmo de escritura
export function FramesCard({ item, home, flash }) {
  const writing = item.status === 'writing';
  const [shown, setShown] = useState(null);
  const latest = item.latest ? item.latest.split(/[\\/]/).pop() : null;
  useEffect(() => { // precarga para que el cambio de fotograma no parpadee
    if (!latest) return;
    const src = fileUrl(item, latest), img = new Image();
    img.onload = () => setShown(src); img.src = src;
  }, [latest, item.mtime]);
  return (
    <CardShell item={item} home={home} flash={flash}>
      <div className="frame-stage">
        {shown ? <img src={shown} alt="" /> : <div className="player-msg">…</div>}
        {writing && <span className="rec floating"><i />{t('rendering')}</span>}
        <span className="res-badge">{latest}</span>
      </div>
      <div className="frame-recent">{item.recent.map((n) => <img key={n} src={fileUrl({ ...item, mtime: 0, size: 0 }, n)} alt="" />)}</div>
      <div className="stat-row">
        <div><b>{item.frames}</b><span>{t('frames')}</span></div>
        <div><b>{writing ? item.rate || '—' : '—'}</b><span>{t('frames')}{t('perSec')}</span></div>
        <div className="grow"><Sparkline history={item.history} unit="count" height={30} /></div>
      </div>
    </CardShell>
  );
}

// Trozos que turbo-render escribe en paralelo (%TEMP%/turbo-*/seg_*.mp4)
export function SegmentsCard({ item, home, flash }) {
  const now = useNow(500);
  const writing = item.status === 'writing';
  const done = item.segments.filter((s) => s.status === 'ready');
  const last = done[done.length - 1];
  return (
    <CardShell item={item} home={home} flash={flash} wide>
      <div className="seg-wrap">
        <div className="seg-video">
          {last ? <video key={last.name} src={fileUrl(item, last.name)} autoPlay muted loop playsInline /> : <div className="player-msg">…</div>}
          {last && <span className="res-badge">{t('latestSeg')} · {last.name}</span>}
        </div>
        <div className="seg-side">
          <div className="seg-grid">
            {item.segments.map((s) => <i key={s.name} className={s.status} title={`${s.name} · ${fmtBytes(s.size)}`} />)}
          </div>
          <div className="tiny muted">{t('chunkLegend')}</div>
          <div className="stat-row">
            <div><b>{done.length}/{item.segments.length}</b><span>{t('segments')}</span></div>
            <div><b>{writing ? fmtRate(writeRate(item.history)) : fmtBytes(item.size)}</b><span>{writing ? t('writing') : t('size')}</span></div>
            <div><b>{fmtElapsed((writing ? now : item.readyAt || now) - item.born)}</b><span><Icon name="clock" size={11} /></span></div>
          </div>
          <Sparkline history={item.history} height={36} />
        </div>
      </div>
    </CardShell>
  );
}
