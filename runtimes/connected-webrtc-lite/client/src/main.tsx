import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// StrictMode intentionally removed: it double-mounts effects in dev mode,
// which creates two concurrent WebSocket connections to the server.
createRoot(document.getElementById('root')!).render(<App />);
