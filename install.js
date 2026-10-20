#!/usr/bin/env node
// Eyes on Media — instalador de la extensión para Eyes on Claude.
//   npx -y github:dfadify-web/eyes-on-media              install (or update)
//   npx -y github:dfadify-web/eyes-on-media --uninstall  remove it
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const EXT_DIR = path.join(CLAUDE_DIR, 'eyes-on-claude', 'extensions', 'eyes-on-media');
const PORT = Number(process.env.EOM_PORT) || 7778;
const EYES_PORT = Number(process.env.EYES_PORT) || 7777;
const KEEP = ['dist', 'server', 'eoc-extension.json', 'package.json', 'install.js', 'LICENSE', 'README.md'];

const uninstall = process.argv.includes('--uninstall');
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => { console.error(`\x1b[31m✗\x1b[0m ${m}`); process.exit(1); };
if (Number(process.versions.node.split('.')[0]) < 18) fail(`Node 18+ required (you have ${process.versions.node}).`);

const post = (port, route) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port, path: route, method: 'POST', timeout: 1500 }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', () => resolve(0)); req.on('timeout', () => { req.destroy(); resolve(0); });
  req.end();
});

(async () => {
  await post(PORT, '/shutdown');
  if (uninstall) {
    fs.rmSync(EXT_DIR, { recursive: true, force: true });
    ok(`Removed ${EXT_DIR}`);
    return;
  }
  if (!fs.existsSync(path.join(__dirname, 'dist', 'index.html'))) fail('dist/ is missing: run `npm run build` first.');
  if (path.resolve(__dirname) !== path.resolve(EXT_DIR)) {
    fs.rmSync(EXT_DIR, { recursive: true, force: true });
    fs.mkdirSync(EXT_DIR, { recursive: true });
    for (const f of KEEP) if (fs.existsSync(path.join(__dirname, f))) fs.cpSync(path.join(__dirname, f), path.join(EXT_DIR, f), { recursive: true });
  }
  ok(`Extension installed in ${EXT_DIR}`);
  // Si Eyes on Claude está en marcha, que la arranque ya
  const started = await post(EYES_PORT, '/extensions/eyes-on-media/start');
  if (started === 200) ok(`Running: open Eyes on Claude → Extensions → Eyes on Media (http://localhost:${EYES_PORT}/#ext/eyes-on-media)`);
  else console.log(`\n🎬 Eyes on Media is ready. It shows up in Eyes on Claude (v2.3+) under the Extensions tab.\n   Standalone: node "${path.join(EXT_DIR, 'server', 'server.js')}" → http://localhost:${PORT}\n`);
})();
