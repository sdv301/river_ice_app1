import type { IceObservation } from '../types';
import { utcCalendarDay, utcNoonDate } from './calendarDay';
import { coordsAtRiverKm, interpolateAlongRiver, normalizeEdgeOrder, riverLocationKm } from './mapUtils';

export type ResolvedIceObservation = IceObservation & {
  exact: boolean;
  estimated?: boolean;
};

const COINCIDENT_GEO_EPS = 1e-5;
const MIN_DRIFT_SPAN_KM = 8;

export function isCoincidentObservation(obs: {
  upperEdgeCoords: [number, number];
  lowerEdgeCoords: [number, number];
}): boolean {
  const [uLng, uLat] = obs.upperEdgeCoords;
  const [lLng, lLat] = obs.lowerEdgeCoords;
  return Math.hypot(uLng - lLng, uLat - lLat) < COINCIDENT_GEO_EPS;
}

export function hasDriftSpan(obs: {
  upperEdgeCoords: [number, number];
  lowerEdgeCoords: [number, number];
}): boolean {
  if (isCoincidentObservation(obs)) return false;
  const upperKm = riverLocationKm(obs.upperEdgeCoords);
  const lowerKm = riverLocationKm(obs.lowerEdgeCoords);
  return lowerKm - upperKm >= MIN_DRIFT_SPAN_KM;
}

/** Дни, по которым в сводке есть полоса ледохода (две разнесённые кромки). */
export function iceBulletinDays(observations: IceObservation[]): string[] {
  return observationsForRiverInterpolation(observations)
    .filter(hasDriftSpan)
    .map((o) => utcCalendarDay(o.date))
    .sort();
}

const ICE_SEASON_START = (year: number) => `${year}-05-01`;
const ICE_SEASON_END = (year: number) => `${year}-06-30`;

/**
 * Границы непрерывной временной шкалы: по одному шагу на календарный день.
 * 2025 (архив): весь сезон 1 мая — 30 июня (~61 день), кромки интерполируются между сводками.
 * 2026: с первого до последнего дня, по которым есть данные в базе (без пустых дат до 8 мая).
 */
export function timelineNavigationBounds(
  observations: IceObservation[],
  year: number,
  coverageDays: string[] = [],
): { minDate: Date; maxDate: Date; observationDays: string[] } {
  const seasonStart = ICE_SEASON_START(year);
  const seasonEnd = ICE_SEASON_END(year);

  const edgeObs = observationsForRiverInterpolation(observations).filter((o) =>
    utcCalendarDay(o.date).startsWith(`${year}-`),
  );
  const observationDays = [...new Set(edgeObs.map((o) => utcCalendarDay(o.date)))].sort();
  const yearCoverage = coverageDays.filter((d) => d.startsWith(`${year}-`)).sort();

  let minDay: string;
  let maxDay: string;

  if (year === 2025) {
    minDay = seasonStart;
    maxDay = seasonEnd;
  } else {
    const dataDays = yearCoverage.length > 0 ? yearCoverage : observationDays;
    if (dataDays.length === 0) {
      minDay = seasonStart;
      maxDay = seasonEnd;
    } else {
      minDay = dataDays[0];
      maxDay = dataDays[dataDays.length - 1];
    }
  }

  if (minDay < seasonStart) minDay = seasonStart;
  if (maxDay > seasonEnd) maxDay = seasonEnd;

  return { minDate: utcNoonDate(minDay), maxDate: utcNoonDate(maxDay), observationDays };
}

/** Одна сводка кромок на календарный день (без точек «только явление»). */
export function observationsForRiverInterpolation(observations: IceObservation[]): IceObservation[] {
  const byDay = new Map<string, IceObservation>();
  for (const obs of observations) {
    if (obs.phenomenonOnly) continue;
    const day = utcCalendarDay(obs.date);
    const prev = byDay.get(day);
    if (!prev) {
      byDay.set(day, obs);
      continue;
    }
    const span = (o: IceObservation) =>
      Math.abs(riverLocationKm(o.lowerEdgeCoords) - riverLocationKm(o.upperEdgeCoords));
    if (span(obs) > span(prev)) byDay.set(day, obs);
  }
  return [...byDay.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Кромки на произвольную дату/время: факт в день сводки или сдвиг вдоль русла между соседними сводками.
 */
export function interpolateObservationForTime(
  observations: IceObservation[],
  currentDate: string,
): ResolvedIceObservation | null {
  const sorted = observationsForRiverInterpolation(observations);
  if (sorted.length === 0) return null;

  const targetTime = new Date(currentDate).getTime();
  let before = sorted[0];
  let after = sorted[sorted.length - 1];

  if (targetTime <= new Date(before.date).getTime()) {
    return { ...normalizeEdgeOrder(before), exact: true, date: currentDate };
  }
  if (targetTime >= new Date(after.date).getTime()) {
    return { ...normalizeEdgeOrder(after), exact: true, date: currentDate };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const time1 = new Date(sorted[i].date).getTime();
    const time2 = new Date(sorted[i + 1].date).getTime();
    if (targetTime >= time1 && targetTime <= time2) {
      before = sorted[i];
      after = sorted[i + 1];
      break;
    }
  }

  const time1 = new Date(before.date).getTime();
  const time2 = new Date(after.date).getTime();
  const progress = time2 === time1 ? 0 : (targetTime - time1) / (time2 - time1);

  return normalizeEdgeOrder({
    id: before.id,
    date: currentDate,
    locationName: [before.locationName, after.locationName].filter(Boolean).join(' → ') || 'Ледоход',
    upperEdgeCoords: interpolateAlongRiver(before.upperEdgeCoords, after.upperEdgeCoords, progress),
    lowerEdgeCoords: interpolateAlongRiver(before.lowerEdgeCoords, after.lowerEdgeCoords, progress),
    notes: before.notes,
    exact: false,
  });
}

function isPhenomenonOnly(obs: IceObservation): boolean {
  return Boolean((obs as IceObservation & { phenomenonOnly?: boolean }).phenomenonOnly);
}

function edgeCandidates(observations: IceObservation[]): IceObservation[] {
  return observations.filter((o) => !isPhenomenonOnly(o));
}

function sortByDate(observations: IceObservation[]): IceObservation[] {
  return [...observations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function interpolateBetween(
  before: IceObservation,
  after: IceObservation,
  targetDay: string,
): ResolvedIceObservation {
  const t0 = utcNoonMs(before);
  const t1 = utcNoonMs(after);
  const tt = Date.parse(`${targetDay}T12:00:00.000Z`);
  const frac = t1 === t0 ? 0.5 : Math.max(0, Math.min(1, (tt - t0) / (t1 - t0)));

  const u0 = riverLocationKm(before.upperEdgeCoords);
  const l0 = riverLocationKm(before.lowerEdgeCoords);
  const u1 = riverLocationKm(after.upperEdgeCoords);
  const l1 = riverLocationKm(after.lowerEdgeCoords);

  const upperKm = u0 + (u1 - u0) * frac;
  const lowerKm = l0 + (l1 - l0) * frac;

  const ordered = normalizeEdgeOrder({
    upperEdgeCoords: coordsAtRiverKm(upperKm),
    lowerEdgeCoords: coordsAtRiverKm(lowerKm),
  });

  const dayRu = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7);

  return {
    ...before,
    id: `est-${targetDay}`,
    date: `${targetDay}T12:00:00.000Z`,
    upperEdgeCoords: ordered.upperEdgeCoords,
    lowerEdgeCoords: ordered.lowerEdgeCoords,
    locationName: `оценка (${dayRu(utcCalendarDay(before.date))}–${dayRu(utcCalendarDay(after.date))})`,
    notes: 'Кромки оценены по соседним сводкам (в файле за этот день нет двух геоточек кромок).',
    exact: false,
    estimated: true,
  };
}

function utcNoonMs(obs: IceObservation | { date: string }): number {
  const day = utcCalendarDay(obs.date);
  return Date.parse(`${day}T12:00:00.000Z`);
}

function findSpanNeighbors(
  sorted: IceObservation[],
  targetDay: string,
): { before: IceObservation | null; after: IceObservation | null } {
  const withSpan = sorted.filter(hasDriftSpan);
  let before: IceObservation | null = null;
  let after: IceObservation | null = null;
  for (const obs of withSpan) {
    const day = utcCalendarDay(obs.date);
    if (day <= targetDay) before = obs;
    if (day >= targetDay && !after) after = obs;
  }
  return { before, after };
}

function nearestSpanObservation(
  sorted: IceObservation[],
  targetDay: string,
  maxDays = 7,
): IceObservation | null {
  const withSpan = sorted.filter(hasDriftSpan);
  if (withSpan.length === 0) return null;
  const targetMs = Date.parse(`${targetDay}T12:00:00.000Z`);
  let best: IceObservation | null = null;
  let bestDiff = Infinity;
  for (const obs of withSpan) {
    const diff = Math.abs(utcNoonMs(obs) - targetMs) / (86400000);
    if (diff <= maxDays && diff < bestDiff) {
      bestDiff = diff;
      best = obs;
    }
  }
  return best;
}

/**
 * Кромки для выбранного дня: факт из БД, интерполяция между соседними сводками или ближайшая полоса ледохода.
 */
export function resolveObservationForDay(
  observations: IceObservation[],
  currentDate: string,
): ResolvedIceObservation | null {
  if (observations.length === 0) return null;

  const targetDay = utcCalendarDay(currentDate);
  const sorted = sortByDate(observations);
  const onDay = sorted.filter((o) => utcCalendarDay(o.date) === targetDay);
  const edgeOnDay = edgeCandidates(onDay);

  const withSpan = edgeOnDay.find(hasDriftSpan);
  if (withSpan) {
    return { ...withSpan, exact: true };
  }

  const { before, after } = findSpanNeighbors(edgeCandidates(sorted), targetDay);
  if (before && after && utcCalendarDay(before.date) !== utcCalendarDay(after.date)) {
    return interpolateBetween(before, after, targetDay);
  }
  if (before && hasDriftSpan(before) && utcCalendarDay(before.date) === targetDay) {
    return { ...before, exact: true };
  }
  if (after && hasDriftSpan(after) && utcCalendarDay(after.date) === targetDay) {
    return { ...after, exact: true };
  }
  if (before && after) {
    return interpolateBetween(before, after, targetDay);
  }

  const nearest = nearestSpanObservation(edgeCandidates(sorted), targetDay);
  if (nearest) {
    const ordered = normalizeEdgeOrder({
      upperEdgeCoords: nearest.upperEdgeCoords,
      lowerEdgeCoords: nearest.lowerEdgeCoords,
    });
    const refDay = utcCalendarDay(nearest.date);
    return {
      ...nearest,
      id: `near-${targetDay}`,
      date: `${targetDay}T12:00:00.000Z`,
      upperEdgeCoords: ordered.upperEdgeCoords,
      lowerEdgeCoords: ordered.lowerEdgeCoords,
      locationName: nearest.locationName || `по сводке ${refDay.slice(8, 10)}.${refDay.slice(5, 7)}`,
      notes: 'Кромки перенесены с ближайшей сводки с двумя геоточками (за выбранный день в файле координат кромок нет).',
      exact: false,
      estimated: true,
    };
  }

  const coincident = edgeOnDay.find(isCoincidentObservation);
  if (coincident) {
    return null;
  }

  return null;
}
