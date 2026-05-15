import { useIceStore } from '../store/iceStore';
import { useWaterLevelStore } from '../store/waterLevelStore';

const API_BASE = '/api'; // Assuming same-origin (proxy) or configured in vite

export async function initDataFromServer() {
  try {
    console.log('[ServerData] Fetching pre-parsed data from server...');
    const response = await fetch(`${API_BASE}/data/all`);
    if (!response.ok) throw new Error('Server data fetch failed');
    
    const data = await response.json();
    
    const { setObservations } = useIceStore.getState();
    const { setHistory } = useWaterLevelStore.getState();

    if (data.observations) {
      setObservations(data.observations);
      console.log(`[ServerData] Loaded ${data.observations.length} ice observations`);
    }

    if (data.levels) {
      // Group by station for history
      const stationHistory: Record<string, any[]> = {};
      data.levels.forEach((l: any) => {
        if (!stationHistory[l.stationName]) stationHistory[l.stationName] = [];
        stationHistory[l.stationName].push({
          date: l.date,
          level: l.level
        });
      });
      
      setHistory(stationHistory);
      console.log(`[ServerData] Loaded levels for ${Object.keys(stationHistory).length} stations`);
    }

    return true;
  } catch (err) {
    console.error('[ServerData] Failed to init data from server:', err);
    return false;
  }
}
