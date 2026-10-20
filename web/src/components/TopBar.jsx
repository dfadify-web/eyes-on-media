import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Icon from './Icon';
import { t } from '../lib/i18n';
import { api } from '../lib/store';
import { fmtBytes, shortPath } from '../lib/format';

export function Logo({ live }) {
  return (
    <svg className={`logo ${live ? 'live' : ''}`} viewBox="0 0 40 40" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent-2)" /><stop offset="1" stopColor="var(--accent)" /></linearGradient></defs>
      <rect x="2" y="6" width="36" height="28" rx="9" fill="url(#lg)" />
      {[10, 15, 20, 25, 30].map((x, i) => <rect key={x} className="lb" style={{ animationDelay: `${i * 0.12}s` }} x={x - 1.3} y="13" width="2.6" height="14" rx="1.3" fill="#0b0b10" />)}
    </svg>
  );
}

const FILTERS = [['all', 'all'], ['video', 'video'], ['audio', 'audio'], ['render', 'render']];

export default function TopBar({ s, filter, setFilter, view, setView, autoplay, setAutoplay, counts }) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState('');
  const [err, setErr] = useState(false);
  const writing = counts.writing > 0;
  const add = async (e) => {
    e.preventDefault();
    if (!dir.trim()) return;
    const r = await api.addRoot(dir.trim()).catch(() => ({ ok: false }));
    setErr(!r.ok); if (r.ok) setDir('');
  };
  return (
    <header className="top">
      <div className="brand">
        <Logo live={writing} />
        <div><div className="brand-name">Eyes on Media</div><div className="brand-sub">{s.version ? `v${s.version}` : ''} · extension</div></div>
      </div>
      <span className={`pill ${s.connected ? 'ok' : 'bad'}`}><i />{s.connected ? t('live') : t('offline')}</span>
      <span className={`pill eyes ${s.eyes.connected ? 'ok' : 'warn'}`} title={s.eyes.connected ? t('eyesOn') : t('eyesOff')}><Icon name="eye" size={13} />Eyes</span>
      <div className="grow" />
      <div className="seg">
        {FILTERS.map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {filter === k && <motion.span layoutId="seg-hl" className="seg-hl" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="seg-l">{t(l)}<em>{counts[k]}</em></span>
          </button>
        ))}
      </div>
      <div className="seg small">
        {[['wall', 'grid'], ['list', 'list']].map(([k, i]) => (
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)} title={t(k)}>
            {view === k && <motion.span layoutId="view-hl" className="seg-hl" />}<span className="seg-l"><Icon name={i} size={14} /></span>
          </button>
        ))}
      </div>
      <button className={`btn ${autoplay ? 'on' : ''}`} onClick={() => setAutoplay(!autoplay)}><Icon name="loop" size={14} />{t('autoplay')}</button>
      <div className="pop-wrap">
        <button className={`btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)}><Icon name="folder" size={14} />{t('folders')}<em>{s.roots.length}</em></button>
        <AnimatePresence>
          {open && (
            <motion.div className="pop" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}>
              <form onSubmit={add} className={`pop-add ${err ? 'err' : ''}`}>
                <input value={dir} onChange={(e) => { setDir(e.target.value); setErr(false); }} placeholder={t('folderPh')} spellCheck="false" />
                <button className="btn on" type="submit"><Icon name="plus" size={13} />{t('add')}</button>
              </form>
              <ul className="roots">
                {s.roots.map((r) => (
                  <li key={r.dir}>
                    <span className={`src src-${r.source}`}>{t(r.source === 'claude' ? 'srcClaude' : r.source === 'temp' ? 'srcTemp' : 'srcFolder')}</span>
                    <span className="root-dir" title={r.dir}>{shortPath(r.dir, s.home)}{r.recursive ? '' : ' (1)'}</span>
                    {r.source === 'folder' && <button className="ghost" onClick={() => api.removeRoot(r.dir)}><Icon name="trash" size={13} /></button>}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

export function Stats({ counts, jobsActive, bytes }) {
  const cells = [[counts.all, t('sItems')], [counts.video, t('sVideo')], [counts.audio, t('sAudio')], [counts.writing, t('sWriting'), counts.writing ? 'hot' : ''], [jobsActive, t('sJobs'), jobsActive ? 'hot' : ''], [fmtBytes(bytes), t('sBytes')]];
  return (
    <div className="stats">
      {cells.map(([v, l, c], i) => (
        <div key={i} className={`stat ${c || ''}`}>
          <motion.b key={String(v)} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{v}</motion.b><span>{l}</span>
        </div>
      ))}
    </div>
  );
}
