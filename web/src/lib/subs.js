// SRT (lo que escribe edge-tts 7 con --write-subtitles) y WebVTT
const ts = (s) => {
  const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(s);
  return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +`0.${m[4]}` : 0;
};
export function parseSubs(text) {
  if (!text) return [];
  const out = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter(Boolean);
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const body = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (body) out.push({ start: ts(a), end: ts(b), text: body });
  }
  return out;
}
