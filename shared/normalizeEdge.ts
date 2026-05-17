import { lineString, nearestPointOnLine, point } from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import LENA_COORDS from '../src/utils/lena_coords.json' with { type: 'json' };

const riverLine: Feature<LineString> = lineString(LENA_COORDS as [number, number][]);

export interface EdgeCoordsPair {
  upperEdgeCoords: [number, number];
  lowerEdgeCoords: [number, number];
  upperSettlement?: string;
  lowerSettlement?: string;
}

function riverKm(coords: [number, number]): number {
  const snap = nearestPointOnLine(riverLine, point(coords), { units: 'kilometers' });
  return snap.properties?.location ?? 0;
}

/** Upper edge = smaller km along river (upstream / south on Lena). */
export function normalizeEdgeOrder<T extends EdgeCoordsPair>(obs: T): T {
  const upperKm = riverKm(obs.upperEdgeCoords);
  const lowerKm = riverKm(obs.lowerEdgeCoords);
  if (upperKm <= lowerKm) return obs;
  return {
    ...obs,
    upperEdgeCoords: obs.lowerEdgeCoords,
    lowerEdgeCoords: obs.upperEdgeCoords,
    upperSettlement: obs.lowerSettlement,
    lowerSettlement: obs.upperSettlement,
  };
}

export function signedRiverKm(from: [number, number], to: [number, number]): number {
  return riverKm(to) - riverKm(from);
}
