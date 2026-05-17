import { useIceStore } from '../store/iceStore';
import { useWaterLevelStore } from '../store/waterLevelStore';
import { useAppStore } from '../store/appStore';
import { INTERNAL_DATA_API_BASE } from '../config/runtimeConfig';
import type { IceObservation } from '../types';

function apiBase(): string {
  if (INTERNAL_DATA_API_BASE.startsWith('http')) return INTERNAL_DATA_API_BASE;
  if (typeof window !== 'undefined') {
    const path = INTERNAL_DATA_API_BASE.startsWith('/') ? INTERNAL_DATA_API_BASE : `/${INTERNAL_DATA_API_BASE}`;
    return `${window.location.origin}${path}`;
  }
  return INTERNAL_DATA_API_BASE;
}

export interface ServerDataStatus {
  lastSyncTime: string | null;
  filesOnDisk: number;
  observationsCount: number;
  levelsCount: number;
  errors: string[];
  lastSyncError?: string | null;
  lastDownloadedCount?: number;
}

let serverObservationsCache: IceObservation[] = [];

export function getServerObservationsCache(): IceObservation[] {
  return serverObservationsCache;
}

export function setServerObservationsCache(observations: IceObservation[]) {
  serverObservationsCache = observations;
}

export async function fetchDataStatus(): Promise<ServerDataStatus | null> {
  try {
    const response = await fetch(`${apiBase()}/data/status`);
    if (!response.ok) return null;
    return (await response.json()) as ServerDataStatus;
  } catch {
    return null;
  }
}

export async function initDataFromServer(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBase()}/data/all`);
    if (!response.ok) throw new Error('Server data fetch failed');

    const data = await response.json();
    const { loadYearData } = useIceStore.getState();
    const { setHistory } = useWaterLevelStore.getState();

    if (Array.isArray(data.observations)) {
      const withIds: IceObservation[] = data.observations.map((obs: IceObservation, idx: number) => {
        const date =
          typeof obs.date === 'string'
            ? obs.date
            : obs.date != null
              ? new Date(obs.date as unknown as string | number).toISOString()
              : '';
        return {
          ...obs,
          date,
          id: obs.id ?? `srv-${idx}-${date}`,
        };
      });
      setServerObservationsCache(withIds);
      console.log(`[ServerData] Loaded ${withIds.length} ice observations from server`);
    }

    if (Array.isArray(data.levels)) {
      const stationHistory: Record<string, { date: string; level: number }[]> = {};
      data.levels.forEach((l: { stationName: string; date: string; level: number }) => {
        if (!stationHistory[l.stationName]) stationHistory[l.stationName] = [];
        stationHistory[l.stationName].push({ date: l.date, level: l.level });
      });
      setHistory(stationHistory);
    }

    const selectedYear = useAppStore.getState().selectedYear;
    loadYearData(selectedYear);

    const status = await fetchDataStatus();
    if (status) {
      useIceStore.setState({
        serverStatus: {
          observationsCount: status.observationsCount,
          filesOnDisk: status.filesOnDisk,
        },
        lastSyncTime: status.lastSyncTime ?? useIceStore.getState().lastSyncTime,
        syncError: status.lastSyncError ?? status.errors?.slice(0, 2).join('; ') ?? null,
      });
    }

    return true;
  } catch (err) {
    console.error('[ServerData] Failed to init data from server:', err);
    return false;
  }
}

export async function refreshDataFromServer(): Promise<ServerDataStatus | null> {
  const response = await fetch(`${apiBase()}/data/refresh`, { method: 'POST' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error ?? 'Server refresh failed');
  }
  await initDataFromServer();
  return fetchDataStatus();
}
