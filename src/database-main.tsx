import React from 'react';
import ReactDOM from 'react-dom/client';
import DatabaseViewer from './components/DatabaseViewer';
import { WATER_LEVEL_AUTO_SYNC_INTERVAL_MS, useWaterLevelStore } from './store/waterLevelStore';
import { DATA_SOURCE_MODE } from './config/runtimeConfig';
import './index.css';

function DatabasePage() {
  const { loadData, checkYandexForUpdates } = useWaterLevelStore();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Pull local DB/snapshot first to show data instantly.
      await loadData();
      if (cancelled) return;
      // 2) Yandex Disk sync is handled by the periodic 5-minute updater below.
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  React.useEffect(() => {
    if (DATA_SOURCE_MODE === 'none') return;
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
