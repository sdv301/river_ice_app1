import { create } from 'zustand';
import { DATA_SOURCE_MODE, publicAssetUrl } from '../config/runtimeConfig';

export interface WaterLevelStation {
  id: string; // river_name
  index: number | null;
  river: string;
  name: string;
  criticalLevel: number | null;
  coords: [number, number] | null;
  levels: Record<string, number>;
}

export const WATER_LEVEL_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

interface WaterLevelSyncResult {
  fileCount: number;
  totalFiles: number;
  newDateCount: number;
  errors: string[];
  filesProcessed: { name: string; year: number; entries: number }[];
}

interface WaterLevelState {
  stations: WaterLevelStation[];
  isLoaded: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastDiskModified: string | null;
  syncError: string | null;
  setStations: (stations: WaterLevelStation[]) => void;
  mergeStations: (incoming: WaterLevelStation[]) => void;
  loadData: () => Promise<void>;
  fetchFromYandexDisk: (options?: { year?: number | null }) => Promise<WaterLevelSyncResult>;
  checkYandexForUpdates: (options?: { year?: number | null }) => Promise<boolean>;
  getStation: (name: string) => WaterLevelStation | undefined;
  getStationHistory: (name: string, dateStr: string, days: number) => {date: string, level: number}[];
}

const LOCAL_STORAGE_KEY = 'river_ice_water_levels_overrides_v1';
const SNAPSHOT_STORAGE_KEY = 'river_ice_water_levels_snapshot_v1';
const SYNC_META_STORAGE_KEY = 'river_ice_water_levels_sync_meta_v1';

/**
 * Merge two station arrays. Levels in `override` win on date conflicts; other
 * station fields (criticalLevel, coords, river, index) are taken from
 * `override` whenever provided. Stations only present in `override` are
 * appended.
 */
function mergeStations(
  base: WaterLevelStation[],
  override: WaterLevelStation[],
): WaterLevelStation[] {
  const byKey = new Map<string, WaterLevelStation>();
  const keyOf = (s: WaterLevelStation) => `${s.river}__${s.name}`.toLowerCase().trim();
  for (const stn of base) byKey.set(keyOf(stn), { ...stn, levels: { ...stn.levels } });
  for (const stn of override) {
    const key = keyOf(stn);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        index: stn.index ?? existing.index,
        criticalLevel: stn.criticalLevel ?? existing.criticalLevel,
        coords: stn.coords ?? existing.coords,
        levels: { ...existing.levels, ...stn.levels },
      });
    } else {
      byKey.set(key, { ...stn, levels: { ...stn.levels } });
    }
  }
  return Array.from(byKey.values());
}

function readOverridesFromStorage(): WaterLevelStation[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.stations) ? parsed.stations : [];
  } catch (e) {
    console.warn('Не удалось прочитать локальный кеш уровней воды:', e);
    return [];
  }
}

function writeOverridesToStorage(stations: WaterLevelStation[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), stations }),
    );
  } catch (e) {
    console.warn('Не удалось сохранить уровни воды локально:', e);
  }
}

function readSnapshotFromStorage(): WaterLevelStation[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.stations) ? parsed.stations : [];
  } catch (e) {
    console.warn('Не удалось прочитать снимок базы уровней воды:', e);
    return [];
  }
}

function writeSnapshotToStorage(stations: WaterLevelStation[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), stations }),
    );
  } catch (e) {
    console.warn('Не удалось сохранить снимок базы уровней воды:', e);
  }
}

function readSyncMetaFromStorage(): {
  lastSyncTime: string | null;
  lastDiskModified: string | null;
  syncError: string | null;
} {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { lastSyncTime: null, lastDiskModified: null, syncError: null };
  }
  try {
    const raw = window.localStorage.getItem(SYNC_META_STORAGE_KEY);
    if (!raw) return { lastSyncTime: null, lastDiskModified: null, syncError: null };
    const parsed = JSON.parse(raw);
    return {
      lastSyncTime: parsed?.lastSyncTime ?? null,
      lastDiskModified: parsed?.lastDiskModified ?? null,
      syncError: parsed?.syncError ?? null,
    };
  } catch {
    return { lastSyncTime: null, lastDiskModified: null, syncError: null };
  }
}

function writeSyncMetaToStorage(meta: {
  lastSyncTime: string | null;
  lastDiskModified: string | null;
  syncError: string | null;
}) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(SYNC_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // best effort only
  }
}

export const useWaterLevelStore = create<WaterLevelState>((set, get) => ({
  ...readSyncMetaFromStorage(),
  stations: [],
  isLoaded: false,
  isSyncing: false,
  setStations: (stations) => {
    writeOverridesToStorage(stations);
    writeSnapshotToStorage(stations);
    set({ stations, isLoaded: true });
  },
  mergeStations: (incoming) => {
    const current = get().stations;
    const merged = mergeStations(current, incoming);
    // Persist only the user-supplied data (not the JSON baseline) so that
    // future updates to the static JSON aren't masked. We rebuild the
    // overrides by intersecting incoming stations with current keys
    // and keeping the freshly uploaded levels.
    const overrides = readOverridesFromStorage();
    const overridesMerged = mergeStations(overrides, incoming);
    writeOverridesToStorage(overridesMerged);
    writeSnapshotToStorage(merged);
    set({ stations: merged, isLoaded: true });
  },
  loadData: async () => {
    const snapshot = readSnapshotFromStorage();
    if (snapshot.length > 0) {
      set({ stations: snapshot, isLoaded: true });
    }
    try {
      const res = await fetch(publicAssetUrl('water_levels_db.json'));
      const data = await res.json();
      const baseStations: WaterLevelStation[] = data.stations || [];
      const overrides = readOverridesFromStorage();
      const merged = overrides.length > 0 ? mergeStations(baseStations, overrides) : baseStations;
      writeSnapshotToStorage(merged);
      set({ stations: merged, isLoaded: true });
    } catch (e) {
      console.error('Failed to load water levels DB:', e);
      const overrides = readOverridesFromStorage();
      if (overrides.length > 0) {
        writeSnapshotToStorage(overrides);
        set({ stations: overrides, isLoaded: true });
      }
    }
  },
  fetchFromYandexDisk: async (options = {}) => {
    if (DATA_SOURCE_MODE === 'none') {
      return {
        fileCount: 0,
        totalFiles: 0,
        newDateCount: 0,
        errors: ['Синхронизация отключена политикой безопасности'],
        filesProcessed: [],
      };
    }
    const { fetchAllWaterLevelData } = await import('../utils/yandexDisk');
    set({ isSyncing: true, syncError: null });
    try {
      const result = await fetchAllWaterLevelData({
        year: options.year ?? null,
        onlyNewerThan: null,
      });

      // Merge over existing stations (JSON baseline + previous overrides + new fetch).
      const current = get().stations;
      const merged = mergeStations(current, result.stations);

      // Persist the fetched data on top of any prior overrides so reloads are stable.
      const overridesNow = readOverridesFromStorage();
      const overridesMerged = mergeStations(overridesNow, result.stations);
      writeOverridesToStorage(overridesMerged);
      writeSnapshotToStorage(merged);

      // Count truly new (date, station) entries vs. what was already in the store.
      let newDateCount = 0;
      const previousByKey = new Map<string, Set<string>>();
      for (const stn of current) {
        previousByKey.set(`${stn.river}__${stn.name}`.toLowerCase().trim(), new Set(Object.keys(stn.levels)));
      }
      for (const stn of result.stations) {
        const key = `${stn.river}__${stn.name}`.toLowerCase().trim();
        const seen = previousByKey.get(key) ?? new Set<string>();
        for (const date of Object.keys(stn.levels)) {
          if (!seen.has(date)) newDateCount++;
        }
      }

      const summary: WaterLevelSyncResult = {
        fileCount: result.fileCount,
        totalFiles: result.totalFiles,
        newDateCount,
        errors: result.errors,
        filesProcessed: result.filesProcessed,
      };

      set({
        stations: merged,
        isLoaded: true,
        isSyncing: false,
        lastSyncTime: new Date().toISOString(),
        lastDiskModified: result.latestModified,
        syncError: result.errors.length > 0 ? result.errors.join('; ') : null,
      });
      writeSyncMetaToStorage({
        lastSyncTime: new Date().toISOString(),
        lastDiskModified: result.latestModified,
        syncError: result.errors.length > 0 ? result.errors.join('; ') : null,
      });

      return summary;
    } catch (e: any) {
      const message = e?.message ?? String(e);
      const nextSyncTime = new Date().toISOString();
      set({
        isSyncing: false,
        syncError: message,
        lastSyncTime: nextSyncTime,
      });
      writeSyncMetaToStorage({
        lastSyncTime: nextSyncTime,
        lastDiskModified: get().lastDiskModified,
        syncError: message,
      });
      return {
        fileCount: 0,
        totalFiles: 0,
        newDateCount: 0,
        errors: [message],
        filesProcessed: [],
      };
    }
  },
  checkYandexForUpdates: async (options = {}) => {
    if (DATA_SOURCE_MODE === 'none') {
      set({ isSyncing: false, syncError: null });
      return false;
    }
    const { fetchAllWaterLevelData } = await import('../utils/yandexDisk');
    const { lastDiskModified } = get();
    set({ isSyncing: true, syncError: null });
    try {
      const result = await fetchAllWaterLevelData({
        year: options.year ?? null,
        onlyNewerThan: lastDiskModified,
      });

      if (!result.hasNewFiles || result.fileCount === 0) {
        const nextSyncTime = new Date().toISOString();
        set({
          isSyncing: false,
          lastSyncTime: nextSyncTime,
          lastDiskModified: result.latestModified ?? lastDiskModified,
          syncError: null,
        });
        writeSyncMetaToStorage({
          lastSyncTime: nextSyncTime,
          lastDiskModified: result.latestModified ?? lastDiskModified,
          syncError: null,
        });
        return false;
      }

      const current = get().stations;
      const merged = mergeStations(current, result.stations);
      const overridesNow = readOverridesFromStorage();
      const overridesMerged = mergeStations(overridesNow, result.stations);
      writeOverridesToStorage(overridesMerged);
      writeSnapshotToStorage(merged);
      const nextSyncTime = new Date().toISOString();

      set({
        stations: merged,
        isLoaded: true,
        isSyncing: false,
        lastSyncTime: nextSyncTime,
        lastDiskModified: result.latestModified ?? lastDiskModified,
        syncError: result.errors.length > 0 ? result.errors.join('; ') : null,
      });
      writeSyncMetaToStorage({
        lastSyncTime: nextSyncTime,
        lastDiskModified: result.latestModified ?? lastDiskModified,
        syncError: result.errors.length > 0 ? result.errors.join('; ') : null,
      });
      return true;
    } catch (e: any) {
      const message = e?.message ?? String(e);
      const nextSyncTime = new Date().toISOString();
      set({
        isSyncing: false,
        syncError: message,
        lastSyncTime: nextSyncTime,
      });
      writeSyncMetaToStorage({
        lastSyncTime: nextSyncTime,
        lastDiskModified: get().lastDiskModified,
        syncError: message,
      });
      return false;
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
         const dayKeys = Object.keys(stn.levels).filter(k => k.startsWith(ds)).sort().reverse();
         if (dayKeys.length > 0) {
            level = stn.levels[dayKeys[0]];
         } else {
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
               const fallbackKeys = Object.keys(stn.levels).filter(k => k.startsWith(fallbackDs)).sort().reverse();
               if(fallbackKeys.length > 0) {
                  level = stn.levels[fallbackKeys[0]];
                  break;
               }
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
