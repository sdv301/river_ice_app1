import { create } from 'zustand';
import type { IceObservation, IceJam } from '../types';
import { interpolateAlongRiver, snapToRiver, getRiverDistance } from '../utils/mapUtils';
import { nearestPointOnLine, point } from '@turf/turf';
import { lenaRiverFeature } from '../utils/riverData';
import { fetchAllIceData } from '../utils/yandexDisk';

export const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
// Absolute safety cap for clearly broken calculations (unit/parse issues).
const MAX_REASONABLE_ICE_SPEED_KM_PER_DAY = 250;

/**
 * Returns the most natural "current" date for the given monitoring year:
 * - if today is inside the ice-drift season (April – June), use today;
 * - otherwise, use May 1 of that year (the conventional start of monitoring).
 */
export function getDefaultCurrentDate(year: number): string {
  const today = new Date();
  const month = today.getMonth(); // 0-based: 3 = April, 4 = May, 5 = June
  if (today.getFullYear() === year && month >= 3 && month <= 5) {
    return today.toISOString();
  }
  return new Date(`${year}-05-01T12:00:00Z`).toISOString();
}

export const ARCHIVE_2025: IceObservation[] = [
  {
    id: '1',
    date: '2025-05-01T12:00:00Z',
    upperEdgeCoords: [105.76, 56.80], // Ust-Kut
    lowerEdgeCoords: [108.11, 57.77], // Kirensk
    locationName: 'Усть-Кут - Киренск',
    notes: 'Начало разрушения ледяного покрова в верховьях'
  },
  {
    id: '2',
    date: '2025-05-05T12:00:00Z',
    upperEdgeCoords: [112.56, 59.45], // Vitim
    lowerEdgeCoords: [112.74, 59.62], // Peleduy
    locationName: 'Витим - Пеледуй',
    notes: 'Ледоход идет со средней скоростью'
  },
  {
    id: '3',
    date: '2025-05-10T12:00:00Z',
    upperEdgeCoords: [120.42, 60.37], // Olekminsk
    lowerEdgeCoords: [125.30, 61.10], // Sinsk
    locationName: 'Олекминск - Синск',
    notes: 'Густой ледоход, есть скопления'
  },
  {
    id: '4',
    date: '2025-05-15T12:00:00Z',
    upperEdgeCoords: [129.13, 61.48], // Pokrovsk
    lowerEdgeCoords: [129.73, 62.03], // Yakutsk
    locationName: 'Покровск - Якутск',
    notes: 'Ледоход у Якутска!'
  },
  {
    id: '5',
    date: '2025-05-22T12:00:00Z',
    upperEdgeCoords: [127.47, 63.92], // Sangar
    lowerEdgeCoords: [123.39, 66.76], // Zhigansk
    locationName: 'Сангар - Жиганск',
    notes: 'Нижнее течение реки'
  },
  {
    id: '6',
    date: '2025-05-31T12:00:00Z',
    upperEdgeCoords: [127.87, 70.68], // Kyusyur
    lowerEdgeCoords: [126.70, 72.50], // Delta sea entry
    locationName: 'Кюсюр - Дельта',
    notes: 'Выход ледохода в море Лаптевых'
  }
];

interface IceStore {
  observations: IceObservation[];
  currentDate: string;
  jams: IceJam[];
  draftJamCoords: [number, number] | null;
  isLoading: boolean;
  lastSyncTime: string | null;
  syncError: string | null;
  syncFileCount: number;
  lastDiskModified: string | null;
  loadYearData: (year: number) => void;
  setCurrentDate: (date: string) => void;
  setDraftJamCoords: (coords: [number, number] | null) => void;
  addObservation: (obs: Omit<IceObservation, 'id'>) => void;
  addJam: (jam: Omit<IceJam, 'id' | 'status'>) => void;
  resolveJam: (id: string) => void;
  removeJam: (id: string) => void;
  fetchFromYandexDisk: () => Promise<void>;
  checkYandexForUpdates: () => Promise<boolean>;
  getCurrentObservationData: () => any;
  getDailySpeed: () => any;
  getSectionSpeeds: () => any[];
  getCustomSectionSpeed: (
    start: { name: string; coords: [number, number] },
    end: { name: string; coords: [number, number] }
  ) => {
    speed: number;
    distanceKm: number;
    startLoc: string;
    endLoc: string;
    startDate: string;
    endDate: string;
    days: number;
  } | null;
}

export const useIceStore = create<IceStore>((set, get) => ({
  observations: [],
  currentDate: getDefaultCurrentDate(2026),
  jams: [],
  draftJamCoords: null,
  isLoading: false,
  lastSyncTime: null,
  syncError: null,
  syncFileCount: 0,
  lastDiskModified: null,

  setCurrentDate: (date: string) => set({ currentDate: date }),
  
  setDraftJamCoords: (coords) => set({ draftJamCoords: coords }),

  loadYearData: (year: number) => {
    if (year === 2025) {
      set({
        observations: ARCHIVE_2025.map(obs => ({
          ...obs,
          upperEdgeCoords: snapToRiver(obs.upperEdgeCoords),
          lowerEdgeCoords: snapToRiver(obs.lowerEdgeCoords),
        })),
        currentDate: ARCHIVE_2025[0].date,
        jams: [], // Clear or load 2025 jams
      });
    } else {
      set({
        observations: [],
        currentDate: getDefaultCurrentDate(year),
        jams: [],
      });
    }
  },

  fetchFromYandexDisk: async () => {
    set({ isLoading: true, syncError: null });
    try {
      const result = await fetchAllIceData();
      
      if (result.observations.length > 0) {
        const newObs: IceObservation[] = result.observations.map((obs, idx) => ({
          id: `yd-${Date.now()}-${idx}`,
          date: obs.date,
          upperEdgeCoords: snapToRiver(obs.upperEdgeCoords),
          lowerEdgeCoords: snapToRiver(obs.lowerEdgeCoords),
          locationName: obs.locationName,
          notes: obs.notes,
        }));

        set((state) => ({
          observations: newObs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
          isLoading: false,
          lastSyncTime: new Date().toISOString(),
          syncFileCount: result.fileCount,
          lastDiskModified: result.latestModified,
          syncError: result.errors.length > 0 ? result.errors.join('; ') : null,
        }));

        // Auto-set current date to first observation
        if (newObs.length > 0) {
          const sorted = newObs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          set({ currentDate: sorted[0].date });
        }
      } else {
        set({
          isLoading: false,
          lastSyncTime: new Date().toISOString(),
          syncFileCount: result.fileCount,
          lastDiskModified: result.latestModified,
          syncError: result.errors.length > 0 
            ? result.errors.join('; ') 
            : result.hasNewFiles
              ? 'Файлы не содержат корректных данных'
              : 'Новых файлов на Яндекс.Диске нет',
        });
      }
    } catch (e: any) {
      set({
        isLoading: false,
        syncError: e.message || 'Ошибка при загрузке данных',
      });
    }
  },

  checkYandexForUpdates: async () => {
    const { lastDiskModified } = get();
    set({ isLoading: true, syncError: null });
    try {
      const result = await fetchAllIceData({ onlyNewerThan: lastDiskModified });
      if (!result.hasNewFiles) {
        set({
          isLoading: false,
          lastSyncTime: new Date().toISOString(),
          syncFileCount: 0,
          syncError: null,
          lastDiskModified: result.latestModified ?? lastDiskModified,
        });
        return false;
      }

      const newObs: IceObservation[] = result.observations.map((obs, idx) => ({
        id: `yd-${Date.now()}-${idx}`,
        date: obs.date,
        upperEdgeCoords: snapToRiver(obs.upperEdgeCoords),
        lowerEdgeCoords: snapToRiver(obs.lowerEdgeCoords),
        locationName: obs.locationName,
        notes: obs.notes,
      }));

      set({
        observations: newObs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        isLoading: false,
        lastSyncTime: new Date().toISOString(),
        syncFileCount: result.fileCount,
        syncError: result.errors.length > 0 ? result.errors.join('; ') : null,
        lastDiskModified: result.latestModified ?? lastDiskModified,
      });

      if (newObs.length > 0) {
        const sorted = [...newObs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        set({ currentDate: sorted[0].date });
      }
      return true;
    } catch (e: any) {
      set({
        isLoading: false,
        syncError: e.message || 'Ошибка авто-проверки Яндекс.Диска',
      });
      return false;
    }
  },

  addObservation: (obs) => set((state) => {
    const newObs = {
      ...obs,
      id: Math.random().toString(36).substr(2, 9),
      upperEdgeCoords: snapToRiver(obs.upperEdgeCoords),
      lowerEdgeCoords: snapToRiver(obs.lowerEdgeCoords),
    };
    return {
      observations: [...state.observations, newObs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    };
  }),

  addJam: (jam) => set((state) => {
    const newJam: IceJam = {
      ...jam,
      id: Math.random().toString(36).substr(2, 9),
      status: 'active',
      coords: snapToRiver(jam.coords),
    };
    return {
      jams: [...state.jams, newJam],
      draftJamCoords: null
    };
  }),

  resolveJam: (id) => set((state) => ({
    jams: state.jams.map(j => j.id === id ? { ...j, status: 'cleared' } : j)
  })),

  removeJam: (id) => set((state) => ({
    jams: state.jams.filter(j => j.id !== id)
  })),

  getCurrentObservationData() {
    const { observations, currentDate } = get();
    if (observations.length === 0) return null;
    
    // Sort array just in case
    const sorted = [...observations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const targetTime = new Date(currentDate).getTime();
    
    // Find before and after
    let before = sorted[0];
    let after = sorted[sorted.length - 1];

    if (targetTime <= new Date(before.date).getTime()) return { ...before, exact: true };
    if (targetTime >= new Date(after.date).getTime()) return { ...after, exact: true };

    for (let i = 0; i < sorted.length - 1; i++) {
        const time1 = new Date(sorted[i].date).getTime();
        const time2 = new Date(sorted[i+1].date).getTime();
        
        if (targetTime >= time1 && targetTime <= time2) {
            before = sorted[i];
            after = sorted[i+1];
            break;
        }
    }

    // Interpolate distance along the river between before and after
    const time1 = new Date(before.date).getTime();
    const time2 = new Date(after.date).getTime();
    const progress = (targetTime - time1) / (time2 - time1);

    return {
        date: currentDate,
        // Using turf along & length for exact river contour instead of straight lines
        upperEdgeCoords: interpolateAlongRiver(before.upperEdgeCoords, after.upperEdgeCoords, progress),
        lowerEdgeCoords: interpolateAlongRiver(before.lowerEdgeCoords, after.lowerEdgeCoords, progress),
        exact: false,
    };
  },

  getDailySpeed() {
    const { observations, currentDate } = get();
    if (observations.length < 2) return null;
    const sorted = [...observations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const targetTime = new Date(currentDate).getTime();

    let before = sorted[0];
    let after = sorted[sorted.length - 1];

    if (targetTime <= new Date(before.date).getTime()) {
      after = sorted[1];
    } else if (targetTime >= new Date(after.date).getTime()) {
      before = sorted[sorted.length - 2];
    } else {
      for (let i = 0; i < sorted.length - 1; i++) {
          const time1 = new Date(sorted[i].date).getTime();
          const time2 = new Date(sorted[i+1].date).getTime();
          if (targetTime >= time1 && targetTime <= time2) {
              before = sorted[i];
              after = sorted[i+1];
              break;
          }
      }
    }

    const t1 = new Date(before.date).getTime();
    const t2 = new Date(after.date).getTime();
    const daysDiff = (t2 - t1) / (1000 * 60 * 60 * 24);
    
    if (daysDiff === 0) return null;
    const distanceKm = getRiverDistance(before.upperEdgeCoords, after.upperEdgeCoords);
    return {
      speed: distanceKm / daysDiff,
      startLoc: before.locationName || 'Неизвестно',
      endLoc: after.locationName || 'Неизвестно'
    };
  },

  getSectionSpeeds() {
    const { observations } = get();
    if (observations.length < 2) return [];
    
    const sorted = [...observations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const speeds = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const obs1 = sorted[i];
      const obs2 = sorted[i+1];
      
      const t1 = new Date(obs1.date).getTime();
      const t2 = new Date(obs2.date).getTime();
      const daysDiff = (t2 - t1) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 0) {
        const distanceKm = getRiverDistance(obs1.upperEdgeCoords, obs2.upperEdgeCoords);
        speeds.push({
          startLoc: obs1.locationName || `Участок ${i+1}`,
          endLoc: obs2.locationName || `Участок ${i+2}`,
          speed: distanceKm / daysDiff,
          startDate: obs1.date,
          endDate: obs2.date,
          midCoords: interpolateAlongRiver(obs1.upperEdgeCoords, obs2.upperEdgeCoords, 0.5)
        });
      }
    }
    return speeds.reverse();
  },

  getCustomSectionSpeed(start, end) {
    const { observations } = get();
    if (!start || !end || observations.length < 2) return null;

    const sorted = [...observations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const getRiverLocationKm = (coords: [number, number]) => {
      const snapped = nearestPointOnLine(lenaRiverFeature, point(coords), { units: 'kilometers' });
      return Number(snapped.properties.location ?? 0);
    };

    const startLocationKm = getRiverLocationKm(start.coords);
    const endLocationKm = getRiverLocationKm(end.coords);
    if (!Number.isFinite(startLocationKm) || !Number.isFinite(endLocationKm)) return null;
    // Distance strictly along the Lena river polyline (ruslo), not straight line.
    const distanceKm = Math.abs(endLocationKm - startLocationKm);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0.01) return null;

    const minLocationKm = Math.min(startLocationKm, endLocationKm);
    const maxLocationKm = Math.max(startLocationKm, endLocationKm);
    const DAY_MS = 1000 * 60 * 60 * 24;

    const median = (values: number[]): number | null => {
      const cleaned = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (cleaned.length === 0) return null;
      const mid = Math.floor(cleaned.length / 2);
      return cleaned.length % 2 === 0
        ? (cleaned[mid - 1] + cleaned[mid]) / 2
        : cleaned[mid];
    };

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const avg = (values: number[]) =>
      values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

    const buildSeries = (edge: 'upper' | 'lower') => {
      const series = [];
      for (let i = 0; i < sorted.length; i++) {
        const obs = sorted[i];
        const t = new Date(obs.date).getTime();
        if (!Number.isFinite(t)) continue;
        const coords = edge === 'upper' ? obs.upperEdgeCoords : obs.lowerEdgeCoords;
        const loc = getRiverLocationKm(coords);
        if (!Number.isFinite(loc)) continue;
        series.push({ t, loc, idx: i });
      }
      return series;
    };

    const findCrossingByInterpolation = (series: { t: number; loc: number; idx: number }[], targetLocationKm: number) => {
      for (let i = 0; i < series.length - 1; i++) {
        const p1 = series[i];
        const p2 = series[i + 1];
        if (!Number.isFinite(p1.t) || !Number.isFinite(p2.t) || p2.t <= p1.t) continue;
        const minLoc = Math.min(p1.loc, p2.loc);
        const maxLoc = Math.max(p1.loc, p2.loc);
        if (targetLocationKm < minLoc || targetLocationKm > maxLoc) continue;
        if (Math.abs(p2.loc - p1.loc) < 0.0001) {
          return { t: p1.t, intervalIndex: Math.min(p1.idx, p2.idx) };
        }
        const ratio = (targetLocationKm - p1.loc) / (p2.loc - p1.loc);
        const clampedRatio = Math.max(0, Math.min(1, ratio));
        return { t: p1.t + (p2.t - p1.t) * clampedRatio, intervalIndex: Math.min(p1.idx, p2.idx) };
      }
      return null;
    };

    const findCrossingByRegression = (series: { t: number; loc: number; idx: number }[], targetLocationKm: number) => {
      if (series.length < 2) return null;
      const nearest = [...series]
        .sort((a, b) => Math.abs(a.loc - targetLocationKm) - Math.abs(b.loc - targetLocationKm))
        .slice(0, Math.min(6, series.length))
        .sort((a, b) => a.t - b.t);
      if (nearest.length < 2) return null;

      const anchorT = nearest[Math.floor(nearest.length / 2)].t;
      const x = nearest.map((p) => (p.t - anchorT) / DAY_MS);
      const y = nearest.map((p) => p.loc);
      const meanX = avg(x);
      const meanY = avg(y);
      if (meanX === null || meanY === null) return null;
      const varianceX = x.reduce((sum, xi) => sum + (xi - meanX) ** 2, 0);
      if (varianceX < 1e-6) return null;
      const covXY = x.reduce((sum, xi, idx) => sum + (xi - meanX) * (y[idx] - meanY), 0);
      const slope = covXY / varianceX; // km/day
      if (!Number.isFinite(slope) || Math.abs(slope) < 0.01) return null;
      const intercept = meanY - slope * meanX;
      const xCross = (targetLocationKm - intercept) / slope;
      if (!Number.isFinite(xCross)) return null;
      const tCross = anchorT + xCross * DAY_MS;
      const minT = nearest[0].t - DAY_MS * 3;
      const maxT = nearest[nearest.length - 1].t + DAY_MS * 3;
      if (tCross < minT || tCross > maxT) return null;
      return { t: tCross };
    };

    const getCrossingTime = (series: { t: number; loc: number; idx: number }[], targetLocationKm: number) => {
      const interp = findCrossingByInterpolation(series, targetLocationKm);
      const reg = findCrossingByRegression(series, targetLocationKm);
      if (interp && reg) {
        return { t: interp.t * 0.65 + reg.t * 0.35, intervalIndex: interp.intervalIndex };
      }
      if (interp) return interp;
      if (reg) return { t: reg.t, intervalIndex: null as number | null };
      return null;
    };

    const localIntervalSpeeds = (series: { t: number; loc: number; idx: number }[]) => {
      const out: number[] = [];
      for (let i = 0; i < series.length - 1; i++) {
        const p1 = series[i];
        const p2 = series[i + 1];
        const overlap =
          Math.max(Math.min(p1.loc, p2.loc), minLocationKm) <= Math.min(Math.max(p1.loc, p2.loc), maxLocationKm);
        if (!overlap) continue;
        const dDays = (p2.t - p1.t) / DAY_MS;
        if (!Number.isFinite(dDays) || dDays <= 0) continue;
        const dKm = Math.abs(p2.loc - p1.loc);
        if (!Number.isFinite(dKm) || dKm < 0.01) continue;
        out.push(dKm / dDays);
      }
      return out;
    };

    const calcEdgeSpeed = (series: { t: number; loc: number; idx: number }[]) => {
      const startCross = getCrossingTime(series, startLocationKm);
      const endCross = getCrossingTime(series, endLocationKm);
      if (!startCross || !endCross) return null;
      const dDays = Math.abs(endCross.t - startCross.t) / DAY_MS;
      if (!Number.isFinite(dDays) || dDays < 0.02) return null;
      return {
        speed: distanceKm / dDays,
        startT: startCross.t,
        endT: endCross.t,
      };
    };

    const upperSeries = buildSeries('upper');
    const lowerSeries = buildSeries('lower');
    const upperEdge = calcEdgeSpeed(upperSeries);
    const lowerEdge = calcEdgeSpeed(lowerSeries);
    const edgeSpeeds = [upperEdge, lowerEdge].filter(Boolean) as { speed: number; startT: number; endT: number }[];
    if (edgeSpeeds.length === 0) return null;

    const rawSpeed = median(edgeSpeeds.map((s) => s.speed)) ?? edgeSpeeds[0].speed;
    const localSpeeds = [...localIntervalSpeeds(upperSeries), ...localIntervalSpeeds(lowerSeries)];
    const localMedian = median(localSpeeds);

    let speed = rawSpeed;
    if (localMedian !== null) {
      speed = rawSpeed * 0.65 + localMedian * 0.35;
    }

    // Very soft safety cap for pathological cases only.
    speed = clamp(speed, 0, MAX_REASONABLE_ICE_SPEED_KM_PER_DAY);

    const startAvg = avg(edgeSpeeds.map((s) => s.startT)) ?? edgeSpeeds[0].startT;
    const endAvg = avg(edgeSpeeds.map((s) => s.endT)) ?? edgeSpeeds[0].endT;
    const days = Math.abs(endAvg - startAvg) / DAY_MS;

    return {
      speed,
      distanceKm,
      startLoc: start.name,
      endLoc: end.name,
      startDate: new Date(startAvg).toISOString(),
      endDate: new Date(endAvg).toISOString(),
      days
    };
  }
}));
