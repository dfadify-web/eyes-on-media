import { createRoot } from 'react-dom/client';
import App from './App';
import { LANG, EMBED } from './lib/i18n';
import './styles.css';

document.documentElement.lang = LANG;
if (EMBED) document.documentElement.classList.add('embed');
createRoot(document.getElementById('root')).render(<App />);
