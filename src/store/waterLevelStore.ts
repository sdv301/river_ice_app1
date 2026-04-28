import { create } from 'zustand';

export interface WaterLevelStation {
  id: string; // river_name
  index: number | null;
  river: string;
  name: string;
  criticalLevel: number | null;
  coords: [number, number] | null;
  levels: Record<string, number>;
}

interface WaterLevelState {
  stations: WaterLevelStation[];
  isLoaded: boolean;
  setStations: (stations: WaterLevelStation[]) => void;
  loadData: () => Promise<void>;
  getStation: (name: string) => WaterLevelStation | undefined;
  getStationHistory: (name: string, dateStr: string, days: number) => {date: string, level: number}[];
}

export const useWaterLevelStore = create<WaterLevelState>((set, get) => ({
  stations: [],
  isLoaded: false,
  setStations: (stations) => set({ stations }),
  loadData: async () => {
    if (get().isLoaded) return;
    try {
      const res = await fetch('/water_levels_db.json');
      const data = await res.json();
      set({ stations: data.stations || [], isLoaded: true });
    } catch (e) {
      console.error('Failed to load water levels DB:', e);
    }
  },
  getStation: (name: string) => {
    return get().stations.find(s => s.name === name);
  },
  getStationHistory: (name: string, dateStr: string, days: number) => {
    const stn = get().getStation(name);
    if (!stn || !stn.levels) return [];
    
    // Convert to Date to subtract days
    const targetDate = new Date(dateStr);
    const history = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().substr(0, 10);
      
      // If we don't have level for this exact day, try to find nearest previous
      let level = stn.levels[ds];
      if (level === undefined) {
         // Fallback - find last known
         let prevDaysAllowed = 5;
         for(let j=1; j<=prevDaysAllowed; j++) {
            const fallbackD = new Date(d);
            fallbackD.setDate(fallbackD.getDate() - j);
            const fallbackDs = fallbackD.toISOString().substr(0, 10);
            if(stn.levels[fallbackDs] !== undefined) {
               level = stn.levels[fallbackDs];
               break;
            }
         }
      }
      
      history.push({
        date: ds,
        level: level !== undefined ? level : 0
      });
    }
    return history;
  }
}));
