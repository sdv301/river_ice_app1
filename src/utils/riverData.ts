import type { Feature, LineString } from 'geojson';
import type { Settlement } from '../types';
import lenaRiverCoordsRaw from './lena_coords.json';

// Precise coordinates for Lena River directly from OSM
export const LENA_RIVER_COORDS: [number, number][] = lenaRiverCoordsRaw as [number, number][];

export const SETTLEMENTS: Settlement[] = [
  // === Верховья (Upper reaches) ===
  { id: 's1', name: 'Усть-Кут', coords: [105.76, 56.80], isMajor: true, distanceToMouth: 3500 },
  { id: 's-oset', name: 'Осетрово', coords: [105.74, 56.79], distanceToMouth: 3498 },
  { id: 's-zmei', name: 'Змеиново', coords: [107.82, 57.73], distanceToMouth: 3200 },
  { id: 's2', name: 'Киренск', coords: [108.11, 57.77], distanceToMouth: 3100 },
  { id: 's-daryino', name: 'Дарьино', coords: [108.40, 58.11], distanceToMouth: 3050 },
  { id: 's-vizir', name: 'Визирный', coords: [109.18, 58.42], distanceToMouth: 2980 },
  { id: 's-aleks', name: 'Алексеевск', coords: [110.42, 58.87], distanceToMouth: 2920 },

  // === Средняя Лена (Middle reaches) ===
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
  { id: 's-solyanka', name: 'Солянка', coords: [120.65, 60.35], distanceToMouth: 2240 },
  { id: 's-khatyn', name: 'Хатынг-Тумул', coords: [121.25, 60.40], distanceToMouth: 2180 },
  { id: 's-sanyakh', name: 'Саныяхтат', coords: [124.9, 60.85], distanceToMouth: 1850 },
  { id: 's7', name: 'Синск', coords: [125.30, 61.10], distanceToMouth: 1750 },

  // === Якутский узел (Yakutsk area) ===
  { id: 's-bulgunnakh', name: 'Булгунняхтах', coords: [129.46, 61.73], distanceToMouth: 1640 },
  { id: 's-mokhsog', name: 'Мохсоголлох', coords: [129.32, 61.58], distanceToMouth: 1650 },
  { id: 's8', name: 'Покровск', coords: [129.13, 61.48], distanceToMouth: 1610 },
  { id: 's-star-tab', name: 'Старая Табага', coords: [129.55, 61.85], distanceToMouth: 1570 },
  { id: 's-tabaga', name: 'Табага', coords: [129.58, 61.85], distanceToMouth: 1565 },
  { id: 's-khatassy', name: 'Хатассы', coords: [129.64, 61.96], distanceToMouth: 1550 },
  { id: 's9', name: 'Якутск', coords: [129.73, 62.03], isMajor: true, distanceToMouth: 1530 },
  { id: 's-tulagino', name: 'Тулагино', coords: [129.55, 62.12], distanceToMouth: 1520 },
  { id: 's-magan', name: 'Маган', coords: [129.67, 62.08], distanceToMouth: 1525 },
  { id: 's-zhatay', name: 'Жатай', coords: [129.83, 62.15], distanceToMouth: 1515 },
  { id: 's-grafsky', name: 'Графский Берег', coords: [129.80, 62.15], distanceToMouth: 1510 },
  { id: 's-kangalassy', name: 'Кангалассы', coords: [129.98, 62.33], distanceToMouth: 1480 },
  { id: 's10', name: 'Намцы', coords: [129.70, 62.70], distanceToMouth: 1440 },

  // === Нижняя Лена (Lower reaches) ===
  { id: 's-batamay', name: 'Батамай', coords: [128.08, 63.20], distanceToMouth: 1200 },
  { id: 's11', name: 'Сангар', coords: [127.47, 63.92], distanceToMouth: 1100 },
  { id: 's12', name: 'Жиганск', coords: [123.39, 66.76], isMajor: true, distanceToMouth: 760 },
  { id: 's-djard', name: 'Джарджан', coords: [124.22, 68.74], distanceToMouth: 500 },
  { id: 's13', name: 'Кюсюр', coords: [127.87, 70.68], distanceToMouth: 250 },
  { id: 's-sikt', name: 'Сиктях', coords: [128.40, 71.15], distanceToMouth: 130 },
  { id: 's-khabar', name: 'Хабарова', coords: [126.85, 72.10], distanceToMouth: 50 },
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
