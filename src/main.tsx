import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

const BUILD_ID = __APP_BUILD_ID__;

async function clearStalePwaCache(): Promise<void> {
  const key = 'river-ice-build-id';
  const prev = localStorage.getItem(key);
  if (prev === BUILD_ID) return;

  localStorage.setItem(key, BUILD_ID);
  if (!prev) return;

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
}

void clearStalePwaCache().then(() => {
  if ('serviceWorker' in navigator) {
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        registration?.update();
      },
      onNeedRefresh() {
        void updateSW(true);
      },
    });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
