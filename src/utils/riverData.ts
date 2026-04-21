import type { Feature, LineString } from 'geojson';
import type { Settlement } from '../types';
import lenaRiverCoordsRaw from './lena_coords.json';

// Precise coordinates for Lena River directly from OSM
export const LENA_RIVER_COORDS: [number, number][] = lenaRiverCoordsRaw as [number, number][];

export const SETTLEMENTS: Settlement[] = [
  { id: 's1', name: 'Усть-Кут', coords: [105.76, 56.80] },
  { id: 's2', name: 'Киренск', coords: [108.11, 57.77] },
  { id: 's3', name: 'Витим', coords: [112.56, 59.45] },
  { id: 's4', name: 'Пеледуй', coords: [112.74, 59.62] },
  { id: 's5', name: 'Ленск', coords: [114.92, 60.72], isMajor: true },
  { id: 's6', name: 'Олекминск', coords: [120.42, 60.37], isMajor: true },
  { id: 's7', name: 'Синск', coords: [125.30, 61.10] },
  { id: 's8', name: 'Покровск', coords: [129.13, 61.48] },
  { id: 's9', name: 'Якутск', coords: [129.73, 62.03], isMajor: true },
  { id: 's10', name: 'Намцы', coords: [129.70, 62.70] },
  { id: 's11', name: 'Сангар', coords: [127.47, 63.92] },
  { id: 's12', name: 'Жиганск', coords: [123.39, 66.76], isMajor: true },
  { id: 's13', name: 'Кюсюр', coords: [127.87, 70.68] },
  { id: 's14', name: 'Тикси', coords: [128.86, 71.63], isMajor: true }
];

export const lenaRiverFeature: Feature<LineString> = {
  type: 'Feature',
  properties: {
    name: 'Lena River Exact'
  },
  geometry: {
    type: 'LineString',
    coordinates: LENA_RIVER_COORDS
  }
};
