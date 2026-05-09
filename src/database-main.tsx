import React from 'react';
import ReactDOM from 'react-dom/client';
import DatabaseViewer from './components/DatabaseViewer';
import { WATER_LEVEL_AUTO_SYNC_INTERVAL_MS, useWaterLevelStore } from './store/waterLevelStore';
import './index.css';

function DatabasePage() {
  const { loadData, fetchFromYandexDisk, checkYandexForUpdates } = useWaterLevelStore();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Pull the static 2025 archive (and any previously saved local overrides).
      await loadData();
      if (cancelled) return;
      // 2) Refresh the database with the latest data from Yandex Disk so the
      //    real 2026 dates appear automatically without a manual upload.
      try {
        await fetchFromYandexDisk();
      } catch (e) {
        console.warn('Не удалось синхронизироваться с Яндекс.Диском:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData, fetchFromYandexDisk]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      checkYandexForUpdates().catch(() => {});
    }, WATER_LEVEL_AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkYandexForUpdates]);

  return <DatabaseViewer isOpen={false} onClose={() => {}} isPage={true} />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DatabasePage />
  </React.StrictMode>
);
