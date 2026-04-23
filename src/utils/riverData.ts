import type { Feature, LineString } from 'geojson';
import type { Settlement } from '../types';
import lenaRiverCoordsRaw from './lena_coords.json';

// Precise coordinates for Lena River directly from OSM
export const LENA_RIVER_COORDS: [number, number][] = lenaRiverCoordsRaw as [number, number][];

export const SETTLEMENTS: Settlement[] = [
  { id: 's1', name: 'Усть-Кут', coords: [105.76, 56.80], distanceToMouth: 3500 },
  { id: 's2', name: 'Киренск', coords: [108.11, 57.77], distanceToMouth: 3100 },
  { id: 's3', name: 'Витим', coords: [112.584, 59.449], distanceToMouth: 2876 },
  { id: 's4', name: 'Пеледуй', coords: [112.761, 59.612], distanceToMouth: 2852 },
  { id: 's-krest', name: 'Крестовский', coords: [113.208, 59.744], distanceToMouth: 2818 },
  { id: 's-yar', name: 'Ярославский', coords: [113.919, 60.162], distanceToMouth: 2754 },
  { id: 's-khamra', name: 'Хамра', coords: [114.152, 60.223], distanceToMouth: 2738 },
  { id: 's5', name: 'Ленск', coords: [114.928, 60.709], isMajor: true, distanceToMouth: 2665 },
  { id: 's-mur', name: 'Мурья', coords: [115.307, 60.729], distanceToMouth: 2644 },
  { id: 's-sald', name: 'Салдыкель', coords: [115.859, 60.680], distanceToMouth: 2611 },
  { id: 's-nyuya', name: 'Нюя', coords: [116.228, 60.527], distanceToMouth: 2582 },
  { id: 's-tur', name: 'Турукта', coords: [116.513, 60.475], distanceToMouth: 2565 },
  { id: 's-chap', name: 'Чапаево', coords: [117.097, 60.121], distanceToMouth: 2508 },
  { id: 's-macha', name: 'Мача', coords: [117.632, 59.901], distanceToMouth: 2468 },
  { id: 's-inn', name: 'Иннях', coords: [118.505, 59.814], distanceToMouth: 2401 },
  { id: 's6', name: 'Олекминск', coords: [120.42, 60.37], isMajor: true, distanceToMouth: 2258 },
  { id: 's7', name: 'Синск', coords: [125.30, 61.10], distanceToMouth: 1750 },
  { id: 's8', name: 'Покровск', coords: [129.13, 61.48], distanceToMouth: 1610 },
  { id: 's9', name: 'Якутск', coords: [129.73, 62.03], isMajor: true, distanceToMouth: 1530 },
  { id: 's10', name: 'Намцы', coords: [129.70, 62.70], distanceToMouth: 1440 },
  { id: 's11', name: 'Сангар', coords: [127.47, 63.92], distanceToMouth: 1100 },
  { id: 's12', name: 'Жиганск', coords: [123.39, 66.76], isMajor: true, distanceToMouth: 760 },
  { id: 's13', name: 'Кюсюр', coords: [127.87, 70.68], distanceToMouth: 250 },
  { id: 's14', name: 'Тикси', coords: [128.86, 71.63], isMajor: true, distanceToMouth: 0 }
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
