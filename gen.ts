import { lineString, along, nearestPointOnLine, point, length as turfLength } from '@turf/turf';
import * as fs from 'fs';

const points = [
  { name: 'Витим', d: 2876 },
  { name: 'Пеледуй', d: 2852 },
  { name: 'Крестовский', d: 2818 },
  { name: 'Ярославский', d: 2754 },
  { name: 'Хамра', d: 2738 },
  { name: 'Ленск', d: 2665 },
  { name: 'Мурья', d: 2644 },
  { name: 'Салдыкель', d: 2611 },
  { name: 'Нюя', d: 2582 },
  { name: 'Турукта', d: 2565 },
  { name: 'Чапаево', d: 2508 },
  { name: 'Мача', d: 2468 },
  { name: 'Иннях', d: 2401 }
];

const raw = JSON.parse(fs.readFileSync('./src/utils/lena_coords.json', 'utf8'));
const line = lineString(raw);

const l = turfLength(line);
console.log('Total river length geom:', l);

// Vitim is at 2876
const vitimCoord = [112.56, 59.45];
const snapVitim = nearestPointOnLine(line, point(vitimCoord));
const vitimGeomDist = snapVitim.properties.location;
console.log('Vitim geom distance:', vitimGeomDist);

const lenskCoord = [114.92, 60.72];
const snapLensk = nearestPointOnLine(line, point(lenskCoord));
const lenskGeomDist = snapLensk.properties.location;
console.log('Lensk geom distance:', lenskGeomDist);

// Official diff between Vitim and Lensk is 2876 - 2665 = 211 km.
// Geom diff is lenskGeomDist - vitimGeomDist.
const geomDiff = lenskGeomDist - vitimGeomDist;
console.log('Geom diff:', geomDiff);

// So from Vitim (distance 2876), for any D:
// offset = 2876 - D
// geomOffset = offset * (geomDiff / 211)
// targetGeomDist = vitimGeomDist + geomOffset

for (const p of points) {
   const offset = 2876 - p.d;
   const geomOffset = offset * (geomDiff / 211);
   const targetGeom = vitimGeomDist + geomOffset;
   const pt = along(line, targetGeom);
   console.log(`{ id: 's_${p.name}', name: '${p.name}', coords: [${pt.geometry.coordinates[0].toFixed(3)}, ${pt.geometry.coordinates[1].toFixed(3)}], distanceToMouth: ${p.d} },`);
}
