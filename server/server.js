#!/usr/bin/env node
// Eyes on Media — extensión de Eyes on Claude.
// Vigila en vivo los vídeos y audios que se están escribiendo en disco (carpetas de las sesiones de Claude,
// carpetas que añadas y la carpeta temporal donde renderizan Remotion/turbo-render) y lee del stream de
// Eyes on Claude los comandos reales (edge-tts, ffmpeg, render…) que los producen. Nada se inventa.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { probe } = require('./probe');
const { detectJob, mediaPaths, effectiveCwd } = require('./commands');

const PORT = Number(process.env.EOM_PORT) || 7778;
const EYES_PORT = Number(process.env.EYES_PORT) || 7777;
const VERSION = require('../package.json').version;
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const CONFIG = path.join(CLAUDE_DIR, 'eyes-on-claude', 'eyes-on-media.json');
const DIST = path.join(__dirname, '..', 'dist');
const IS_WIN = process.platform === 'win32';

const VIDEO = new Set(['mp4', 'webm', 'mov', 'mkv', 'm4v']);
const AUDIO = new Set(['mp3', 'wav', 'm4a', 'ogg', 'opus', 'flac', 'aac']);
const SUBS = new Set(['vtt', 'srt']);
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'webp']);
const IGNORE = /(^|[\\/])(node_modules|\.git|\.next|\.venv|venv|env|site-packages|__pycache__|\.cache|AppData|Library|\.npm|\.cargo|\.rustup|\.gradle|\.vscode|\.idea|OneDrive)([\\/]|$)/i;
const MAX_ITEMS = 300;
const SETTLE_MS = 2200;
const RECENT_MS = 12 * 60 * 60 * 1000;
const EYES_GONE_EXIT_MS = 30 * 60 * 1000;

const clients = new Set();
const items = new Map(); // id -> item
const byPath = new Map(); // clave de ruta -> id
const jobs = new Map(); // toolUseId -> job
const roots = new Map(); // dir -> { dir, source, recursive, watcher }
const frameDirs = new Map(); // dir -> { names: Set, times: [] }
const live = new Map(); // id -> { timer, last } (sondeo mientras se escribe)
const sessionCwd = new Map();
let nextId = 1;
let eyes = { connected: false, since: Date.now() };

const key = (p) => (IS_WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
const extOf = (p) => path.extname(p).slice(1).toLowerCase();
const stem = (p) => key(p).replace(/\.[^.\\/]+$/, '');

// ---------- emisión ----------
function send(msg) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(data);
}
const pending = new Map();
function emitItem(it, now = false) {
  if (now) { clearTimeout(pending.get(it.id)); pending.delete(it.id); send({ type: 'item', item: it }); return; }
  if (pending.has(it.id)) return;
  pending.set(it.id, setTimeout(() => { pending.delete(it.id); if (items.has(it.id)) send({ type: 'item', item: it }); }, 250));
}
const emitJob = (j) => send({ type: 'job', job: j });
const rootList = () => [...roots.values()].map((r) => ({ dir: r.dir, source: r.source, recursive: r.recursive }));

// ---------- registro de medios ----------
function sourceOf(file) {
  const k = key(file);
  if (k.startsWith(key(os.tmpdir()) + path.sep)) return 'temp';
  for (const j of jobs.values()) if (j.outputs?.some((o) => key(o) === k)) return 'claude';
  for (const r of roots.values()) if (k.startsWith(key(r.dir) + path.sep)) return r.source;
  return 'folder';
}

function linkJob(it) {
  const k = key(it.path);
  for (const j of jobs.values()) {
    const hit = j.outputs?.some((o) => key(o) === k) || (j.tts?.subs && stem(j.tts.subs) === stem(it.path));
    if (!hit) continue;
    it.job = j.id; it.session = j.session;
    if (j.kind === 'tts') it.tts = { voice: j.tts.voice, text: j.tts.text, rate: j.tts.rate, pitch: j.tts.pitch, volume: j.tts.volume };
    if (!j.items.includes(it.id)) { j.items.push(it.id); emitJob(j); }
  }
}

function attachSubs(it) {
  if (it.kind !== 'audio' && it.kind !== 'video') return;
  for (const x of ['srt', 'vtt']) {
    const f = stem(it.path) + '.' + x;
    try {
      const st = fs.statSync(f);
      if (st.size > 512 * 1024) continue;
      if (it.subs && it.subs.mtime === st.mtimeMs) return;
      it.subs = { path: f, mtime: st.mtimeMs, text: fs.readFileSync(f, 'utf8') };
      return;
    } catch {}
  }
}

function dropOldest() {
  const ready = [...items.values()].filter((i) => i.status !== 'writing').sort((a, b) => a.mtime - b.mtime);
  while (items.size >= MAX_ITEMS && ready.length) removeItem(ready.shift());
}
function removeItem(it) {
  items.delete(it.id); byPath.delete(key(it.path));
  const l = live.get(it.id); if (l) { clearInterval(l.timer); live.delete(it.id); }
  send({ type: 'remove', id: it.id });
}

function createItem(file, kind, st, extra = {}) {
  dropOldest();
  const it = { id: nextId++, kind, path: path.resolve(file), name: path.basename(file), dir: path.dirname(path.resolve(file)), ext: extOf(file),
    size: st.size, mtime: st.mtimeMs, born: Date.now(), status: 'ready', history: [], meta: null, source: sourceOf(file), ...extra };
  items.set(it.id, it); byPath.set(key(file), it.id);
  linkJob(it); attachSubs(it);
  return it;
}

// Mientras un archivo crece se sondea su tamaño real (fs.watch no siempre avisa de cada escritura)
function watchGrowth(it) {
  if (live.has(it.id)) { live.get(it.id).last = Date.now(); return; }
  const l = { last: Date.now() };
  l.timer = setInterval(() => {
    let st;
    try { st = fs.statSync(it.path); } catch { clearInterval(l.timer); live.delete(it.id); return gone(it.path); }
    if (st.size !== it.size || st.mtimeMs !== it.mtime) {
      it.size = st.size; it.mtime = st.mtimeMs; l.last = Date.now();
      it.history.push([Date.now(), st.size]); if (it.history.length > 240) it.history.splice(0, it.history.length - 240);
      if (it.kind === 'audio' && it.ext === 'wav') it.meta = probe(it.path);
      emitItem(it);
    } else if (Date.now() - l.last > SETTLE_MS) {
      clearInterval(l.timer); live.delete(it.id);
      it.status = 'ready'; it.readyAt = Date.now(); it.meta = probe(it.path); attachSubs(it);
      emitItem(it, true);
    }
  }, 300);
  live.set(it.id, l);
}

function gone(file) {
  const id = byPath.get(key(file));
  const it = id && items.get(id);
  if (it) removeItem(it);
}

// turbo-render escribe trozos seg_00000.mp4 en paralelo en %TEMP%/turbo-*: se agrupan en una sola tarjeta
function segment(file, st) {
  const dir = path.dirname(path.resolve(file));
  const gk = key(dir) + '|segments';
  let it = items.get(byPath.get(gk));
  if (!it) {
    dropOldest();
    it = { id: nextId++, kind: 'segments', path: dir, name: path.basename(dir), dir, ext: 'mp4', size: 0, mtime: st.mtimeMs, born: Date.now(),
      status: 'writing', history: [], segments: [], source: 'temp' };
    items.set(it.id, it); byPath.set(gk, it.id);
  }
  const name = path.basename(file);
  let s = it.segments.find((x) => x.name === name);
  if (!s) { s = { name, size: 0, mtime: 0, status: 'writing' }; it.segments.push(s); it.segments.sort((a, b) => a.name.localeCompare(b.name)); }
  s.size = st.size; s.mtime = st.mtimeMs; s.status = 'writing';
  it.size = it.segments.reduce((a, x) => a + x.size, 0); it.mtime = st.mtimeMs; it.status = 'writing';
  it.history.push([Date.now(), it.size]); if (it.history.length > 240) it.history.splice(0, it.history.length - 240);
  clearTimeout(s.t);
  Object.defineProperty(s, 't', { value: setTimeout(() => {
    s.status = 'ready'; s.meta = probe(path.join(dir, name));
    if (it.segments.every((x) => x.status === 'ready')) { it.status = 'ready'; it.readyAt = Date.now(); }
    emitItem(it, true);
  }, SETTLE_MS), writable: true, enumerable: false, configurable: true });
  emitItem(it);
}

// Secuencias de fotogramas (frame_0001.png…) escritas por un render: tarjeta con el último fotograma real
function frame(file, st) {
  const dir = path.dirname(path.resolve(file)), name = path.basename(file);
  if (!/\d{3,}\.(png|jpe?g|webp)$/i.test(name)) return;
  const gk = key(dir) + '|frames';
  let f = frameDirs.get(gk);
  if (!f) frameDirs.set(gk, (f = { names: new Set(), times: [] }));
  if (f.names.has(name) && !items.has(byPath.get(gk))) return;
  f.names.add(name); f.times.push(Date.now()); if (f.times.length > 60) f.times.shift();
  let it = items.get(byPath.get(gk));
  if (!it) {
    if (f.names.size < 4) return;
    dropOldest();
    it = { id: nextId++, kind: 'frames', path: dir, name: path.basename(dir), dir, ext: extOf(name), size: 0, mtime: st.mtimeMs, born: Date.now(),
      status: 'writing', history: [], frames: 0, latest: null, recent: [], source: sourceOf(file) };
    items.set(it.id, it); byPath.set(gk, it.id);
  }
  it.frames = f.names.size; it.latest = path.resolve(file); it.mtime = st.mtimeMs; it.size += st.size; it.status = 'writing';
  it.recent = [...it.recent.filter((x) => x !== name), name].slice(-8);
  const w = f.times.filter((t) => Date.now() - t < 3000);
  it.rate = w.length > 1 ? Math.round(((w.length - 1) / ((w[w.length - 1] - w[0]) / 1000 || 1)) * 10) / 10 : 0;
  it.history.push([Date.now(), it.frames]); if (it.history.length > 240) it.history.splice(0, it.history.length - 240);
  clearTimeout(f.t);
  f.t = setTimeout(() => { it.status = 'ready'; it.rate = 0; it.readyAt = Date.now(); emitItem(it, true); }, 3000);
  emitItem(it);
}

function touch(file, opts = {}) {
  const x = extOf(file);
  const isMedia = VIDEO.has(x) || AUDIO.has(x);
  if (!isMedia && !SUBS.has(x) && !IMAGE.has(x)) return;
  let st;
  try { st = fs.statSync(file); } catch { return gone(file); }
  if (!st.isFile()) return;
  if (SUBS.has(x)) {
    for (const it of items.values()) if (stem(it.path) === stem(file)) { attachSubs(it); emitItem(it); }
    return;
  }
  const src = sourceOf(file);
  if (IMAGE.has(x)) { if (!opts.scan) frame(file, st); return; }
  if (src === 'temp' && /^seg_\d+\.(mp4|h264|webm)$/i.test(path.basename(file))) return segment(file, st);
  if (st.size === 0 && opts.scan) return;
  let it = items.get(byPath.get(key(file)));
  const fresh = Date.now() - st.mtimeMs < SETTLE_MS;
  if (!it) {
    if (opts.scan && Date.now() - st.mtimeMs > (src === 'temp' ? 30 * 60 * 1000 : RECENT_MS)) return;
    it = createItem(file, VIDEO.has(x) ? 'video' : 'audio', st);
    if (fresh && !opts.scan) { it.status = 'writing'; it.history.push([Date.now(), st.size]); watchGrowth(it); emitItem(it, true); }
    else { it.meta = probe(file); it.readyAt = st.mtimeMs; emitItem(it, true); }
    return;
  }
  if (st.size !== it.size || st.mtimeMs !== it.mtime) {
    it.size = st.size; it.mtime = st.mtimeMs; it.status = 'writing'; it.readyAt = null;
    it.history.push([Date.now(), st.size]);
    watchGrowth(it); emitItem(it);
  }
}

// ---------- carpetas vigiladas ----------
function covered(dir, recursive) {
  const k = key(dir);
  for (const r of roots.values()) {
    const rk = key(r.dir);
    if (rk === k && (r.recursive || !recursive)) return true;
    if (r.recursive && k.startsWith(rk + path.sep) && !IGNORE.test(k.slice(rk.length))) return true;
  }
  return false;
}

function addRoot(dir, source, recursive = true, opts = {}) {
  dir = path.resolve(dir);
  try { if (!fs.statSync(dir).isDirectory()) return false; } catch { return false; }
  if (path.parse(dir).root === dir) recursive = false; // nunca un disco entero
  if (covered(dir, recursive)) return false;
  let watcher;
  try {
    watcher = fs.watch(dir, { recursive, persistent: true }, (_ev, name) => {
      if (!name) return;
      const rel = String(name);
      if (IGNORE.test(rel)) return;
      touch(path.join(dir, rel));
    });
    watcher.on('error', () => {});
  } catch { return false; }
  roots.set(key(dir), { dir, source, recursive, watcher });
  send({ type: 'roots', roots: rootList() });
  if (!opts.noScan) scan(dir, recursive ? (source === 'temp' ? 2 : 4) : 0);
  return true;
}

function removeRoot(dir) {
  const r = roots.get(key(dir));
  if (!r) return false;
  try { r.watcher.close(); } catch {}
  roots.delete(key(dir));
  send({ type: 'roots', roots: rootList() });
  return true;
}

// Busca medios recientes al empezar a vigilar una carpeta (con límites para no recorrer media vida)
async function scan(dir, depth) {
  let budget = 6000;
  const walk = async (d, left) => {
    let ents;
    try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (--budget < 0) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (left > 0 && !e.name.startsWith('.') && !IGNORE.test(e.name)) await walk(full, left - 1); }
      else if (e.isFile()) touch(full, { scan: true });
    }
  };
  await walk(dir, depth);
}

function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return { folders: [] }; } }
function saveConfig(c) { try { fs.mkdirSync(path.dirname(CONFIG), { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); } catch {} }

// ---------- puente con Eyes on Claude (comandos reales de Claude) ----------
function onEyes(ev, replay) {
  if (ev.kind === '__history__') { for (const e of ev.events) onEyes(e, true); return; }
  if (ev.kind === 'lane' && ev.cwd && ev.lane === 'main') {
    sessionCwd.set(ev.session, ev.cwd);
    addRoot(ev.cwd, 'claude', true);
    return;
  }
  if (ev.kind === 'tool_use') {
    const i = ev.input || {};
    const cwd = sessionCwd.get(ev.session);
    if (/^(Write|Edit|MultiEdit)$/.test(ev.name) && i.file_path) {
      const fp = path.resolve(cwd || os.homedir(), i.file_path);
      if (VIDEO.has(extOf(fp)) || AUDIO.has(extOf(fp)) || SUBS.has(extOf(fp))) { addRoot(path.dirname(fp), 'claude', false); setTimeout(() => touch(fp), 400); }
      return;
    }
    if (!/^(Bash|PowerShell)$/.test(ev.name) || !i.command) return;
    const cmd = String(i.command);
    const dir = effectiveCwd(cmd, cwd);
    for (const p of mediaPaths(cmd, dir)) addRoot(path.dirname(p), 'claude', false);
    const det = detectJob(cmd, cwd);
    if (!det) return;
    if (replay && Date.now() - ev.ts > RECENT_MS) return;
    const j = { id: ev.toolUseId, session: ev.session, lane: ev.lane, ts: ev.ts, command: cmd.slice(0, 4000), description: i.description,
      background: !!i.run_in_background, status: 'running', items: [], ...det };
    jobs.set(j.id, j);
    if (jobs.size > 200) jobs.delete(jobs.keys().next().value);
    for (const it of items.values()) { const before = it.job; linkJob(it); if (it.job !== before) emitItem(it); }
    emitJob(j);
    for (const p of j.outputs) setTimeout(() => touch(p), 300);
    return;
  }
  if (ev.kind === 'tool_result') {
    const j = jobs.get(ev.toolUseId);
    if (!j) return;
    const txt = String(ev.stdout ?? ev.text ?? '');
    j.end = ev.ts;
    j.status = ev.isError ? 'error' : /running in background|Command running in background|background with ID/i.test(txt) ? 'background' : 'done';
    j.output = (txt + (ev.stderr ? '\n' + ev.stderr : '')).slice(-1500);
    emitJob(j);
    for (const p of j.outputs) touch(p);
  }
}

function connectEyes() {
  const retry = () => {
    if (eyes.connected) { eyes = { connected: false, since: Date.now() }; send({ type: 'eyes', eyes }); }
    setTimeout(connectEyes, 3000);
  };
  const req = http.get({ host: '127.0.0.1', port: EYES_PORT, path: '/events' }, (res) => {
    if (res.statusCode !== 200) { res.resume(); return retry(); }
    eyes = { connected: true, since: Date.now() }; send({ type: 'eyes', eyes });
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try { onEyes(JSON.parse(line.slice(6))); } catch {}
        }
      }
    });
    res.on('end', retry); res.on('error', () => {});
  });
  req.on('error', retry);
}

// ---------- HTTP ----------
const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', mp3: 'audio/mpeg',
  wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json',
  woff2: 'font/woff2', ico: 'image/x-icon' };

function serveFile(req, res, file, cache = 'no-store') {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    const type = MIME[extOf(file)] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range && st.size) {
      let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
      start = Math.max(0, start); end = Math.min(st.size - 1, end);
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': cache });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => resolve(b)); });
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

function reveal(file) {
  const [cmd, args] = IS_WIN ? ['explorer.exe', [`/select,${file}`]] : process.platform === 'darwin' ? ['open', ['-R', file]] : ['xdg-open', [path.dirname(file)]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  let m;

  if (p === '/status') return json(res, 200, { ok: true, app: 'eyes-on-media', version: VERSION, clients: clients.size, items: items.size, jobs: jobs.size, roots: roots.size, eyes: eyes.connected });
  if (p === '/shutdown' && req.method === 'POST') { res.writeHead(204).end(); setTimeout(() => process.exit(0), 50); return; }
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'hello', version: VERSION, items: [...items.values()], jobs: [...jobs.values()], roots: rootList(), eyes, tmp: os.tmpdir(), home: os.homedir() })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  // Archivo real de un medio registrado (con Range para poder saltar en el vídeo)
  if ((m = /^\/file\/(\d+)(?:\/(.+))?$/.exec(p))) {
    const it = items.get(Number(m[1]));
    if (!it) { res.writeHead(404).end(); return; }
    if (it.kind === 'frames') {
      const name = m[2] ? decodeURIComponent(m[2]) : path.basename(it.latest || '');
      if (!it.recent.includes(name) && name !== path.basename(it.latest || '')) { res.writeHead(404).end(); return; }
      return serveFile(req, res, path.join(it.dir, name));
    }
    if (it.kind === 'segments') {
      const name = m[2] ? decodeURIComponent(m[2]) : '';
      if (!it.segments.some((s) => s.name === name)) { res.writeHead(404).end(); return; }
      return serveFile(req, res, path.join(it.dir, name));
    }
    return serveFile(req, res, it.path);
  }
  if (p === '/api/reveal' && req.method === 'POST') {
    try { const { id } = JSON.parse(await readBody(req)); const it = items.get(Number(id)); if (!it) return json(res, 404, { ok: false }); reveal(it.kind === 'video' || it.kind === 'audio' ? it.path : it.latest || it.dir); return json(res, 200, { ok: true }); } catch { return json(res, 400, { ok: false }); }
  }
  if (p === '/api/roots' && req.method === 'POST') {
    try {
      const { dir } = JSON.parse(await readBody(req));
      const full = path.resolve(String(dir || '').replace(/^~/, os.homedir()));
      if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) return json(res, 400, { ok: false, error: 'not-a-folder' });
      addRoot(full, 'folder', true);
      const c = loadConfig(); if (!c.folders.includes(full)) { c.folders.push(full); saveConfig(c); }
      return json(res, 200, { ok: true, roots: rootList() });
    } catch { return json(res, 400, { ok: false }); }
  }
  if (p === '/api/roots' && req.method === 'DELETE') {
    const dir = url.searchParams.get('dir') || '';
    removeRoot(dir);
    const c = loadConfig(); c.folders = c.folders.filter((f) => key(f) !== key(dir)); saveConfig(c);
    return json(res, 200, { ok: true, roots: rootList() });
  }
  if (p === '/api/forget' && req.method === 'POST') {
    try { const { id } = JSON.parse(await readBody(req)); const it = items.get(Number(id)); if (it) removeItem(it); return json(res, 200, { ok: true }); } catch { return json(res, 400, { ok: false }); }
  }
  // Interfaz (build de Vite)
  const rel = p === '/' ? 'index.html' : decodeURIComponent(p.slice(1));
  const target = path.resolve(DIST, rel);
  if (!target.startsWith(DIST + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return serveFile(req, res, target, rel.startsWith('assets/') ? 'max-age=31536000, immutable' : 'no-store');
  return serveFile(req, res, path.join(DIST, 'index.html'));
});

server.on('error', (e) => { if (e.code === 'EADDRINUSE') process.exit(0); throw e; });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Eyes on Media en http://localhost:${PORT}`);
  addRoot(os.tmpdir(), 'temp', true);
  for (const f of loadConfig().folders || []) addRoot(f, 'folder', true);
  for (const f of (process.env.EOM_DIRS || '').split(path.delimiter).filter(Boolean)) addRoot(f, 'folder', true);
  connectEyes();
});

// Se apaga sola si Eyes on Claude lleva mucho tiempo caído y nadie la está mirando
setInterval(() => {
  if (process.env.EOM_KEEP_ALIVE === '1') return;
  if (!eyes.connected && clients.size === 0 && Date.now() - eyes.since > EYES_GONE_EXIT_MS) process.exit(0);
}, 60000).unref();
