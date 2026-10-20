import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import TopBar, { Stats, Logo } from './components/TopBar';
import JobRail from './components/JobRail';
import Theater from './components/Theater';
import VideoCard from './components/cards/VideoCard';
import AudioCard from './components/cards/AudioCard';
import { FramesCard, SegmentsCard } from './components/cards/RenderCards';
import { useMedia } from './lib/store';
import { t } from './lib/i18n';

const pref = { get: (k, d) => { try { return localStorage.getItem('eom.' + k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('eom.' + k, v); } catch {} } };
const usePref = (k, d) => { const [v, setV] = useState(() => pref.get(k, d)); return [v, (x) => { pref.set(k, x); setV(x); }]; };

function Empty() {
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="empty-art">
        <Logo live />
        <div className="empty-bars">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 12) * 0.09}s`, '--h': `${20 + Math.abs(Math.sin(i * 0.7)) * 70}%` }} />)}</div>
      </div>
      <h2>{t('emptyTitle')}</h2>
      <p>{t('emptyText')}</p>
      <p className="muted small">{t('emptyHint')}</p>
    </motion.div>
  );
}

export default function App() {
  const s = useMedia();
  const [filter, setFilter] = usePref('filter', 'all');
  const [view, setView] = usePref('view', 'wall');
  const [autoplay, setAuto] = usePref('autoplay', '0');
  const [theater, setTheater] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => { // tema que manda Eyes on Claude (iframe) o ?theme=
    const apply = (th) => (document.documentElement.dataset.theme = th === 'light' ? 'light' : 'dark');
    apply(new URLSearchParams(location.search).get('theme') || pref.get('theme', 'dark'));
    const on = (e) => { if (e.data?.type === 'eoc:theme') { apply(e.data.theme); pref.set('theme', e.data.theme); } };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, []);

  const all = [...s.items.values()];
  const counts = {
    all: all.length, video: all.filter((i) => i.kind === 'video').length, audio: all.filter((i) => i.kind === 'audio').length,
    render: all.filter((i) => i.kind === 'frames' || i.kind === 'segments' || (i.kind === 'video' && i.status === 'writing')).length,
    writing: all.filter((i) => i.status === 'writing').length,
  };
  const list = useMemo(() => all
    .filter((i) => filter === 'all' || (filter === 'render' ? i.kind === 'frames' || i.kind === 'segments' || (i.kind === 'video' && i.status === 'writing') : i.kind === filter))
    .sort((a, b) => (b.status === 'writing') - (a.status === 'writing') || (b.readyAt || b.mtime) - (a.readyAt || a.mtime)), [s.items, filter]);
  const jobsActive = [...s.jobs.values()].filter((j) => j.status === 'running').length;
  const bytes = all.reduce((a, i) => a + (i.size || 0), 0);

  const jump = (id) => {
    document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(id); setTimeout(() => setFlash(null), 1400);
  };
  useEffect(() => { // destello al aparecer un medio nuevo
    const f = s.fresh[s.fresh.length - 1];
    if (f && Date.now() - f.ts < 1000) { setFlash(f.id); const x = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(x); }
  }, [s.fresh]);

  useEffect(() => {
    document.title = counts.writing ? `(${counts.writing}) Eyes on Media` : 'Eyes on Media';
  }, [counts.writing]);

  const th = theater && s.items.get(theater);
  return (
    <div className="app">
      <div className="bg-glow" aria-hidden="true" />
      <TopBar s={s} filter={filter} setFilter={setFilter} view={view} setView={setView} autoplay={autoplay === '1'} setAutoplay={(v) => setAuto(v ? '1' : '0')} counts={counts} />
      <Stats counts={counts} jobsActive={jobsActive} bytes={bytes} />
      <div className="layout">
        <JobRail jobs={s.jobs} items={s.items} onJump={jump} />
        <main className={`wall v-${view}`}>
          {!list.length ? <Empty /> : (
            <AnimatePresence mode="popLayout">
              {list.map((it) => {
                const props = { key: it.id, item: it, home: s.home, flash: flash === it.id, job: it.job ? s.jobs.get(it.job) : null, onTheater: () => setTheater(it.id) };
                if (it.kind === 'video') return <VideoCard {...props} autoplay={autoplay === '1'} />;
                if (it.kind === 'audio') return <AudioCard {...props} />;
                if (it.kind === 'frames') return <FramesCard {...props} />;
                return <SegmentsCard {...props} />;
              })}
            </AnimatePresence>
          )}
        </main>
      </div>
      <AnimatePresence>{th && <Theater key={th.id} item={th} job={th.job ? s.jobs.get(th.job) : null} home={s.home} onClose={() => setTheater(null)} />}</AnimatePresence>
    </div>
  );
}
