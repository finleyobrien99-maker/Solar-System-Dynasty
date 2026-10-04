import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { inApp, initNative } from './native';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

initNative();

// Offline support for the hosted web version. Not in dev, and not inside the
// phone app, which bundles the game already.
if (import.meta.env.PROD && import.meta.env.MODE !== 'app' && !inApp && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
