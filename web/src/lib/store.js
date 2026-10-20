import { useEffect, useReducer, useState } from 'react';

const init = { connected: false, version: '', items: new Map(), jobs: new Map(), roots: [], eyes: { connected: false }, home: '', tmp: '', fresh: [] };

function reducer(s, m) {
  switch (m.type) {
    case 'hello':
      return { ...s, connected: true, version: m.version, items: new Map(m.items.map((i) => [i.id, i])), jobs: new Map(m.jobs.map((j) => [j.id, j])), roots: m.roots, eyes: m.eyes, home: m.home, tmp: m.tmp };
    case 'item': {
      const items = new Map(s.items);
      const isNew = !items.has(m.item.id);
      items.set(m.item.id, m.item);
      return { ...s, items, fresh: isNew ? [...s.fresh.slice(-4), { id: m.item.id, ts: Date.now() }] : s.fresh };
    }
    case 'remove': { const items = new Map(s.items); items.delete(m.id); return { ...s, items }; }
    case 'job': { const jobs = new Map(s.jobs); jobs.set(m.job.id, m.job); return { ...s, jobs }; }
    case 'roots': return { ...s, roots: m.roots };
    case 'eyes': return { ...s, eyes: m.eyes };
    case '__down': return { ...s, connected: false };
    default: return s;
  }
}

export function useMedia() {
  const [state, dispatch] = useReducer(reducer, init);
  useEffect(() => {
    let es, stop = false;
    const open = () => {
      es = new EventSource('/api/events');
      es.onmessage = (e) => dispatch(JSON.parse(e.data));
      es.onerror = () => { dispatch({ type: '__down' }); es.close(); if (!stop) setTimeout(open, 2000); };
    };
    open();
    return () => { stop = true; es?.close(); };
  }, []);
  return state;
}

// Reloj compartido para contadores en vivo
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export const api = {
  reveal: (id) => fetch('/api/reveal', { method: 'POST', body: JSON.stringify({ id }) }),
  forget: (id) => fetch('/api/forget', { method: 'POST', body: JSON.stringify({ id }) }),
  addRoot: (dir) => fetch('/api/roots', { method: 'POST', body: JSON.stringify({ dir }) }).then((r) => r.json()),
  removeRoot: (dir) => fetch(`/api/roots?dir=${encodeURIComponent(dir)}`, { method: 'DELETE' }),
};

// URL del archivo real; cambia con cada escritura para no quedarse con una versión vieja en caché
export const fileUrl = (it, name) => `/file/${it.id}${name ? '/' + encodeURIComponent(name) : ''}?v=${Math.round(it.mtime)}-${it.size}`;
