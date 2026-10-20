import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Icon from './Icon';
import Waveform from './Waveform';
import Spectrogram from './Spectrogram';
import LiveSpectrum from './LiveSpectrum';
import { SubtitleLine, SubtitleList } from './Subtitles';
import { VideoPlayer } from './cards/VideoCard';
import { VoiceBadge, useAudioItem } from './cards/AudioCard';
import { usePlayer } from '../lib/hooks';
import { fmtBytes, fmtBitrate, fmtDur, fmtClock, shortPath } from '../lib/format';
import { t } from '../lib/i18n';

function Details({ item, job, home }) {
  const m = item.meta || {}, v = m.video, a = m.audio;
  const rows = [
    [t('file'), shortPath(item.path, home)], [t('size'), fmtBytes(item.size)], m.duration && [t('duration'), fmtDur(m.duration)],
    v && [t('resolution'), `${v.width}×${v.height}${v.fps ? ` @ ${v.fps} fps` : ''}${v.frames ? ` · ${v.frames} ${t('frames')}` : ''}`],
    v && [t('codec'), v.codec + (m.faststart ? ` · ${t('faststart')}` : '')],
    a && [t('sampleRate'), `${a.codec} · ${a.sampleRate} Hz · ${a.channels} ch`], m.bitrate && [t('bitrate'), fmtBitrate(m.bitrate)],
  ].filter(Boolean);
  return (
    <div className="details">
      <dl>{rows.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
      {job && <><div className="label"><Icon name="terminal" size={12} />{t('command')}</div><pre className="job-cmd">{job.command}</pre></>}
    </div>
  );
}

function AudioTheater({ item, job, home }) {
  const [el, setEl] = useState(null);
  const p = usePlayer(el);
  const a = useAudioItem(item, 1600);
  const dur = p.duration || a.buffer?.duration || 0;
  const prog = dur ? p.time / dur : 0;
  return (
    <div className="th-audio">
      <audio ref={setEl} src={a.src} preload="auto" />
      <div className="th-hero">
        <div className="orb-wrap big">
          <LiveSpectrum el={el} playing={p.playing} mode="orb" size={190} bars={84} />
          <button className={`orb-play ${p.playing ? 'on' : ''}`} onClick={p.toggle}><Icon name={p.playing ? 'pause' : 'play'} size={28} /></button>
        </div>
        <div className="th-hero-info">
          {item.tts ? <VoiceBadge tts={item.tts} /> : <div className="voice"><span className="voice-name">{item.name}</span></div>}
          {item.tts?.text && <blockquote className="tts-text big">“{item.tts.text}”</blockquote>}
          <div className="tc big">{fmtClock(p.time)} <em>/ {fmtClock(dur)}</em></div>
          {a.cues.length > 0 && <SubtitleLine cues={a.cues} time={p.time} placeholder={`${a.cues.length} · ${t('subtitles')}`} />}
        </div>
      </div>
      <div className="label"><Icon name="wave" size={12} />{t('waveform')}</div>
      <Waveform peaks={a.peaks} progress={prog} duration={dur} onSeek={p.seek} height={96} cues={a.cues} bar={2} gap={1} live={a.writing} />
      <div className="label"><Icon name="bolt" size={12} />{t('spectrum')}</div>
      <LiveSpectrum el={el} playing={p.playing} mode="bars" height={70} bars={96} />
      <div className="label"><Icon name="grid" size={12} />{t('spectrogram')}</div>
      <Spectrogram buffer={a.buffer} progress={prog} duration={dur} onSeek={p.seek} />
      <div className="th-cols">
        {a.cues.length > 0 && <div><div className="label"><Icon name="cc" size={12} />{t('subtitles')}</div><SubtitleList cues={a.cues} time={p.time} onSeek={(x) => { p.seek(x); el?.play(); }} /></div>}
        <Details item={item} job={job} home={home} />
      </div>
    </div>
  );
}

function VideoTheater({ item, job, home }) {
  const [el, setEl] = useState(null);
  const p = usePlayer(el);
  return (
    <div className="th-video">
      <VideoPlayer item={item} big onEl={setEl} />
      {el && <><div className="label"><Icon name="bolt" size={12} />{t('spectrum')}</div><LiveSpectrum el={el} playing={p.playing} mode="bars" height={60} bars={96} /></>}
      <Details item={item} job={job} home={home} />
    </div>
  );
}

export default function Theater({ item, job, home, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return (
    <motion.div className="theater" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="th-box" initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }} onClick={(e) => e.stopPropagation()}>
        <header className="th-head">
          <span className="kind-tile"><Icon name={item.kind === 'audio' ? 'wave' : 'film'} size={16} /></span>
          <div className="card-id"><div className="card-name">{item.name}</div><div className="card-path">{shortPath(item.dir, home)}</div></div>
          <button className="ghost" onClick={onClose} aria-label={t('close')}><Icon name="x" /></button>
        </header>
        {item.kind === 'audio' ? <AudioTheater item={item} job={job} home={home} /> : <VideoTheater item={item} job={job} home={home} />}
      </motion.div>
    </motion.div>
  );
}
