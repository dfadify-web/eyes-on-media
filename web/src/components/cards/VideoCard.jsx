import { useEffect, useRef, useState } from 'react';
import { useVisible } from '../../lib/visible';
import CardShell, { MetaChips } from '../CardShell';
import WritingMeter from '../WritingMeter';
import Waveform from '../Waveform';
import Filmstrip from '../Filmstrip';
import Icon from '../Icon';
import { fileUrl } from '../../lib/store';
import { useDecoded, usePeaks, usePlayer } from '../../lib/hooks';
import { fmtClock } from '../../lib/format';
import { t } from '../../lib/i18n';

export function VideoPlayer({ item, autoplay, big = false, onEl }) {
  const [el, setEl] = useState(null);
  const p = usePlayer(el);
  const src = fileUrl(item);
  const [failed, setFailed] = useState(false);
  useEffect(() => { onEl?.(el); }, [el]);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    if (!el) return;
    if (autoplay) { el.muted = true; el.play().catch(() => {}); } else if (!big) el.pause();
  }, [autoplay, el, src]);
  const v = item.meta?.video;
  const ratio = v?.width && v?.height ? v.width / v.height : 16 / 9;
  return (
    <div className={`player ${big ? 'big' : ''} ${ratio < 1 ? 'portrait' : ''}`} style={{ '--ratio': ratio }}>
      <div className="player-frame">
        {failed ? <div className="player-msg">{t('partialVideo')}</div> : (
          <video ref={setEl} src={src} playsInline loop preload="metadata" onClick={p.toggle} onError={() => setFailed(true)} />
        )}
        {!failed && (
          <div className={`player-ui ${p.playing ? 'playing' : ''}`}>
            <button className="big-play" onClick={p.toggle} aria-label="play"><Icon name={p.playing ? 'pause' : 'play'} size={22} /></button>
            <div className="player-bar">
              <button className="ghost" onClick={p.toggle}><Icon name={p.playing ? 'pause' : 'play'} size={14} /></button>
              <span className="tc">{fmtClock(p.time)} <em>/ {fmtClock(p.duration)}</em></span>
              <span className="grow" />
              <button className="ghost" onClick={() => p.setMuted(!p.muted)}><Icon name={p.muted ? 'mute' : 'vol'} size={14} /></button>
            </div>
          </div>
        )}
        {v?.width && <span className="res-badge">{v.width}×{v.height}{v.fps ? ` · ${Math.round(v.fps)}fps` : ''}</span>}
      </div>
      {p.duration > 0 && <Filmstrip src={src} duration={p.duration} progress={p.duration ? p.time / p.duration : 0} onSeek={p.seek} height={big ? 54 : 34} />}
      <VideoAudio item={item} src={src} player={p} big={big} />
    </div>
  );
}

function VideoAudio({ item, src, player, big }) {
  const hasAudio = !!item.meta?.audio || (item.ext !== 'mp4' && item.ext !== 'mov');
  const tooBig = item.size > 120e6;
  const box = useRef(null);
  const visible = useVisible(box);
  const { buffer, error, loading } = useDecoded(src, hasAudio && !tooBig && (big || visible));
  const pk = usePeaks(buffer, big ? 1400 : 700);
  if (!hasAudio) return <div className="no-audio"><Icon name="mute" size={12} />{t('noAudioTrack')}</div>;
  if (tooBig) return null;
  const d = buffer?.duration || player.duration;
  return (
    <div className="v-audio" ref={box}>
      <Waveform peaks={pk} progress={d ? player.time / d : 0} duration={d} onSeek={player.seek} height={big ? 70 : 38} />
      {loading && !pk && <span className="tiny muted">{t('decoding')}</span>}
      {error && !pk && <span className="tiny muted">{t('cantDecode')}</span>}
    </div>
  );
}

export default function VideoCard({ item, home, job, autoplay, onTheater, flash }) {
  const writing = item.status === 'writing';
  return (
    <CardShell item={item} home={home} job={job} onTheater={writing ? null : onTheater} flash={flash}>
      {writing ? <div className="card-stage"><WritingMeter item={item} label={t('rendering')} /></div> : <VideoPlayer item={item} autoplay={autoplay} />}
      <MetaChips meta={item.meta} />
    </CardShell>
  );
}
