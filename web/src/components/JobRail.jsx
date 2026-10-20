import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import Icon from './Icon';
import { t } from '../lib/i18n';
import { useNow } from '../lib/store';
import { fmtElapsed, fmtTime, voiceInfo } from '../lib/format';

const STATUS = { running: 'running', done: 'done', error: 'error', background: 'background' };

function JobCard({ job, items, onJump }) {
  const now = useNow(1000);
  const [open, setOpen] = useState(false);
  const run = job.status === 'running' || job.status === 'background';
  const v = job.tts ? voiceInfo(job.tts.voice) : null;
  const title = job.kind === 'tts' ? (v?.name ? `${v.name} · ${v.locale}` : 'edge-tts') : job.tool || (job.script ? job.script.split(/[\\/]/).pop() : t('renderJob'));
  return (
    <motion.div layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      className={`job k-${job.kind} s-${job.status}`} onClick={() => setOpen(!open)}>
      <div className="job-top">
        <span className="job-ico"><Icon name={job.kind === 'tts' ? 'mic' : 'film'} size={15} />{run && <i className="job-pulse" />}</span>
        <div className="job-id">
          <div className="job-title">{title}</div>
          <div className="job-sub">{job.kind === 'tts' ? t('tts') : t('renderJob')}{job.script ? ` · ${t('script')}` : ''} · {fmtTime(job.ts)}</div>
        </div>
        <span className={`pill s-${job.status}`}>{run && <i />}{t(STATUS[job.status])} · {fmtElapsed((job.end && job.status !== 'background' ? job.end : now) - job.ts)}</span>
      </div>
      {job.tts?.text && <div className="job-quote">“{job.tts.text}”</div>}
      {job.description && !job.tts?.text && <div className="job-quote">{job.description}</div>}
      {run && <div className="job-bar"><i /></div>}
      {open && <pre className="job-cmd">{job.command}{job.output ? `\n\n${job.output}` : ''}</pre>}
      {items.length > 0 && (
        <div className="job-items">{items.map((it) => (
          <button key={it.id} className="mini" onClick={(e) => { e.stopPropagation(); onJump(it.id); }}><Icon name={it.kind === 'audio' ? 'wave' : 'film'} size={11} />{it.name}</button>
        ))}</div>
      )}
    </motion.div>
  );
}

export default function JobRail({ jobs, items, onJump }) {
  const now = Date.now();
  const list = [...jobs.values()].filter((j) => j.status === 'running' || j.status === 'background' || now - (j.end || j.ts) < 15 * 60 * 1000)
    .sort((a, b) => (b.status === 'running') - (a.status === 'running') || b.ts - a.ts).slice(0, 12);
  return (
    <section className="rail">
      <div className="rail-head"><Icon name="bolt" size={13} />{t('jobs')}<span className="count">{list.filter((j) => j.status === 'running').length}</span></div>
      <div className="rail-list">
        <AnimatePresence initial={false}>
          {list.length ? list.map((j) => <JobCard key={j.id} job={j} items={j.items.map((id) => items.get(id)).filter(Boolean)} onJump={onJump} />)
            : <motion.div className="rail-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{t('noJobs')}</motion.div>}
        </AnimatePresence>
      </div>
    </section>
  );
}
