const PARAMS = new URLSearchParams(location.search);
export const LANG = (PARAMS.get('lang') || navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
export const EMBED = PARAMS.has('embed');

const STR = {
  es: {
    live: 'en directo', offline: 'sin conexión', eyesOn: 'conectado a Eyes on Claude', eyesOff: 'Eyes on Claude no responde',
    all: 'Todo', video: 'Vídeo', audio: 'Audio', render: 'Render', wall: 'Muro', list: 'Lista', autoplay: 'Reproducir todo',
    folders: 'Carpetas', addFolder: 'Añadir carpeta', folderPh: 'C:\\ruta\\a\\la\\carpeta', add: 'Añadir', remove: 'Quitar',
    srcClaude: 'sesión de Claude', srcTemp: 'temporal', srcFolder: 'tuya',
    writing: 'escribiendo', ready: 'listo', rendering: 'renderizando', synthesizing: 'sintetizando voz', running: 'en marcha', done: 'terminado', error: 'error', background: 'en segundo plano',
    sItems: 'medios', sWriting: 'escribiéndose', sJobs: 'trabajos activos', sBytes: 'escritos', sVideo: 'vídeos', sAudio: 'audios',
    jobs: 'Lo que Claude está generando', noJobs: 'Ningún comando de vídeo o voz en marcha.',
    emptyTitle: 'Esperando vídeos y voces…', emptyText: 'Cuando Claude renderice un vídeo o genere una voz con edge-tts, aparecerá aquí en directo mientras se escribe.',
    emptyHint: 'Vigila las carpetas de tus sesiones de Claude y la carpeta temporal donde renderizan Remotion y turbo-render.',
    noAudioTrack: 'sin pista de audio', decoding: 'analizando audio…', cantDecode: 'no se pudo decodificar',
    frames: 'fotogramas', fps: 'fps', segments: 'trozos', perSec: '/s', growing: 'creciendo', since: 'hace',
    reveal: 'Mostrar en carpeta', forget: 'Quitar de la lista', open: 'Abrir', close: 'Cerrar', theater: 'Ver en grande',
    voice: 'Voz', rate: 'velocidad', pitch: 'tono', text: 'Texto', subtitles: 'Subtítulos', command: 'Comando', output: 'Salida',
    waveform: 'Forma de onda', spectrogram: 'Espectrograma', spectrum: 'Espectro en vivo', details: 'Detalles',
    duration: 'Duración', resolution: 'Resolución', codec: 'Códec', bitrate: 'Bitrate', size: 'Tamaño', sampleRate: 'Muestreo', channels: 'Canales', file: 'Archivo', faststart: 'faststart', approx: 'aprox.',
    mono: 'mono', stereo: 'estéreo', partialVideo: 'El vídeo se podrá ver en cuanto el render cierre el archivo.',
    latestSeg: 'último trozo terminado', chunkLegend: 'cada celda es un trozo que renderiza un worker en paralelo',
    sessions: 'sesión', tts: 'Voz', renderJob: 'Render', script: 'script',
  },
  en: {
    live: 'live', offline: 'offline', eyesOn: 'connected to Eyes on Claude', eyesOff: 'Eyes on Claude is not answering',
    all: 'All', video: 'Video', audio: 'Audio', render: 'Render', wall: 'Wall', list: 'List', autoplay: 'Play all',
    folders: 'Folders', addFolder: 'Add folder', folderPh: '/path/to/folder', add: 'Add', remove: 'Remove',
    srcClaude: 'Claude session', srcTemp: 'temp', srcFolder: 'yours',
    writing: 'writing', ready: 'ready', rendering: 'rendering', synthesizing: 'synthesizing voice', running: 'running', done: 'done', error: 'error', background: 'in background',
    sItems: 'media', sWriting: 'being written', sJobs: 'active jobs', sBytes: 'written', sVideo: 'videos', sAudio: 'audio',
    jobs: 'What Claude is generating', noJobs: 'No video or voice command running.',
    emptyTitle: 'Waiting for videos and voices…', emptyText: 'When Claude renders a video or generates a voice with edge-tts, it shows up here live while it is being written.',
    emptyHint: 'It watches your Claude session folders and the temp folder where Remotion and turbo-render work.',
    noAudioTrack: 'no audio track', decoding: 'analysing audio…', cantDecode: 'could not decode',
    frames: 'frames', fps: 'fps', segments: 'chunks', perSec: '/s', growing: 'growing', since: 'ago',
    reveal: 'Show in folder', forget: 'Remove from list', open: 'Open', close: 'Close', theater: 'Open large',
    voice: 'Voice', rate: 'rate', pitch: 'pitch', text: 'Text', subtitles: 'Subtitles', command: 'Command', output: 'Output',
    waveform: 'Waveform', spectrogram: 'Spectrogram', spectrum: 'Live spectrum', details: 'Details',
    duration: 'Duration', resolution: 'Resolution', codec: 'Codec', bitrate: 'Bitrate', size: 'Size', sampleRate: 'Sample rate', channels: 'Channels', file: 'File', faststart: 'faststart', approx: 'approx.',
    mono: 'mono', stereo: 'stereo', partialVideo: 'The video becomes playable as soon as the render closes the file.',
    latestSeg: 'latest finished chunk', chunkLegend: 'each cell is a chunk rendered by a parallel worker',
    sessions: 'session', tts: 'Voice', renderJob: 'Render', script: 'script',
  },
};
export const t = (k) => STR[LANG][k] ?? k;
