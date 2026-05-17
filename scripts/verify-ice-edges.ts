/**
 * Проверка кромок: парсинг Excel → normalizeEdgeOrder → getSegments.
 * Запуск: npx tsx scripts/verify-ice-edges.ts [каталог с xlsx]
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { isHydrologyBulletinFile, isIceFile } from '../shared/fileFilters.ts';
import { normalizeEdgeOrder } from '../shared/normalizeEdge.ts';
import {
  extractDateFromFileName,
  parseIceRows,
  parseSheetRows,
} from '../src/utils/yandexDisk.ts';
import { length as turfLength } from '@turf/turf';
import { lenaRiverFeature } from '../src/utils/riverData.ts';
import {
  getSegments,
  getSignedRiverDistance,
  ICE_COVER_COLOR,
  riverLocationKm,
} from '../src/utils/mapUtils.ts';

const riverLengthKm = turfLength(lenaRiverFeature, { units: 'kilometers' });
import { utcCalendarDay } from '../src/utils/calendarDay.ts';

const dataDirs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['internal-data', path.join(process.cwd(), 'internal-data')];

type Issue = { severity: 'error' | 'warn'; message: string };

const issues: Issue[] = [];
let fileCount = 0;
let obsCount = 0;

function add(severity: Issue['severity'], message: string) {
  issues.push({ severity, message });
}

function listXlsx(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => /\.xlsx?$/i.test(n))
      .map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

const files = new Set<string>();
for (const d of dataDirs) {
  for (const f of listXlsx(path.resolve(d))) files.add(f);
}

if (files.size === 0) {
  console.error('Нет xlsx в:', dataDirs.join(', '));
  process.exit(1);
}

for (const absolutePath of [...files].sort()) {
  const fileName = path.basename(absolutePath);
  if (!isIceFile(fileName) || isHydrologyBulletinFile(fileName)) continue;
  fileCount++;

  const buf = fs.readFileSync(absolutePath);
  const wb = XLSX.read(buf);
  const rows = parseSheetRows(wb.Sheets[wb.SheetNames[0]]);
  const warnings: string[] = [];
  const parsed = parseIceRows(rows, fileName, undefined, warnings);

  for (const w of warnings) {
    add('warn', w);
  }

  for (const raw of parsed) {
    obsCount++;
    const obs = normalizeEdgeOrder(raw);
    const day = utcCalendarDay(obs.date);
    const label = obs.locationName || fileName;

    const upperKm = riverLocationKm(obs.upperEdgeCoords);
    const lowerKm = riverLocationKm(obs.lowerEdgeCoords);
    const signedKm = getSignedRiverDistance(obs.upperEdgeCoords, obs.lowerEdgeCoords);
    const geoDist = Math.hypot(
      obs.upperEdgeCoords[0] - obs.lowerEdgeCoords[0],
      obs.upperEdgeCoords[1] - obs.lowerEdgeCoords[1],
    );

    if (upperKm > lowerKm + 0.01) {
      add('error', `${day} ${label}: upperKm (${upperKm.toFixed(1)}) > lowerKm (${lowerKm.toFixed(1)}) после normalize`);
    }
    if (signedKm < 0) {
      add('error', `${day} ${label}: отрицательное направление вниз по реке (${signedKm.toFixed(1)} км)`);
    }

    const coincident = geoDist < 1e-6;
    const narrow = !coincident && lowerKm - upperKm < 5;
    if (coincident) {
      add(
        'warn',
        `${day} ${label}: кромки совпадают (одна точка в файле) — на карте не будет голубой полосы ледохода, только вода ± буфер`,
      );
    } else if (narrow) {
      add(
        'warn',
        `${day} ${label}: узкий фронт льда ${(lowerKm - upperKm).toFixed(1)} км по реке — полоса ледохода может быть почти незаметна`,
      );
    }

    const segments = getSegments(obs.upperEdgeCoords, obs.lowerEdgeCoords);
    const statuses = segments.map((s) => s.properties?.status);
    const colors = segments.map((s) => s.properties?.color);

    if (!statuses.includes('drift') && !coincident) {
      add('warn', `${day} ${label}: нет сегмента drift (ледоход) — ${statuses.join(', ')}`);
    }
    if (!statuses.includes('water')) {
      add('error', `${day} ${label}: нет сегмента воды (южнее верхней кромки)`);
    }
    if (!statuses.includes('ice') && lowerKm < riverLengthKm - 1) {
      add('error', `${day} ${label}: нет белого сегмента ледостава (севернее нижней кромки)`);
    }
    if (statuses.includes('ice') && !colors.includes(ICE_COVER_COLOR)) {
      add('warn', `${day} ${label}: ледостав не #ffffff — ${colors.filter((c) => c === ICE_COVER_COLOR)}`);
    }
    if (colors.includes('#cbd5e1')) {
      add('warn', `${day} ${label}: устаревший серый цвет льда — ожидается #ffffff`);
    }

    const driftLen = lowerKm - upperKm;
    const waterDown = segments.find((s) => s.properties?.status === 'water' && s.properties?.color === '#1d4ed8');
    if (driftLen > 1 && !statuses.includes('drift')) {
      add('error', `${day} ${label}: фронт ${driftLen.toFixed(0)} км, но сегмент drift отсутствует`);
    }
  }
}

const errors = issues.filter((i) => i.severity === 'error');
const warns = issues.filter((i) => i.severity === 'warn');

console.log(`\n=== Проверка кромок ===`);
console.log(`Файлов льда: ${fileCount}, наблюдений: ${obsCount}`);
console.log(`Ошибок: ${errors.length}, предупреждений: ${warns.length}\n`);

for (const i of errors) console.log(`[ERROR] ${i.message}`);
for (const i of warns) console.log(`[WARN]  ${i.message}`);

if (obsCount === 0) {
  console.log('\nНет наблюдений с координатами кромок — визуализация будет пустой.');
}

console.log(`
Ожидаемая раскраска реки (с юга на север по течению):
  синий #1d4ed8 — чистая вода (южнее верхней кромки)
  голубой #38bdf8 — ледоход между кромками
  белый #ffffff — ледостав (севернее нижней кромки)
  точки: верхняя кромка (светло-синяя), нижняя (серая)
`);

process.exit(errors.length > 0 ? 1 : 0);
