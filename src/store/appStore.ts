import { create } from 'zustand';
import type { PickMode } from '../types';

interface AppState {
  isAdmin: boolean;
  setIsAdmin: (val: boolean) => void;
  pickMode: PickMode;
  setPickMode: (mode: PickMode) => void;
  draftUpper: [number, number] | null;
  setDraftUpper: (coords: [number, number] | null) => void;
  draftLower: [number, number] | null;
  setDraftLower: (coords: [number, number] | null) => void;
  selectedSettlement: any | null;
  setSelectedSettlement: (s: any | null) => void;
  mapCenter: { lng: number; lat: number; zoom: number; triggerFly: number } | null;
  setMapCenter: (lng: number, lat: number, zoom?: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isAdmin: false,
  setIsAdmin: (val) => set({ isAdmin: val }),
  pickMode: 'none',
  setPickMode: (mode) => set({ pickMode: mode }),
  draftUpper: null,
  setDraftUpper: (coords) => set({ draftUpper: coords }),
  draftLower: null,
  setDraftLower: (coords) => set({ draftLower: coords }),
  selectedSettlement: null,
  setSelectedSettlement: (s) => set({ selectedSettlement: s }),
  mapCenter: null,
  setMapCenter: (lng, lat, zoom = 8) => set((state) => ({ 
    mapCenter: { lng, lat, zoom, triggerFly: (state.mapCenter?.triggerFly || 0) + 1 } 
  })),
}));
