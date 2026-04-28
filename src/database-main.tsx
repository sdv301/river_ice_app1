import React from 'react';
import ReactDOM from 'react-dom/client';
import DatabaseViewer from './components/DatabaseViewer';
import { useWaterLevelStore } from './store/waterLevelStore';
import './index.css';

function DatabasePage() {
  const { loadData } = useWaterLevelStore();
  
  React.useEffect(() => {
    loadData();
  }, [loadData]);

  return <DatabaseViewer isOpen={false} onClose={() => {}} isPage={true} />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DatabasePage />
  </React.StrictMode>
);
