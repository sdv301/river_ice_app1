import { create } from 'zustand';
import type { IceObservation, IceJam } from '../types';
import { interpolateAlongRiver, snapToRiver, getRiverDistance } from '../utils/mapUtils';

const INITIAL_DATA: IceObservation[] = [
  {
    id: '1',
    date: '2026-05-01T12:00:00Z',
    upperEdgeCoords: [105.76, 56.80], // Ust-Kut
    lowerEdgeCoords: [108.11, 57.77], // Kirensk
    locationName: 'Усть-Кут - Киренск',
    notes: 'Начало разрушения ледяного покрова в верховьях'
  },
  {
    id: '2',
    date: '2026-05-05T12:00:00Z',
    upperEdgeCoords: [112.56, 59.45], // Vitim
    lowerEdgeCoords: [112.74, 59.62], // Peleduy
    locationName: 'Витим - Пеледуй',
    notes: 'Ледоход идет со средней скоростью'
  },
  {
    id: '3',
    date: '2026-05-10T12:00:00Z',
    upperEdgeCoords: [120.42, 60.37], // Olekminsk
    lowerEdgeCoords: [125.30, 61.10], // Sinsk
    locationName: 'Олекминск - Синск',
    notes: 'Густой ледоход, есть скопления'
  },
  {
    id: '4',
    date: '2026-05-15T12:00:00Z',
    upperEdgeCoords: [129.13, 61.48], // Pokrovsk
    lowerEdgeCoords: [129.73, 62.03], // Yakutsk
    locationName: 'Покровск - Якутск',
    notes: 'Ледоход у Якутска!'
  },
  {
    id: '5',
    date: '2026-05-22T12:00:00Z',
    upperEdgeCoords: [127.47, 63.92], // Sangar
    lowerEdgeCoords: [123.39, 66.76], // Zhigansk
    locationName: 'Сангар - Жиганск',
    notes: 'Нижнее течение реки'
  },
  {
    id: '6',
    date: '2026-05-31T12:00:00Z',
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
  setCurrentDate: (date: string) => void;
  setDraftJamCoords: (coords: [number, number] | null) => void;
  addObservation: (obs: Omit<IceObservation, 'id'>) => void;
  addJam: (jam: Omit<IceJam, 'id' | 'status'>) => void;
  resolveJam: (id: string) => void;
  removeJam: (id: string) => void;
  getCurrentObservationData: () => any;
  getDailySpeed: () => any;
  getSectionSpeeds: () => any[];
}

export const useIceStore = create<IceStore>((set, get) => ({
  observations: INITIAL_DATA.map(obs => ({
    ...obs,
    upperEdgeCoords: snapToRiver(obs.upperEdgeCoords),
    lowerEdgeCoords: snapToRiver(obs.lowerEdgeCoords),
  })),
  currentDate: INITIAL_DATA[0].date,
  jams: [],
  draftJamCoords: null,

  setCurrentDate: (date: string) => set({ currentDate: date }),
  
  setDraftJamCoords: (coords) => set({ draftJamCoords: coords }),

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
          endDate: obs2.date
        });
      }
    }
    return speeds.reverse();
  }
}));
