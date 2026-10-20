import { useMemo, useRef, useState } from 'react';
import { useVisible } from '../../lib/visible';
import CardShell, { MetaChips } from '../CardShell';
import Waveform from '../Waveform';
import LiveSpectrum from '../LiveSpectrum';
import { SubtitleLine } from '../Subtitles';
import Icon from '../Icon';
import { fileUrl } from '../../lib/store';
import { useDecoded, usePeaks, usePlayer } from '../../lib/hooks';
import { fmtClock, fmtRate, writeRate, voiceInfo } from '../../lib/format';
import { parseSubs } from '../../lib/subs';
import { t } from '../../lib/i18n';

export function VoiceBadge({ tts }) {
  if (!tts?.voice) return null;
  const v = voiceInfo(tts.voice);
  return (
    <div className="voice">
      <span className="voice-name">{v.name}</span>
      {v.locale && <span className="voice-loc">{v.locale}{v.multi ? ' · multi' : ''}</span>}
      {tts.rate && <span className="voice-loc">{t('rate')} {tts.rate}</span>}
      {tts.pitch && <span className="voice-loc">{t('pitch')} {tts.pitch}</span>}
    </div>
  );
}

export function useAudioItem(item, n = 800, enabled = true) {
  const src = fileUrl(item);
  const writing = item.status === 'writing';
  const dec = useDecoded(src, enabled && item.size < 80e6, writing);
  const pk = usePeaks(dec.buffer, n);
  const cues = useMemo(() => parseSubs(item.subs?.text), [item.subs?.text]);
  return { src, writing, ...dec, peaks: pk, cues };
}

export default function AudioCard({ item, home, job, onTheater, flash }) {
  const [el, setEl] = useState(null);
  const p = usePlayer(el);
  const box = useRef(null);
  const visible = useVisible(box);
  const a = useAudioItem(item, 800, visible);
  const dur = p.duration || a.buffer?.duration || item.meta?.duration || 0;
  return (
    <CardShell item={item} home={home} job={job} onTheater={onTheater} flash={flash}>
      <audio ref={setEl} src={a.src} preload="metadata" />
      <div className="voice-hero" ref={box}>
        <div className="orb-wrap">
          <LiveSpectrum el={el} playing={p.playing} mode="orb" size={112} bars={56} />
          <button className={`orb-play ${p.playing ? 'on' : ''}`} onClick={p.toggle} disabled={a.writing && !a.buffer} aria-label="play">
            <Icon name={p.playing ? 'pause' : 'play'} size={20} />
          </button>
        </div>
        <div className="voice-info">
          {item.tts ? <VoiceBadge tts={item.tts} /> : <div className="voice"><span className="voice-name">{item.name.replace(/\.[^.]+$/, '')}</span></div>}
          {item.tts?.text && <blockquote className="tts-text">“{item.tts.text}”</blockquote>}
          <div className="tc">{a.writing ? <span className="rec"><i />{t('synthesizing')} · +{fmtRate(writeRate(item.history))}</span> : <>{fmtClock(p.time)} <em>/ {fmtClock(dur)}</em></>}</div>
        </div>
      </div>
      <Waveform peaks={a.peaks} progress={dur ? p.time / dur : 0} duration={dur} onSeek={p.seek} live={a.writing} height={58} cues={a.cues} />
      {a.cues.length > 0 && <SubtitleLine cues={a.cues} time={p.time} placeholder={<><Icon name="cc" size={13} /> {a.cues.length} · {a.cues[0].text}</>} />}
      <MetaChips meta={item.meta && a.buffer ? { ...item.meta, duration: a.buffer.duration, approx: false } : item.meta} />
    </CardShell>
  );
}
