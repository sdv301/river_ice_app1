import { lineString, point, length as turfLength, lineSliceAlong, nearestPointOnLine, featureCollection, along } from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import { lenaRiverFeature } from './riverData';

/** Ледостав севернее нижней кромки — белый, чтобы не путать со свободной водой. */
export const ICE_COVER_COLOR = '#ffffff';

export function riverLocationKm(coords: [number, number]): number {
  const snap = nearestPointOnLine(lenaRiverFeature, point(coords), { units: 'kilometers' });
  return snap.properties?.location ?? 0;
}

/** Точка на оси Лены по пройденному расстоянию от устья (км). */
export function coordsAtRiverKm(km: number): [number, number] {
  const line = lenaRiverFeature;
  const totalLength = turfLength(line, { units: 'kilometers' });
  const clamped = Math.max(0, Math.min(km, totalLength));
  const at = along(line, clamped, { units: 'kilometers' });
  return at.geometry.coordinates as [number, number];
}

export interface EdgePair {
  upperEdgeCoords: [number, number];
  lowerEdgeCoords: [number, number];
  upperSettlement?: string;
  lowerSettlement?: string;
}

/** Upper edge = smaller km along river (upstream / south on Lena). */
export function normalizeEdgeOrder<T extends EdgePair>(obs: T): T {
  const upperKm = riverLocationKm(obs.upperEdgeCoords);
  const lowerKm = riverLocationKm(obs.lowerEdgeCoords);
  if (upperKm <= lowerKm) return obs;
  return {
    ...obs,
    upperEdgeCoords: obs.lowerEdgeCoords,
    lowerEdgeCoords: obs.upperEdgeCoords,
    upperSettlement: obs.lowerSettlement,
    lowerSettlement: obs.upperSettlement,
  };
}

export function interpolateAlongRiver(c1: [number, number], c2: [number, number], progress: number): [number, number] {
  const line = lenaRiverFeature;
  const p1 = point(c1);
  const p2 = point(c2);

  const snap1 = nearestPointOnLine(line, p1, { units: 'kilometers' });
  const snap2 = nearestPointOnLine(line, p2, { units: 'kilometers' });

  const dist1 = snap1.properties.location ?? 0;
  const dist2 = snap2.properties.location ?? 0;

  const targetDist = dist1 + (dist2 - dist1) * progress;
  const interpolated = along(line, targetDist, { units: 'kilometers' });
  
  return interpolated.geometry.coordinates as [number, number];
}

export function snapToRiver(coords: [number, number]): [number, number] {
  const line = lenaRiverFeature;
  const p = point(coords);
  const snap = nearestPointOnLine(line, p, { units: 'kilometers' });
  return snap.geometry.coordinates as [number, number];
}

export function getRiverDistance(c1: [number, number], c2: [number, number]): number {
  return Math.abs(getSignedRiverDistance(c1, c2));
}

/** Positive when moving downstream (south → north on Lena). */
export function getSignedRiverDistance(c1: [number, number], c2: [number, number]): number {
  return riverLocationKm(c2) - riverLocationKm(c1);
}

/** Downstream travel (km) of the drift band between two observations (south → north). */
export function getIceDriftDistanceKm(
  before: { upperEdgeCoords: [number, number]; lowerEdgeCoords: [number, number] },
  after: { upperEdgeCoords: [number, number]; lowerEdgeCoords: [number, number] },
): number | null {
  const upper = getSignedRiverDistance(before.upperEdgeCoords, after.upperEdgeCoords);
  const lower = getSignedRiverDistance(before.lowerEdgeCoords, after.lowerEdgeCoords);
  const moves = [upper, lower].filter((d) => d > 0);
  if (moves.length === 0) return null;
  return moves.reduce((sum, d) => sum + d, 0) / moves.length;
}

export function getSegments(upperEdge: [number, number] | null, lowerEdge: [number, number] | null): Feature<LineString>[] {
  const line = lenaRiverFeature;
  const totalLength = turfLength(line, { units: 'kilometers' });

  if (!upperEdge && !lowerEdge) {
    return [{
      ...line,
      properties: { ...line.properties, color: '#94a3b8', status: 'baseline' },
    }];
  }

  const segments: Feature<LineString>[] = [];
  
  let upperDist = 0;
  if (upperEdge) {
    upperDist = riverLocationKm(upperEdge);
  }

  let lowerDist = totalLength;
  if (lowerEdge) {
    lowerDist = riverLocationKm(lowerEdge);
  }

  if (upperDist > lowerDist) {
    const temp = upperDist;
    upperDist = lowerDist;
    lowerDist = temp;
  }

  // Upstream (south): open water before the drift front
  if (upperDist > 0) {
    const waterSeg = lineSliceAlong(line, 0, upperDist, { units: 'kilometers' });
    waterSeg.properties = { ...line.properties, color: '#1d4ed8', status: 'water' };
    segments.push(waterSeg);
  }

  // Active drift between upper (head) and lower (tail) edges
  if (lowerDist > upperDist) {
    const driftSeg = lineSliceAlong(line, upperDist, lowerDist, { units: 'kilometers' });
    driftSeg.properties = { ...line.properties, color: '#38bdf8', status: 'drift' };
    segments.push(driftSeg);
  }

  // Downstream (north): solid ice cover behind the drift tail
  if (lowerDist < totalLength) {
    const iceSeg = lineSliceAlong(line, lowerDist, totalLength, { units: 'kilometers' });
    iceSeg.properties = { ...line.properties, color: ICE_COVER_COLOR, status: 'ice' };
    segments.push(iceSeg);
  }

  return segments;
}

export function generateGeoJSONSource(segments: Feature<LineString>[]) {
  return featureCollection(segments);
}
