// Smoke test: parsers reales + servidor sirviendo un audio que se escribe en una carpeta vigilada.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { detectJob, tokenize } = require('../server/commands');
const { probe } = require('../server/probe');

// comandos
assert.deepStrictEqual(tokenize(`edge-tts --text "hola mundo" -v 'es-ES-AlvaroNeural'`), ['edge-tts', '--text', 'hola mundo', '-v', 'es-ES-AlvaroNeural']);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eom-test-'));
let j = detectJob(`cd "${tmp}" && py -m edge_tts --voice en-US-AndrewNeural --text "Hi there" --write-media voz.mp3 --write-subtitles voz.srt`, os.homedir());
assert.strictEqual(j.kind, 'tts');
assert.strictEqual(j.tts.voice, 'en-US-AndrewNeural');
assert.strictEqual(j.tts.text, 'Hi there');
assert.strictEqual(j.tts.media, path.join(tmp, 'voz.mp3'));
j = detectJob('ffmpeg -i a.mp4 -c:v libx264 out/final.mp4', tmp);
assert.strictEqual(j.kind, 'render');
assert.ok(j.outputs.includes(path.join(tmp, 'out', 'final.mp4')));
assert.strictEqual(detectJob('git status', tmp), null);

// cabecera WAV real
const sr = 8000, n = sr; // 1 s
const wav = Buffer.alloc(44 + n * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i / 5) * 8000), 44 + i * 2);
const wavFile = path.join(tmp, 'tone.wav');
fs.writeFileSync(wavFile, wav);
const m = probe(wavFile);
assert.strictEqual(m.audio.sampleRate, sr);
assert.ok(Math.abs(m.duration - 1) < 0.01);

// servidor
const PORT = 7899;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], { env: { ...process.env, EOM_PORT: String(PORT), EYES_PORT: '7898', EOM_DIRS: tmp }, stdio: 'ignore' });
const get = (p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  try {
    for (let i = 0; i < 40; i++) { try { await get('/status'); break; } catch { await sleep(100); } }
    fs.copyFileSync(wavFile, path.join(tmp, 'live.wav'));
    let item;
    for (let i = 0; i < 40 && !item; i++) {
      await sleep(150);
      const r = await new Promise((res) => http.get({ host: '127.0.0.1', port: PORT, path: '/api/events' }, (resp) => {
        resp.once('data', (c) => { resp.destroy(); res(JSON.parse(String(c).replace(/^data: /, ''))); });
      }));
      item = r.items.find((x) => x.name === 'live.wav');
    }
    assert.ok(item, 'the new wav shows up');
    const f = await get(`/file/${item.id}`);
    assert.strictEqual(f.status, 200);
    assert.strictEqual(Buffer.byteLength(f.body, 'latin1') > 0, true);
    const home = await get('/');
    assert.ok(home.body.includes('Eyes on Media'));
    console.log('✓ smoke test passed');
  } catch (e) {
    console.error(e); process.exitCode = 1;
  } finally {
    srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
