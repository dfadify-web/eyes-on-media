import { motion } from 'motion/react';
import Icon from './Icon';
import { t } from '../lib/i18n';
import { api, useNow } from '../lib/store';
import { fmtBytes, fmtDur, fmtBitrate, fmtElapsed, shortPath } from '../lib/format';

const KIND_ICON = { video: 'film', audio: 'wave', frames: 'frames', segments: 'cpu' };
const SRC = { claude: 'srcClaude', temp: 'srcTemp', folder: 'srcFolder' };

export default function CardShell({ item, home, children, onTheater, flash, wide, job }) {
  const now = useNow(5000);
  const writing = item.status === 'writing';
  return (
    <motion.article
      layout="position" id={`m-${item.id}`}
      initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={`card k-${item.kind} ${writing ? 'is-writing' : ''} ${flash ? 'flash' : ''} ${wide ? 'wide' : ''}`}>
      {writing && <div className="ring" aria-hidden="true" />}
      <header className="card-head">
        <span className="kind-tile"><Icon name={KIND_ICON[item.kind]} size={16} /></span>
        <div className="card-id">
          <div className="card-name" title={item.path}>{item.name}</div>
          <div className="card-path">{shortPath(item.dir, home)}</div>
        </div>
        <span className={`src src-${item.source}`}>{t(SRC[item.source] || 'srcFolder')}</span>
        <div className="card-actions">
          {onTheater && <button className="ghost" title={t('theater')} onClick={onTheater}><Icon name="expand" /></button>}
          <button className="ghost" title={t('reveal')} onClick={() => api.reveal(item.id)}><Icon name="folder" /></button>
          <button className="ghost" title={t('forget')} onClick={() => api.forget(item.id)}><Icon name="x" /></button>
        </div>
      </header>
      {children}
      <footer className="card-foot">
        <span className={`status ${writing ? 'w' : 'r'}`}><i />{writing ? t('writing') : t('ready')}</span>
        <span>{fmtBytes(item.size)}</span>
        {job && <span className="job-chip"><Icon name={job.kind === 'tts' ? 'mic' : 'terminal'} size={12} />{job.kind === 'tts' ? 'edge-tts' : job.tool || t('script')}</span>}
        <span className="ago">{fmtElapsed(now - (item.readyAt || item.mtime))} {t('since')}</span>
      </footer>
    </motion.article>
  );
}

export function MetaChips({ meta, extra = [] }) {
  if (!meta) return null;
  const v = meta.video, a = meta.audio;
  const chips = [
    meta.duration && ['clock', fmtDur(meta.duration) + (meta.approx ? ` ${t('approx')}` : '')],
    v?.width && ['frames', `${v.width}×${v.height}`],
    v?.fps && ['film', `${v.fps} ${t('fps')}`],
    v?.codec && ['cpu', v.codec],
    a && ['wave', [a.codec, a.sampleRate && `${(a.sampleRate / 1000).toFixed(a.sampleRate % 1000 ? 1 : 0)} kHz`, a.channels && (a.channels === 1 ? t('mono') : a.channels === 2 ? t('stereo') : `${a.channels}ch`)].filter(Boolean).join(' · ')],
    meta.bitrate && ['bolt', fmtBitrate(meta.bitrate)],
    ...extra,
  ].filter(Boolean);
  return <div className="chips">{chips.map(([i, s], k) => <span className="chip" key={k}><Icon name={i} size={12} />{s}</span>)}</div>;
}
