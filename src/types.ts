export interface Settlement {
  id: string;
  name: string;
  coords: [number, number];
  isMajor?: boolean;
  distanceToMouth?: number;
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
  /** Только явление в пункте (без кромок в файле) — маркер на карте, не полоса ледохода. */
  phenomenonOnly?: boolean;
}

export type IceStatus = 'water' | 'drift' | 'ice';

export interface RiverSegment {
  coordinates: [number, number][];
  status: IceStatus;
}
