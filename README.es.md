# 🎬 Eyes on Media

**Extensión de [Eyes on Claude](https://github.com/dfadify-web/eyes-on-claude): mira en directo los vídeos y voces que Claude genera con código.**

[English](README.md)

![Muro de Eyes on Media](docs/wall.png)

Cuando Claude renderiza un vídeo (ffmpeg, Remotion, turbo-render, Blender, MoviePy…) o sintetiza una voz con **Microsoft Edge TTS**, Eyes on Media lo muestra mientras se escribe en disco:

- **Renders en vivo**: tamaño real creciendo, MB/s, curva de tamaño y tiempo. En cuanto el archivo se cierra se convierte en reproductor.
- **Reproductor de vídeo**: resolución, fps, códec, bitrate y pista de audio leídos de las cabeceras reales del MP4, miniaturas, forma de onda del audio y modo muro "Reproducir todo" para ver varios vídeos a la vez.
- **Tarjetas de voz para edge-tts**: voz, idioma, velocidad y texto exacto sacados del comando real que lanzó Claude; espectro radial en vivo al reproducir, forma de onda y subtítulos karaoke del `.srt/.vtt`.
- **Vista grande**: onda grande, espectro en vivo, **espectrograma** (FFT, 40 Hz–16 kHz), subtítulos clicables, detalles y el comando exacto.
- **Trozos de render**: los `seg_*.mp4` que turbo-render escribe en paralelo en `%TEMP%` se encienden uno a uno; las secuencias de fotogramas muestran el último fotograma real.
- **"Lo que Claude está generando"**: cada comando `edge-tts` / `ffmpeg` / render (o script cuyo código los usa) con estado y cronómetro, enlazado a los archivos que produce.

Nada se inventa: todo sale de los archivos en disco y de los comandos del transcript de Claude Code (vía Eyes on Claude).

## Instalar

Requiere Eyes on Claude **v2.3+** y Node 18+.

```bash
npx -y github:dfadify-web/eyes-on-media
```

Abre Eyes on Claude → **Extensiones** → **Eyes on Media** (`http://localhost:7777/#ext/eyes-on-media`). Arranca junto a Eyes on Claude. Desinstalar: `npx -y github:dfadify-web/eyes-on-media --uninstall`.

Suelta: `node server/server.js` → `http://localhost:7778`.

## Qué vigila

- Las carpetas de trabajo de tus sesiones de Claude Code (recursivo, sin `node_modules`, `.git`, venvs…).
- Las carpetas exactas de los medios que aparecen en los comandos de Claude.
- La carpeta temporal del sistema (donde trabajan Remotion y turbo-render).
- Las carpetas que añadas en **Carpetas** (se guardan en `~/.claude/eyes-on-claude/eyes-on-media.json`) o con `EOM_DIRS`.

MIT © dfadify-web
