/**
 * Проверка демо-архива 2025: порядок кромок и сегменты карты.
 * npx tsx scripts/verify-archive-2025.ts
 */
import { ARCHIVE_2025 } from '../src/store/iceStore.ts';
import { normalizeEdgeOrder } from '../shared/normalizeEdge.ts';
import {
  getSegments,
  getSignedRiverDistance,
  ICE_COVER_COLOR,
  riverLocationKm,
} from '../src/utils/mapUtils.ts';
import { utcCalendarDay } from '../src/utils/calendarDay.ts';

let errors = 0;
let warns = 0;

for (const raw of ARCHIVE_2025) {
  const obs = normalizeEdgeOrder(raw);
  const day = utcCalendarDay(obs.date);
  const upperKm = riverLocationKm(obs.upperEdgeCoords);
  const lowerKm = riverLocationKm(obs.lowerEdgeCoords);
  const span = lowerKm - upperKm;
  const signed = getSignedRiverDistance(obs.upperEdgeCoords, obs.lowerEdgeCoords);
  const segments = getSegments(obs.upperEdgeCoords, obs.lowerEdgeCoords);
  const statuses = segments.map((s) => s.properties?.status).join(',');

  console.log(
    `${day} ${obs.locationName}: верх ${upperKm.toFixed(0)} км → низ ${lowerKm.toFixed(0)} км (фронт ${span.toFixed(0)} км) [${statuses}]`,
  );

  if (signed < 0) {
    console.error('  ERROR: нижняя кромка южнее верхней по руслу');
    errors++;
  }
  if (span < 1) {
    console.warn('  WARN: очень узкий фронт');
    warns++;
  }
  if (!segments.some((s) => s.properties?.status === 'drift')) {
    console.warn('  WARN: нет сегмента drift');
    warns++;
  }
  if (!segments.some((s) => s.properties?.color === ICE_COVER_COLOR)) {
    console.warn('  WARN: нет белого ледостава');
    warns++;
  }
}

console.log(`\nИтого: ${errors} ошибок, ${warns} предупреждений`);
process.exit(errors > 0 ? 1 : 0);
