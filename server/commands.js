// Eyes on Media — lee los comandos reales que Claude lanza (Bash/PowerShell) para saber qué está generando.
const fs = require('fs');
const os = require('os');
const path = require('path');

const MEDIA_EXT = 'mp4|webm|mov|mkv|m4v|mp3|wav|m4a|ogg|opus|flac|aac|vtt|srt';
const MEDIA_RE = new RegExp(`(?:"([^"\\n]+?\\.(?:${MEDIA_EXT}))"|'([^'\\n]+?\\.(?:${MEDIA_EXT}))'|([^\\s"'|;&<>()=,]+\\.(?:${MEDIA_EXT})))(?![\\w.])`, 'gi');
const SCRIPT_RE = /(?:"([^"\n]+?\.(?:py|mjs|cjs|js|ts|sh|ps1))"|'([^'\n]+?\.(?:py|mjs|cjs|js|ts|sh|ps1))'|([^\s"'|;&<>()]+\.(?:py|mjs|cjs|js|ts|sh|ps1)))(?![\w.])/gi;
const TTS_RE = /\bedge[-_]tts\b/i;
const RENDER_RE = /\b(ffmpeg|remotion\s+(?:render|still)|turbo-render|render\.mjs|manim|melt|VideoEncoder|MediaRecorder|moviepy|blender\b[^\n|;&]*\s-b\b)/i;

// Tokenizador de línea de comandos con comillas (suficiente para leer argumentos de edge-tts)
function tokenize(s) {
  const out = [];
  let cur = '', q = null, has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && (s[i + 1] === '"' || s[i + 1] === '\\')) cur += s[++i];
      else cur += c;
    } else if (c === '"' || c === "'") { q = c; has = true; }
    else if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; }
    else if (c === '`' && s[i + 1] === '\n') i++;
    else cur += c;
  }
  if (cur || has) out.push(cur);
  return out;
}

const expand = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p.replace(/^\/([a-z])\//i, '$1:/'));
const resolve = (p, cwd) => path.resolve(cwd || os.homedir(), expand(p));

// "cd X && …" / "cd X; …" al principio del comando cambia el directorio de trabajo real
function effectiveCwd(cmd, cwd) {
  const m = /^\s*(?:cd|Set-Location|pushd)\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;|\n)/i.exec(cmd);
  return m ? resolve(m[1] || m[2] || m[3], cwd) : cwd;
}

function mediaPaths(cmd, cwd) {
  const out = new Set();
  for (const m of cmd.matchAll(MEDIA_RE)) {
    const p = m[1] || m[2] || m[3];
    if (/^https?:/i.test(p) || p.includes('*') || p.includes('$') || p.includes('%')) continue;
    out.add(resolve(p, cwd));
  }
  return [...out];
}

function parseEdgeTts(cmd, cwd) {
  const seg = cmd.slice(cmd.search(TTS_RE));
  const t = tokenize(seg.split(/\s(?:&&|\|\||;)\s/)[0]);
  const get = (...names) => { for (let i = 0; i < t.length; i++) { for (const n of names) { if (t[i] === n) return t[i + 1]; if (t[i].startsWith(n + '=')) return t[i].slice(n.length + 1); } } };
  const media = get('--write-media'), subs = get('--write-subtitles'), file = get('--file', '-f');
  let text = get('--text', '-t');
  if (!text && file && file !== '-') { try { text = fs.readFileSync(resolve(file, cwd), 'utf8').slice(0, 4000); } catch {} }
  return {
    voice: get('--voice', '-v') || 'en-US-EmmaMultilingualNeural', text, rate: get('--rate'), pitch: get('--pitch'), volume: get('--volume'),
    media: media && resolve(media, cwd), subs: subs && resolve(subs, cwd),
  };
}

// Si el comando ejecuta un script, se mira su código real para saber si sintetiza voz o renderiza vídeo
function scriptKind(cmd, cwd) {
  for (const m of cmd.matchAll(SCRIPT_RE)) {
    const file = resolve(m[1] || m[2] || m[3], cwd);
    let src;
    try { if (fs.statSync(file).size > 512 * 1024) continue; src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (TTS_RE.test(src)) return { kind: 'tts', script: file };
    if (RENDER_RE.test(src)) return { kind: 'render', script: file };
  }
  return null;
}

// Devuelve el trabajo (tts/render) que describe el comando, o null
function detectJob(cmd, cwd) {
  if (!cmd) return null;
  const dir = effectiveCwd(cmd, cwd);
  const outputs = mediaPaths(cmd, dir);
  if (/^\s*edge[-_]tts\b|[\s;&|]edge[-_]tts(\.exe)?\s+--?\w/i.test(cmd) || /-m\s+edge_tts\b/.test(cmd)) {
    const tts = parseEdgeTts(cmd, dir);
    if (tts.media && !outputs.includes(tts.media)) outputs.push(tts.media);
    return { kind: 'tts', cwd: dir, outputs, tts };
  }
  if (RENDER_RE.test(cmd)) return { kind: 'render', cwd: dir, outputs, tool: (RENDER_RE.exec(cmd)[1] || '').split(/\s/)[0] };
  const sk = scriptKind(cmd, dir);
  if (sk) return { kind: sk.kind, cwd: dir, outputs, script: sk.script };
  return null;
}

module.exports = { tokenize, detectJob, mediaPaths, effectiveCwd, parseEdgeTts };
