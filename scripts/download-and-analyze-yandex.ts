/**
 * Скачивает Excel с публичной папки Яндекс.Диска, парсит и печатает отчёт по ошибкам.
 *
 *   npx tsx scripts/download-and-analyze-yandex.ts
 *   npx tsx scripts/download-and-analyze-yandex.ts ./internal-data
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { isHydrologyBulletinFile, isIceFile, isWaterFile } from '../shared/fileFilters.ts';
import { normalizeEdgeOrder } from '../shared/normalizeEdge.ts';
import {
  getSegments,
  getSignedRiverDistance,
  riverLocationKm,
} from '../src/utils/mapUtils.ts';
import { utcCalendarDay } from '../src/utils/calendarDay.ts';
import { DataProcessor } from '../server/dataProcessor.ts';

const YANDEX_PUBLIC_KEY =
  process.env.YANDEX_PUBLIC_KEY ?? 'https://disk.yandex.ru/d/LENyBdYBr2B3rA';
const YANDEX_API_BASE =
  process.env.YANDEX_API_BASE ?? 'https://cloud-api.yandex.net/v1/disk/public/resources';

const outDir = path.resolve(process.argv[2] ?? 'internal-data');

type YandexItem = {
  name: string;
  type: string;
  size: number;
  modified: string;
  file?: string;
};

async function listAllYandexFiles(): Promise<YandexItem[]> {
  const all: YandexItem[] = [];
  let offset = 0;
  const limit = 200;
  for (;;) {
    const url = `${YANDEX_API_BASE}?public_key=${encodeURIComponent(YANDEX_PUBLIC_KEY)}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Yandex list failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { _embedded?: { items?: YandexItem[] } };
    const items = data._embedded?.items ?? [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

function classifyFile(name: string): 'ice' | 'water' | 'bulletin' | 'skip' {
  const lower = name.toLowerCase();
  if (!/\.(xlsx|xls|csv)$/i.test(lower)) return 'skip';
  if (lower.includes('инструк') || lower.includes('шаблон')) return 'skip';
  if (isHydrologyBulletinFile(name)) return 'bulletin';
  if (isIceFile(name)) return 'ice';
  if (isWaterFile(name)) return 'water';
  return 'skip';
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  console.log('=== Загрузка с Яндекс.Диска ===');
  console.log('Папка:', YANDEX_PUBLIC_KEY);
  console.log('Каталог:', outDir);
  console.log('');

  const items = await listAllYandexFiles();
  const files = items.filter((i) => i.type === 'file' && /\.(xlsx|xls|csv)$/i.test(i.name));

  const downloadErrors: string[] = [];
  let downloaded = 0;
  let skippedSameSize = 0;

  for (const item of files) {
    const localPath = path.join(outDir, item.name);
    try {
      const stat = await fs.stat(localPath);
      if (stat.size === item.size) {
        skippedSameSize++;
        continue;
      }
    } catch {
      // new file
    }

    if (!item.file) {
      downloadErrors.push(`${item.name}: нет ссылки file в ответе API`);
      continue;
    }

    try {
      const res = await fetch(item.file);
      if (!res.ok) {
        downloadErrors.push(`${item.name}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(localPath, buf);
      downloaded++;
      console.log(`  скачан: ${item.name} (${(item.size / 1024).toFixed(0)} KB)`);
    } catch (e: unknown) {
      downloadErrors.push(`${item.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('');
  console.log(`Файлов в облаке: ${files.length}, скачано новых: ${downloaded}, без изменений: ${skippedSameSize}`);
  if (downloadErrors.length) {
    console.log(`Ошибок скачивания: ${downloadErrors.length}`);
    downloadErrors.forEach((e) => console.log('  [DL]', e));
  }

  console.log('\n=== Классификация файлов ===');
  const byKind: Record<string, string[]> = { ice: [], water: [], bulletin: [], skip: [] };
  for (const f of files) {
    byKind[classifyFile(f.name)].push(f.name);
  }
  for (const [kind, names] of Object.entries(byKind)) {
    console.log(`  ${kind}: ${names.length}`);
    names.slice(0, 8).forEach((n) => console.log(`    - ${n}`));
    if (names.length > 8) console.log(`    ... ещё ${names.length - 8}`);
  }

  console.log('\n=== Парсинг (DataProcessor) ===');
  const processor = new DataProcessor(outDir);
  await processor.processFiles(outDir);
  const { observations, levels } = processor.getData();
  const status = processor.getStatus(files.length);

  console.log(`  Наблюдений льда: ${observations.length}`);
  console.log(`  Записей уровней: ${levels.length}`);
  console.log(`  Предупреждений парсера: ${status.errors.length}`);

  const parseWarns = status.errors;
  const warnGroups = new Map<string, string[]>();
  for (const w of parseWarns) {
    let key = 'прочее';
    if (w.includes('вне ожидаемого диапазона')) key = 'координаты вне Лены';
    else if (w.includes('совпадают')) key = 'кромки совпадают';
    else if (w.includes('очень близко')) key = 'кромки слишком близко';
    else if (w.includes('Не удалось определить координаты')) key = 'нет координат кромок';
    else if (w.includes('перепутаны') || w.includes('порядок колонок')) key = 'lng/lat';
    if (!warnGroups.has(key)) warnGroups.set(key, []);
    warnGroups.get(key)!.push(w);
  }

  console.log('\n=== Группы предупреждений ===');
  for (const [key, list] of warnGroups) {
    console.log(`\n[${key}] (${list.length})`);
    list.slice(0, 5).forEach((line) => console.log(`  ${line}`));
    if (list.length > 5) console.log(`  ... ещё ${list.length - 5}`);
  }

  console.log('\n=== Проверка кромок для карты ===');
  let edgeErrors = 0;
  let edgeWarns = 0;
  const days = new Set<string>();

  for (const raw of observations) {
    const obs = normalizeEdgeOrder(raw);
    const day = utcCalendarDay(obs.date);
    days.add(day);
    const upperKm = riverLocationKm(obs.upperEdgeCoords);
    const lowerKm = riverLocationKm(obs.lowerEdgeCoords);
    const signed = getSignedRiverDistance(obs.upperEdgeCoords, obs.lowerEdgeCoords);
    const segments = getSegments(obs.upperEdgeCoords, obs.lowerEdgeCoords);
    const statuses = segments.map((s) => s.properties?.status);
    const label = obs.locationName || day;

    if (signed < 0) {
      edgeErrors++;
      console.log(`  [ERROR] ${day} ${label}: нижняя кромка южнее верхней (${signed.toFixed(1)} км)`);
    }
    if (lowerKm - upperKm < 5 && lowerKm - upperKm > 0) {
      edgeWarns++;
      console.log(`  [WARN] ${day} ${label}: узкий фронт ${(lowerKm - upperKm).toFixed(1)} км`);
    }
    const spanKm = lowerKm - upperKm;
    if (!statuses.includes('drift') && spanKm > 0.5) {
      edgeWarns++;
      console.log(`  [WARN] ${day} ${label}: нет полосы ледохода — ${statuses.join(',')}`);
    } else if (!statuses.includes('drift') && spanKm <= 0.5) {
      console.log(`  [INFO] ${day} ${label}: одна кромка (фронт ${spanKm.toFixed(1)} км) — ${statuses.join(',')}`);
    }
    if (!statuses.includes('ice')) {
      edgeWarns++;
      console.log(`  [WARN] ${day} ${label}: нет белого ледостава`);
    }
  }

  console.log(`\n  Уникальных дней с кромками: ${days.size}`);
  console.log(`  Ошибок геометрии: ${edgeErrors}, предупреждений: ${edgeWarns}`);

  console.log('\n=== Типичные причины и обход (как в приложении) ===');
  console.log(`
1. Координаты вне Лены / перепутаны Lat-Lng
   Причина: в Excel колонки «широта/долгота» переставлены или опечатка.
   Обход: inferLngLatPair + normalizeEdgeOrder; предупреждение в syncError; на карте — только дни с валидной сводкой.

2. «Нет координат кромок» (только название поселка)
   Причина: строка гидробюллетеня без пар Lat/Lng.
   Обход: подстановка координат из справочника SETTLEMENTS; если пункт не найден — строка пропускается.

3. Кромки совпадают / одна точка
   Причина: в файле указана только нижняя или верхняя кромка.
   Обход: allowCoincidentEdges — на карте одна точка, без голубой полосы (это ожидаемо).

4. Дни только с уровнями воды (без льда)
   Причина: гидрологическая сводка без кромок.
   Обход: день на шкале есть, но кромки на карте не рисуются (плашка в сайдбаре).

5. Смешение файлов «уровни» и «кромки»
   Причина: имя файла попадает в isWaterFile / isIceFile.
   Обход: fileFilters.ts — гидробюллетени и шаблоны отфильтрованы.

6. Docker / Tailwind «Cannot find native binding»
   Причина: npm optional deps на Alpine без linux-биндинга oxide.
   Обход: Dockerfile на node:20-bookworm-slim + @tailwindcss/oxide-linux-x64-gnu.
`);

  const reportPath = path.join(outDir, '_analysis_report.json');
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        yandexPublicKey: YANDEX_PUBLIC_KEY,
        filesOnCloud: files.length,
        downloaded,
        observationsCount: observations.length,
        levelsCount: levels.length,
        uniqueIceDays: [...days].sort(),
        downloadErrors,
        parseWarnings: parseWarns,
        warningGroups: Object.fromEntries(warnGroups),
        edgeErrors,
        edgeWarns,
      },
      null,
      2,
    ),
  );
  console.log(`\nОтчёт сохранён: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
