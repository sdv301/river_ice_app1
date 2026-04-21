export interface Settlement {
  id: string;
  name: string;
  coords: [number, number];
  isMajor?: boolean;
}

export type PickMode = 'none' | 'upper' | 'lower' | 'jam';

export interface IceJam {
  id: string;
  coords: [number, number]; // [lng, lat]
  dateAdded: string; // ISO string
  description: string;
  status: 'active' | 'cleared';
  severity: 'low' | 'medium' | 'high';
}

export interface IceObservation {
  id: string;
  date: string; // ISO date string
  upperEdgeCoords: [number, number]; // [lng, lat]
  lowerEdgeCoords: [number, number]; // [lng, lat]
  notes?: string;
  locationName?: string;
}

export type IceStatus = 'water' | 'drift' | 'ice';

export interface RiverSegment {
  coordinates: [number, number][];
  status: IceStatus;
}
