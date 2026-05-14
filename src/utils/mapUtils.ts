import { lineString, point, length as turfLength, lineSliceAlong, nearestPointOnLine, featureCollection, along } from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import { lenaRiverFeature } from './riverData';

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
  const line = lenaRiverFeature;
  const snap1 = nearestPointOnLine(line, point(c1), { units: 'kilometers' });
  const snap2 = nearestPointOnLine(line, point(c2), { units: 'kilometers' });
  const dist1 = snap1.properties.location ?? 0;
  const dist2 = snap2.properties.location ?? 0;
  return Math.abs(dist2 - dist1);
}

type EdgePair = { upperEdgeCoords: [number, number]; lowerEdgeCoords: [number, number] };

const KM_EPS = 0.02;

function driftKmIntervalOnRiver(upper: [number, number], lower: [number, number]): [number, number] | null {
  const line = lenaRiverFeature;
  const u = nearestPointOnLine(line, point(upper), { units: 'kilometers' }).properties.location ?? 0;
  const l = nearestPointOnLine(line, point(lower), { units: 'kilometers' }).properties.location ?? 0;
  const lo = Math.min(u, l);
  const hi = Math.max(u, l);
  if (hi - lo < KM_EPS) return null;
  return [lo, hi];
}

function mergeDriftIntervalsKm(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (!last || a > last[1] + KM_EPS) {
      out.push([a, b]);
    } else {
      last[1] = Math.max(last[1], b);
    }
  }
  return out;
}

/**
 * Несколько наблюдений за один календарный день (разные участки) —
 * объединяем интервалы «ледоход» вдоль русла, чтобы не смешивать кромки
 * разных широт через интерполяцию по времени.
 */
export function getMergedSegmentsForObservations(pairs: EdgePair[]): Feature<LineString>[] {
  if (pairs.length === 0) return [];
  if (pairs.length === 1) {
    return getSegments(pairs[0].upperEdgeCoords, pairs[0].lowerEdgeCoords);
  }
  const intervals: [number, number][] = [];
  for (const p of pairs) {
    const iv = driftKmIntervalOnRiver(p.upperEdgeCoords, p.lowerEdgeCoords);
    if (iv) intervals.push(iv);
  }
  const merged = mergeDriftIntervalsKm(intervals);
  if (merged.length === 0) {
    return getSegments(pairs[0].upperEdgeCoords, pairs[0].lowerEdgeCoords);
  }

  const line = lenaRiverFeature;
  const totalLength = turfLength(line, { units: 'kilometers' });
  const segments: Feature<LineString>[] = [];
  let pos = 0;
  for (const [dStart, dEnd] of merged) {
    if (dStart > pos + KM_EPS) {
      const waterSeg = lineSliceAlong(line, pos, dStart, { units: 'kilometers' });
      waterSeg.properties = { ...line.properties, color: '#1d4ed8', status: 'water' };
      segments.push(waterSeg);
    }
    if (dEnd > dStart + KM_EPS) {
      const driftSeg = lineSliceAlong(line, dStart, dEnd, { units: 'kilometers' });
      driftSeg.properties = { ...line.properties, color: '#38bdf8', status: 'drift' };
      segments.push(driftSeg);
    }
    pos = Math.max(pos, dEnd);
  }
  if (pos < totalLength - KM_EPS) {
    const iceSeg = lineSliceAlong(line, pos, totalLength, { units: 'kilometers' });
    iceSeg.properties = { ...line.properties, color: '#cbd5e1', status: 'ice' };
    segments.push(iceSeg);
  }
  return segments;
}

export function getSegments(upperEdge: [number, number] | null, lowerEdge: [number, number] | null): Feature<LineString>[] {
  const line = lenaRiverFeature;
  const totalLength = turfLength(line, { units: 'kilometers' });

  if (!upperEdge && !lowerEdge) {
    // No observations yet: render the full river with a neutral visible color.
    return [{
      ...line,
      properties: { ...line.properties, color: '#60a5fa', status: 'no-data' }
    }];
  }

  const segments: Feature<LineString>[] = [];
  
  let upperDist = 0;
  if (upperEdge) {
    const pt = point(upperEdge);
    const snapped = nearestPointOnLine(line, pt, { units: 'kilometers' });
    upperDist = snapped.properties.location ?? 0;
  }

  let lowerDist = totalLength;
  if (lowerEdge) {
    const pt = point(lowerEdge);
    const snapped = nearestPointOnLine(line, pt, { units: 'kilometers' });
    lowerDist = snapped.properties.location ?? totalLength;
  }

  // Ensure distances are ordered
  if (upperDist > lowerDist) {
    const temp = upperDist;
    upperDist = lowerDist;
    lowerDist = temp;
  }

  // Segment 1: Water (0 to upperDist)
  if (upperDist > 0) {
    const waterSeg = lineSliceAlong(line, 0, upperDist, { units: 'kilometers' });
    waterSeg.properties = { ...line.properties, color: '#1d4ed8', status: 'water' }; // Deep Blue
    segments.push(waterSeg);
  }

  // Segment 2: Drift (upperDist to lowerDist)
  if (lowerDist > upperDist) {
    const driftSeg = lineSliceAlong(line, upperDist, lowerDist, { units: 'kilometers' });
    driftSeg.properties = { ...line.properties, color: '#38bdf8', status: 'drift' }; // Sky Blue
    segments.push(driftSeg);
  }

  // Segment 3: Ice (lowerDist to end)
  if (lowerDist < totalLength) {
    const iceSeg = lineSliceAlong(line, lowerDist, totalLength, { units: 'kilometers' });
    iceSeg.properties = { ...line.properties, color: '#cbd5e1', status: 'ice' }; // Slate 300 (visible on white)
    segments.push(iceSeg);
  }

  return segments;
}

export function generateGeoJSONSource(segments: Feature<LineString>[]) {
  return featureCollection(segments);
}
