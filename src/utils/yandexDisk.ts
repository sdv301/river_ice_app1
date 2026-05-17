import * as XLSX from 'xlsx';
import type { WaterLevelStation } from '../store/waterLevelStore';
import { parseExcelData } from './excelParser';
import { SETTLEMENTS } from './riverData';
import { normalizeEdgeOrder, riverLocationKm } from './mapUtils';
import {
  DATA_SOURCE_MODE,
  INTERNAL_DATA_API_BASE,
} from '../config/runtimeConfig';

/** Публичная папка Яндекс.Диска: список и скачивание идут через same-origin `/api/yandex/*` (сервер ходит в Яндекс). */
const usePublicYandexDisk = (): boolean => DATA_SOURCE_MODE === 'yandex';

const ensureDataSourceEnabled = () => {
  if (DATA_SOURCE_MODE === 'none') {
    throw new Error('Синхронизация отключена политикой безопасности (VITE_DATA_SOURCE=none)');
  }
};

export interface YandexFile {
  name: string;
  path: string;
  size: number;
  created: string;
  modified: string;
  mime_type: string;
  file?: string; // direct download link
}

export interface FetchIceDataOptions {
  onlyNewerThan?: string | null;
}

/**
 * List all files in the public Yandex Disk folder
 */
export async function listYandexFiles(): Promise<YandexFile[]> {
  ensureDataSourceEnabled();
  const url = usePublicYandexDisk()
    ? `${INTERNAL_DATA_API_BASE}/yandex/list?limit=100`
    : `${INTERNAL_DATA_API_BASE}/disk/files?limit=100`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ошибка получения списка файлов: ${response.status}`);
  }
  
  const data = await response.json();
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
      ? data.items
      : data._embedded?.items || [];
  
  // Filter for Excel files only (Yandex API uses type === 'file'; internal API omits type before server fix)
  const isFile = (item: any) => item.type === 'file' || item.type === undefined || item.type === null;
  return items
    .filter(
      (item: any) =>
        isFile(item) &&
        typeof item.name === 'string' &&
        (item.name.endsWith('.xlsx') || item.name.endsWith('.xls') || item.name.endsWith('.csv')),
    )
    .map((item: any) => ({
      name: item.name,
      path: item.path,
      size: item.size,
      created: item.created,
      modified: item.modified,
      mime_type: item.mime_type || '',
      file: item.file || null,
    }));
}

/**
 * Same-origin URL to download file bytes (локальный каталог или прокси Яндекс через internal-data-api).
 */
export function getDiskFileFetchUrl(filePath: string): string {
  ensureDataSourceEnabled();
  if (!usePublicYandexDisk()) {
    return `${INTERNAL_DATA_API_BASE}/disk/file?path=${encodeURIComponent(filePath)}`;
  }
  return `${INTERNAL_DATA_API_BASE}/yandex/file?path=${encodeURIComponent(filePath)}`;
}

/**
 * Download and parse an Excel file from Yandex Disk.
 * Returns raw parsed rows from the first sheet.
 */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreHeaderRow(row: unknown[]): number {
  const headers = row.map(normalizeHeader);
  let score = 0;
  if (headers.some((h) => h.includes('дата') || h === 'date')) score += 2;
  if (headers.some((h) => h.includes('верх'))) score += 2;
  if (headers.some((h) => h.includes('ниж') || h.includes('низ'))) score += 2;
  if (headers.some((h) => h.includes('lng') || h.includes('долгот'))) score += 1;
  if (headers.some((h) => h.includes('lat') || h.includes('широт'))) score += 1;
  if (headers.some((h) => h.includes('примеч'))) score += 1;
  if (headers.some((h) => h === 'река')) score += 2;
  if (headers.some((h) => h === 'пункт')) score += 2;

  // Penalise rows with many empty cells — category/merged headers
  // tend to have mostly empty cells, whereas real header rows are dense
  const emptyCount = headers.filter((h) => h === '').length;
  const emptyRatio = headers.length > 0 ? emptyCount / headers.length : 0;
  if (emptyRatio > 0.5) score -= 2;

  return score;
}

/**
 * Detect if the row immediately after `headerRowIndex` is a secondary header row
 * (e.g. "Широта | Долгота" sub-headers under a merged "Нижняя кромка" parent).
 * Returns the merged compound header names if detected, otherwise null.
 */
function tryMergeSecondaryHeaderRow(
  rows: unknown[][],
  headerRowIndex: number,
  primaryHeader: string[],
): string[] | null {
  const nextIdx = headerRowIndex + 1;
  if (nextIdx >= rows.length) return null;
  const next = rows[nextIdx].map((v) => String(v ?? '').trim());
  // Only merge if the secondary row has lat/lng keywords
  const nextLower = next.map((v) => v.toLowerCase());
  const hasLatLng = nextLower.some(
    (h) => h.includes('широт') || h.includes('долгот') || h.includes('lat') || h.includes('lng'),
  );
  if (!hasLatLng) return null;
  // Check that secondary row doesn't look like data (no numbers)
  const hasNumbers = next.some((v) => v !== '' && !isNaN(Number(v.replace(',', '.'))));
  if (hasNumbers) return null;

  // Merge: compound name = "Parent.Sub" for non-empty sub-cells; keep parent for empty sub
  const merged = primaryHeader.map((parent, idx) => {
    const sub = next[idx] ?? '';
    if (sub) return `${parent}.${sub}`;
    return parent;
  });
  return merged;
}

export function parseSheetRows(ws: XLSX.WorkSheet): any[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (rows.length === 0) return [];

  let headerRowIndex = 0;
  let bestScore = -1;
  const maxProbe = Math.min(rows.length, 8);

  for (let i = 0; i < maxProbe; i++) {
    const score = scoreHeaderRow(rows[i]);
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }

  const rawHeader = rows[headerRowIndex].map((v) => String(v ?? '').trim());
  const headerCounts = new Map<string, number>();
  const primaryHeader = rawHeader.map((h, idx) => {
    const base = h || `col_${idx}`;
    const count = (headerCounts.get(base) ?? 0) + 1;
    headerCounts.set(base, count);
    return count === 1 ? base : `${base}__${count}`;
  });

  // Detect two-row merged headers (e.g. "Нижняя кромка" / "Широта | Долгота")
  const mergedHeader = tryMergeSecondaryHeaderRow(rows, headerRowIndex, primaryHeader);
  const header = mergedHeader ?? primaryHeader;
  // If we used the secondary row as part of the header, skip it in data rows
  const dataStartRow = headerRowIndex + (mergedHeader ? 2 : 1);

  const out: any[] = [];
  for (let r = dataStartRow; r < rows.length; r++) {
    const values = rows[r];
    const obj: Record<string, unknown> = {};
    let hasData = false;
    for (let c = 0; c < header.length; c++) {
      const key = header[c] || `col_${c}`;
      const value = values?.[c];
      if (value !== '' && value !== null && value !== undefined) hasData = true;
      obj[key] = value;
      // Also store under compound sub-key for convenience lookup
      // e.g. "Нижняя кромка.Широта" → also store under "Нижняя кромка.Широта"
    }
    if (hasData) out.push(obj);
  }
  return out;
}

export async function downloadAndParseExcel(filePath: string): Promise<any[]> {
  const response = await fetch(getDiskFileFetchUrl(filePath));
  if (!response.ok) {
    throw new Error(`Ошибка скачивания файла: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  
  // Try to find a data sheet (skip instruction/reference sheets)
  const candidateNames = wb.SheetNames.filter((sheetName) => {
    const lowered = sheetName.toLowerCase();
    return !lowered.includes('инструк') && !lowered.includes('справ');
  });
  const sheetsToTry = candidateNames.length > 0 ? candidateNames : wb.SheetNames;

  let bestRows: any[] = [];
  for (const sheetName of sheetsToTry) {
    const rows = parseSheetRows(wb.Sheets[sheetName]);
    if (rows.length > bestRows.length) {
      bestRows = rows;
    }
  }

  return bestRows;
}

/**
 * Download all Excel files from Yandex Disk, parse them, 
 * and return consolidated ice observation data.
 */
export async function fetchAllIceData(options: FetchIceDataOptions = {}): Promise<{
  observations: ParsedObservation[];
  fileCount: number;
  totalFiles: number;
  hasNewFiles: boolean;
  latestModified: string | null;
  errors: string[];
}> {
  const errors: string[] = [];
  const allObservations: ParsedObservation[] = [];
  
  let files: YandexFile[];
  try {
    files = await listYandexFiles();
  } catch (e: any) {
    return {
      observations: [],
      fileCount: 0,
      totalFiles: 0,
      hasNewFiles: false,
      latestModified: null,
      errors: [e.message],
    };
  }
  
  if (files.length === 0) {
    return {
      observations: [],
      fileCount: 0,
      totalFiles: 0,
      hasNewFiles: false,
      latestModified: null,
      errors: ['Файлы не найдены в папке Яндекс.Диска'],
    };
  }

  const latestModified = files
    .map((f) => new Date(f.modified).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a)[0];

  const filteredFiles = options.onlyNewerThan
    ? files.filter((f) => new Date(f.modified).getTime() > new Date(options.onlyNewerThan as string).getTime())
    : files;

  if (filteredFiles.length === 0) {
    return {
      observations: [],
      fileCount: 0,
      totalFiles: files.length,
      hasNewFiles: false,
      latestModified: Number.isFinite(latestModified) ? new Date(latestModified).toISOString() : null,
      errors: [],
    };
  }
  
  for (const file of filteredFiles) {
    try {
      const rows = await downloadAndParseExcel(file.path);
      const fileWarnings: string[] = [];
      const parsed = parseIceRows(rows, file.name, file.modified, fileWarnings);
      allObservations.push(...parsed);
      errors.push(...fileWarnings);
    } catch (e: any) {
      errors.push(`${file.name}: ${e.message}`);
    }
  }
  
  return {
    observations: allObservations,
    fileCount: filteredFiles.length,
    totalFiles: files.length,
    hasNewFiles: true,
    latestModified: Number.isFinite(latestModified) ? new Date(latestModified).toISOString() : null,
    errors
  };
}

export interface ParsedObservation {
  date: string;
  locationName: string;
  upperEdgeCoords: [number, number];
  lowerEdgeCoords: [number, number];
  notes?: string;
  upperSettlement?: string;
  lowerSettlement?: string;
  phenomenonOnly?: boolean;
}

/**
 * Normalize coordinate pair in WGS-84 (longitude, latitude).
 * Returns null for invalid values.
 */
function normalizeWgs84Coords(lng: number | null, lat: number | null): [number, number] | null {
  if (lng === null || lat === null) return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  // Lena region plausibility check: prefer [lng, lat] when values fit the region
  const lenaLng = (v: number) => v >= 88 && v <= 155;
  const lenaLat = (v: number) => v >= 48 && v <= 78;

  if (lenaLng(lng) && lenaLat(lat)) return [lng, lat];
  // Swapped: lat provided first, lng second
  if (lenaLng(lat) && lenaLat(lng)) return [lat, lng];

  // Generic WGS-84 fallback
  if (lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) return [lng, lat];
  if (lat >= -180 && lat <= 180 && lng >= -90 && lng <= 90) return [lat, lng];

  return null;
}

/**
 * Known settlements with their geo-coordinates along the Lena river.
 * Used to resolve settlement names to coordinates in the Excel data.
 */
export const SETTLEMENT_COORDS: Record<string, [number, number]> = {
  // Upper reaches (Верховья)
  'Усть-Кут': [105.76, 56.80],
  'Осетрово': [105.74, 56.79],
  'Змеиново': [107.82, 57.73],
  'Киренск': [108.11, 57.77],
  'Дарьино': [108.40, 58.11],
  'Визирный': [109.18, 58.42],
  'Алексеевск': [110.42, 58.87],
  
  // Middle reaches (Средняя Лена)
  'Витим': [112.584, 59.449],
  'Пеледуй': [112.761, 59.612],
  'Крестовский': [113.208, 59.744],
  'Ярославский': [113.919, 60.162],
  'Хамра': [114.152, 60.223],
  'Ленск': [114.928, 60.709],
  'Мурья': [115.307, 60.729],
  'Салдыкель': [115.859, 60.680],
  'Нюя': [116.228, 60.527],
  'Турукта': [116.513, 60.475],
  'Чапаево': [117.097, 60.121],
  'Мача': [117.632, 59.901],
  'Иннях': [118.505, 59.814],
  'Олёкминск': [120.42, 60.37],
  'Олекминск': [120.42, 60.37],
  'Солянка': [120.65, 60.35],
  'Хатынг-Тумул': [121.25, 60.40],
  'Саныяхтат': [124.9, 60.85],
  'Синск': [125.30, 61.10],
  
  // Yakutsk area (Якутский узел)
  'Покровск': [129.13, 61.48],
  'Табага': [129.58, 61.85],
  'Якутск': [129.73, 62.03],
  'Кангалассы': [129.98, 62.33],
  'Намцы': [129.70, 62.70],
  'Графский Берег': [129.80, 62.15],
  'Жатай': [129.83, 62.15],
  'Маган': [129.67, 62.08],
  'Тулагино': [129.55, 62.12],
  'Хатассы': [129.64, 61.96],
  'Старая Табага': [129.55, 61.85],
  'Булгунняхтах': [129.46, 61.73],
  'Мохсоголлох': [129.32, 61.58],
  
  // Lower reaches (Нижняя Лена)
  'Сангар': [127.47, 63.92],
  'Сангары': [127.47, 63.92],
  'Жиганск': [123.39, 66.76],
  'Джарджан': [124.22, 68.74],
  'Кюсюр': [127.87, 70.68],
  'Хабарова': [126.85, 72.10],
  'Тикси': [128.86, 71.63],
  
  // Other tributaries / settlements
  'Батамай': [128.08, 63.20],
  'Булун': [127.92, 70.68],
  'Сиктях': [128.40, 71.15],

  // Витим river basin (Бассейн Витима)
  'Бодайбо': [114.19, 57.85],
  'Неляты': [113.28, 58.58],
  'Калакан': [116.39, 54.67],
  'Патома': [112.82, 59.28],
  'Романовка': [113.85, 58.30],
  'Березовка': [112.90, 59.35],  // Витим tributary near Бодайбо

  // Олёкма river basin (Бассейн Олёкмы)
  'Ср.Олёкма': [121.80, 57.60],
  'Средняя Олёкма': [121.80, 57.60],
  'Усть-Миль': [131.42, 60.08],  // Miyl river mouth, right tributary of Lena

  // Aldan river basin (Бассейн Алдана)
  'Белькачи': [135.93, 58.91],   // Aldan valley
  'Эльдикан': [135.63, 60.78],   // Aldan
  'Хандыга': [136.64, 62.65],    // Aldan
  'Джебарики Хая': [136.16, 61.93], // Aldan coal port
  'Охотский Перевоз': [133.92, 62.07], // Aldan
  'Кюпцы': [131.40, 61.58],      // Aldan lower
  'Мегино-Алдан': [130.55, 61.67], // Aldan mouth area
  'Кескил': [134.17, 62.50],     // Aldan
  'Чагда': [133.41, 60.97],      // Lena-Aldan junction area
  'Петропавловск': [132.90, 61.13], // Aldan basin
  'Эжанцы': [130.24, 62.13],     // Lena right bank below Yakutsk
  'Новый': [130.38, 62.68],      // Lena lower reaches
  'Крест-Хальджай': [131.15, 61.45], // Aldan lower

  // Maya river basin (Бассейн Маи)
  'Малыкай': [134.50, 60.80],    // Maya valley

  // Vilyuy river basin (Бассейн Вилюя)
  'Верхневилюйск': [120.32, 63.45],
  'Вилюйск': [121.62, 63.75],
  'Хатырык-Хомо': [122.12, 64.08], // Vilyuy

  // Lena main-stem observation points
  'Иннялы': [119.00, 60.00],
  'Комака': [116.00, 60.10],
  'Курум': [113.70, 59.85],

  // Гидробюллетень — доп. пункты (часто нет в SETTLEMENTS)
  'Дабан': [119.214, 60.132],
  'Исит': [125.326, 60.813],
  'Исить': [125.326, 60.813],
  'Кытыл-Дюра': [126.026, 60.97],
  'Кытыл Дюра': [126.026, 60.97],
  'Едей': [129.41, 62.51],
  'Едяй': [129.41, 62.51],
};

const INVALID_POINT_TOKENS = new Set([
  '',
  'n/a',
  'na',
  '-',
  '—',
  'по состоянию на',
  'по состоянию на:',
]);

const SETTLEMENT_ALIASES: Record<string, string> = {
  // Common spreadsheet variants/typos from operational bulletins
  'крестовское': 'Крестовский',
  'саныяхтах': 'Саныяхтат',
  '1-й нерюктяйинск': 'Нюя',
  '1 нерюктяйинск': 'Нюя',
  'дельгей': 'Солянка',
  'кыллах': 'Олёкминск',
  'хоринцы': 'Синск',
  'урицкое': 'Хатынг-Тумул',
  'исить': 'Исить',
  'исит': 'Исит',
};

function normalizeSettlementName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInvalidPointName(name: string): boolean {
  const normalized = normalizeSettlementName(name).replace(/[.:;]+$/g, '').trim();
  return INVALID_POINT_TOKENS.has(normalized);
}

/** Варианты названия из «Лена • Синск», «1 участок» и т.п. */
function settlementNameCandidates(name: string): string[] {
  const raw = String(name).trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim();
    const stripped = t.replace(/\d+\s*участок/gi, '').trim();
    for (const x of [t, stripped]) {
      if (x.length >= 2) seen.add(x);
    }
  };
  add(raw);
  for (const part of raw.split(/[•·|/]/)) add(part.trim());
  add(raw.replace(/^лена\s*[•·|]?\s*/i, '').trim());
  return [...seen];
}

const MIN_EDGE_SPAN_KM = 8;

function allSettlementCoords(): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<string>();
  const push = (c: [number, number]) => {
    const key = `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  for (const coords of Object.values(SETTLEMENT_COORDS)) push(coords);
  for (const s of SETTLEMENTS) push(s.coords);
  return out;
}

/** Ближайший н.п. выше или ниже по течению от точки на Лене. */
export function nearestSettlementAlongRiver(
  ref: [number, number],
  direction: 'upstream' | 'downstream',
): [number, number] | null {
  const refKm = riverLocationKm(ref);
  let best: [number, number] | null = null;
  let bestGap = Infinity;
  for (const coords of allSettlementCoords()) {
    const km = riverLocationKm(coords);
    const gap = direction === 'upstream' ? refKm - km : km - refKm;
    if (gap >= MIN_EDGE_SPAN_KM && gap < bestGap) {
      bestGap = gap;
      best = coords;
    }
  }
  return best;
}

/**
 * Одна точка в файле → вторая кромка по н.п. из «Пункт» или ближайшему по руслу.
 */
function expandSinglePointEdges(
  upper: [number, number],
  lower: [number, number],
  pointName?: string,
): { upper: [number, number]; lower: [number, number]; settlementNote?: string } {
  const ordered = normalizeEdgeOrder({ upperEdgeCoords: upper, lowerEdgeCoords: lower });
  let u = ordered.upperEdgeCoords;
  let l = ordered.lowerEdgeCoords;
  const span = riverLocationKm(l) - riverLocationKm(u);
  if (span >= MIN_EDGE_SPAN_KM) {
    return { upper: u, lower: l };
  }

  const ref = l;
  const refKm = riverLocationKm(ref);
  let settlement: [number, number] | null = null;
  if (pointName) {
    for (const candidate of settlementNameCandidates(pointName)) {
      settlement = resolveSettlementCoordsOne(candidate);
      if (settlement) break;
    }
  }

  if (settlement) {
    const sk = riverLocationKm(settlement);
    if (sk < refKm - 0.5) {
      return {
        upper: settlement,
        lower: ref,
        settlementNote: `верхняя кромка по н.п. ${pointName}`,
      };
    }
    if (sk > refKm + 0.5) {
      return {
        upper: ref,
        lower: settlement,
        settlementNote: `нижняя кромка по н.п. ${pointName}`,
      };
    }
  }

  const upstream = nearestSettlementAlongRiver(ref, 'upstream');
  if (upstream) {
    return {
      upper: upstream,
      lower: ref,
      settlementNote: 'верхняя кромка по ближайшему н.п. выше по течению',
    };
  }

  const downstream = nearestSettlementAlongRiver(ref, 'downstream');
  if (downstream) {
    return {
      upper: ref,
      lower: downstream,
      settlementNote: 'нижняя кромка по ближайшему н.п. ниже по течению',
    };
  }

  return { upper: u, lower: l };
}

function resolveSettlementCoordsOne(name: string): [number, number] | null {
  const normalized = String(name).trim();
  const normalizedKey = normalizeSettlementName(normalized);
  if (isInvalidPointName(normalizedKey)) return null;

  const aliased = SETTLEMENT_ALIASES[normalizedKey];
  if (aliased && SETTLEMENT_COORDS[aliased]) {
    return SETTLEMENT_COORDS[aliased];
  }

  if (SETTLEMENT_COORDS[normalized]) {
    return SETTLEMENT_COORDS[normalized];
  }

  for (const [key, coords] of Object.entries(SETTLEMENT_COORDS)) {
    if (normalizeSettlementName(key) === normalizedKey) return coords;
  }

  for (const [key, coords] of Object.entries(SETTLEMENT_COORDS)) {
    const normalizedCandidate = normalizeSettlementName(key);
    if (normalizedCandidate.includes(normalizedKey) || normalizedKey.includes(normalizedCandidate)) {
      return coords;
    }
  }

  const stem = normalizedKey
    .replace(/(ский|ское|ская|ские|ских|скому|ским|скои|ской)$/u, 'ск')
    .replace(/(ый|ий|ая|ое|ые|ой|ом|ам|ах)$/u, '')
    .trim();
  if (stem.length >= 4) {
    for (const [key, coords] of Object.entries(SETTLEMENT_COORDS)) {
      const candidate = normalizeSettlementName(key)
        .replace(/(ский|ское|ская|ские|ских|скому|ским|скои|ской)$/u, 'ск')
        .replace(/(ый|ий|ая|ое|ые|ой|ом|ам|ах)$/u, '')
        .trim();
      if (candidate.includes(stem) || stem.includes(candidate)) {
        return coords;
      }
    }
  }

  for (const s of SETTLEMENTS) {
    const sn = normalizeSettlementName(s.name);
    if (sn === normalizedKey) return s.coords;
  }
  for (const s of SETTLEMENTS) {
    const sn = normalizeSettlementName(s.name);
    if (sn.includes(normalizedKey) || normalizedKey.includes(sn)) return s.coords;
  }

  return null;
}

/**
 * Resolve a settlement name to coordinates.
 * Tries exact match first, then partial/fuzzy match.
 */
export function resolveSettlementCoords(name: string): [number, number] | null {
  if (!name) return null;
  for (const candidate of settlementNameCandidates(name)) {
    const coords = resolveSettlementCoordsOne(candidate);
    if (coords) return coords;
  }
  return null;
}

/**
 * Extract a date from a file name like
 * "Сведения на карту р. Лена 09.05.2026.xlsx" or
 * "Сведения в карту р. Лена (гидрология) на 08.05.2026 г..xlsx"
 */
export function extractDateFromFileName(fileName: string): string | null {
  // Match DD.MM.YYYY or DD,MM.YYYY (typo in some Yandex uploads)
  const match = fileName.match(/(\d{2})[.,](\d{2})[.,](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  
  let hour = '08';
  let minute = '00';
  
  // Try to match hour if present, like "14-00", "14:00"
  const timeMatch = fileName.match(/(?:в|на)?\s*(\d{1,2})[-:](\d{2})/i);
  if (timeMatch) {
    hour = timeMatch[1].padStart(2, '0');
    minute = timeMatch[2];
  } else {
    // try to match just hour like "14ч", "в 14 час"
    const hourOnlyMatch = fileName.match(/(?:в|на)?\s*(\d{1,2})\s*(?:ч|час)/i);
    if (hourOnlyMatch) {
      hour = hourOnlyMatch[1].padStart(2, '0');
    }
  }

  const dateStr = `${year}-${month}-${day}T${hour}:${minute}:00Z`;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Дата сводки только из имени файла (без «сегодня» и fileModified). */
export function bulletinDateISO(fileName: string): string | null {
  return extractDateFromFileName(fileName);
}

/**
 * Две ячейки из Excel (часто «широта» слева, «долгота» справа или наоборот) → [lng, lat] в WGS-84.
 * Если пара (a,b) как (долгота, широта) не попадает в район Лены, пробуем перестановку.
 */
function inferLngLatPair(a: number | null, b: number | null): [number, number] | null {
  if (a === null || b === null) return null;
  const lenaLng = (lng: number) => lng >= 88 && lng <= 155;
  const lenaLat = (lat: number) => lat >= 48 && lat <= 78;
  const plausible = (lng: number, lat: number) => lenaLng(lng) && lenaLat(lat);
  if (plausible(a, b)) return [a, b];
  if (plausible(b, a)) return [b, a];
  return normalizeWgs84Coords(a, b);
}

/**
 * При импорте с Яндекс.Диска: проверка, что координаты похожи на бассейн р. Лена.
 * Сообщения попадают в `errors` синхронизации (и в консоль при отладке).
 */
function collectIceCoordinateWarnings(
  fileName: string,
  rowIndex: number,
  label: string,
  upper: [number, number],
  lower: [number, number],
  options?: { allowCoincidentEdges?: boolean },
): string[] {
  const out: string[] = [];
  const rowLabel = (label || `строка ${rowIndex + 1}`).trim();
  const lngOk = (lng: number) => lng >= 95 && lng <= 150;
  const latOk = (lat: number) => lat >= 48 && lat <= 78;

  const check = (which: string, coords: [number, number]) => {
    const [lng, lat] = coords;
    if (!lngOk(lng) || !latOk(lat)) {
      out.push(
        `${fileName}: ${rowLabel} — ${which}: ${lng.toFixed(5)}° в.д., ${lat.toFixed(5)}° с.ш. вне ожидаемого диапазона для Лены (~95–150° и ~48–78°). Проверьте порядок колонок: сначала долгота (Lng), затем широта (Lat), без перестановки.`,
      );
    }
  };
  check('верхняя кромка', upper);
  check('нижняя кромка', lower);

  const d = Math.hypot(upper[0] - lower[0], upper[1] - lower[1]);
  if (d < 1e-6 && !options?.allowCoincidentEdges) {
    out.push(`${fileName}: ${rowLabel} — верхняя и нижняя кромка совпадают по координатам.`);
  } else if (d < 0.05 && !options?.allowCoincidentEdges) {
    out.push(
      `${fileName}: ${rowLabel} — верх и низ очень близко на карте (${(d * 111).toFixed(0)} км по прямой). Проверьте, что в файле две разные пары «широта/долгота» и что столбцы не перепутаны.`,
    );
  }
  return out;
}

/** Оперативная сводка «Сведения на карту»: много строк (Пункт + явления + пары Широта/Долгота). */
function isOperationalBulletinFormat(rows: any[]): boolean {
  if (rows.length === 0) return false;
  const keys = Object.keys(rows[0]);
  return keys.includes('Пункт') && (keys.includes('Широта') || keys.includes('Долгота'));
}

/**
 * Две пары «широта/долгота» в сводке: первая — нижняя кромка, вторая — верхняя
 * (колонки «Нижняя кромка лдх» / «Верхняя кромка лдх» или Широта + Широта__2).
 */
function extractLabeledLowerUpperPairs(row: any): {
  lower: [number, number] | null;
  upper: [number, number] | null;
} {
  const lower = inferLngLatPair(
    extractNum(row, ['Нижняя кромка.Долгота', 'Низ.Долгота', 'Долгота']),
    extractNum(row, ['Нижняя кромка.Широта', 'Низ.Широта', 'Широта']),
  );
  const upper = inferLngLatPair(
    extractNum(row, ['Верхняя кромка.Долгота', 'Верх.Долгота', 'Долгота__2', 'Долгота_2']),
    extractNum(row, ['Верхняя кромка.Широта', 'Верх.Широта', 'Широта__2', 'Широта_2']),
  );
  if (lower && upper) return { lower, upper };

  const lat2 = extractNum(row, ['Широта__2', 'Широта_2']);
  const lng2 = extractNum(row, ['Долгота__2', 'Долгота_2']);
  if (lower && lat2 !== null && lng2 !== null) {
    const upperFromSecond = inferLngLatPair(lng2, lat2);
    if (upperFromSecond) return { lower, upper: upperFromSecond };
  }

  return { lower: lower ?? null, upper: upper ?? null };
}

/** Кромки из одной строки оперативной сводки (две пары координат или одна). */
function extractOperationalRowEdges(row: any): {
  upper: [number, number];
  lower: [number, number];
  label: string;
  phenomenon: string;
  allowCoincident: boolean;
  fromFileCoords: boolean;
} | null {
  const pointName = extractStr(row, ['Пункт']);
  const phenomenon =
    extractStr(row, ['Явление', 'Phenomenon', 'phenomenon', 'Ледовые явления (примечания)']) || '';
  const label = pointName || phenomenon;

  const labeled = extractLabeledLowerUpperPairs(row);
  if (labeled.lower && labeled.upper) {
    const ordered = normalizeEdgeOrder({
      upperEdgeCoords: labeled.upper,
      lowerEdgeCoords: labeled.lower,
    });
    return {
      upper: ordered.upperEdgeCoords,
      lower: ordered.lowerEdgeCoords,
      label,
      phenomenon,
      allowCoincident: false,
      fromFileCoords: true,
    };
  }

  const opLng = extractNum(row, ['Долгота']);
  const opLat = extractNum(row, ['Широта']);
  const opLng2 = extractNum(row, ['Долгота__2', 'Долгота_2']);
  const opLat2 = extractNum(row, ['Широта__2', 'Широта_2']);
  const pair1 = inferLngLatPair(opLng, opLat);
  const pair2 = inferLngLatPair(opLng2, opLat2);

  if (pair1 && pair2) {
    const ordered = normalizeEdgeOrder({
      upperEdgeCoords: pair1,
      lowerEdgeCoords: pair2,
    });
    return {
      upper: ordered.upperEdgeCoords,
      lower: ordered.lowerEdgeCoords,
      label,
      phenomenon,
      allowCoincident: false,
      fromFileCoords: true,
    };
  }

  if (pair1 || pair2) {
    const ref = pair1 ?? pair2!;
    const expanded = expandSinglePointEdges(ref, ref, pointName);
    return {
      upper: expanded.upper,
      lower: expanded.lower,
      label,
      phenomenon,
      allowCoincident: false,
      fromFileCoords: true,
    };
  }

  return null;
}

/**
 * Сводка за день: самая южная верхняя кромка и самая северная нижняя по всем строкам файла.
 */
function aggregateOperationalBulletin(
  rows: any[],
  fileName: string,
  fileModified: string | undefined,
  coordWarnings?: string[],
): ParsedObservation | null {
  let bestUpperKm = Infinity;
  let bestLowerKm = -Infinity;
  let bestUpperCoords: [number, number] | null = null;
  let bestLowerCoords: [number, number] | null = null;
  const labels: string[] = [];
  const noteParts: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const edges = extractOperationalRowEdges(rows[i]);
    if (!edges?.fromFileCoords) continue;

    const ukm = riverLocationKm(edges.upper);
    const lkm = riverLocationKm(edges.lower);
    if (ukm < bestUpperKm) {
      bestUpperKm = ukm;
      bestUpperCoords = edges.upper;
    }
    if (lkm > bestLowerKm) {
      bestLowerKm = lkm;
      bestLowerCoords = edges.lower;
    }
    if (edges.label) labels.push(edges.label);
    if (edges.phenomenon) noteParts.push(edges.phenomenon);

    if (coordWarnings) {
      coordWarnings.push(
        ...collectIceCoordinateWarnings(
          fileName,
          i,
          edges.label,
          edges.upper,
          edges.lower,
          { allowCoincidentEdges: edges.allowCoincident },
        ),
      );
    }
  }

  if (!bestUpperCoords || !bestLowerCoords || !Number.isFinite(bestUpperKm)) return null;

  const dateISO = bulletinDateISO(fileName);
  if (!dateISO) return null;

  const spanKm = bestLowerKm - bestUpperKm;
  if (spanKm < MIN_EDGE_SPAN_KM) {
    const labelHint = labels[0] ?? '';
    const expanded = expandSinglePointEdges(bestUpperCoords, bestLowerCoords, labelHint);
    bestUpperCoords = expanded.upper;
    bestLowerCoords = expanded.lower;
    if (expanded.settlementNote) noteParts.push(expanded.settlementNote);
  }

  const uniqueLabels = [...new Set(labels)].slice(0, 5);
  return normalizeEdgeOrder({
    date: dateISO,
    locationName:
      uniqueLabels.length > 0
        ? uniqueLabels.join(', ')
        : fileName.replace(/\.xlsx?$/i, ''),
    upperEdgeCoords: bestUpperCoords,
    lowerEdgeCoords: bestLowerCoords,
    notes: noteParts.length ? [...new Set(noteParts)].slice(0, 10).join('; ') : undefined,
  });
}

function rowHasOperationalEdgeCoords(row: any): boolean {
  const labeled = extractLabeledLowerUpperPairs(row);
  if (labeled.lower || labeled.upper) return true;
  return Boolean(
    inferLngLatPair(extractNum(row, ['Долгота']), extractNum(row, ['Широта'])) ||
      inferLngLatPair(extractNum(row, ['Долгота__2', 'Долгота_2']), extractNum(row, ['Широта__2', 'Широта_2'])),
  );
}

const TRIVIAL_PHENOMENON_TEXT = new Set([
  '',
  'нет информации',
  'нет данных',
  'нет сведений',
  '—',
  '-',
]);

/** Пункты с ледовыми явлениями без координат кромок — маркеры на карте по справочнику н.п. */
function parseOperationalPhenomenonPoints(
  rows: any[],
  fileName: string,
  _fileModified?: string,
): ParsedObservation[] {
  const dateISO = bulletinDateISO(fileName);
  if (!dateISO) return [];
  const dayKey = dateISO.slice(0, 10);
  const out: ParsedObservation[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const pointName = extractStr(row, ['Пункт']);
    if (!pointName || isInvalidPointName(pointName)) continue;
    const phenomenon =
      extractStr(row, ['Явление', 'Phenomenon', 'phenomenon', 'Ледовые явления (примечания)']) || '';
    const phenomenonNorm = phenomenon.trim().toLowerCase();
    if (!phenomenon || TRIVIAL_PHENOMENON_TEXT.has(phenomenonNorm)) continue;
    if (rowHasOperationalEdgeCoords(row)) continue;

    const coords = resolveSettlementCoords(pointName);
    if (!coords) continue;

    const key = `${dayKey}|${normalizeSettlementName(pointName)}|${phenomenonNorm.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: `ph-${dayKey}-${normalizeSettlementName(pointName)}-${seen.size}`,
      date: dateISO,
      locationName: pointName,
      upperEdgeCoords: coords,
      lowerEdgeCoords: coords,
      notes: phenomenon,
      phenomenonOnly: true,
    });
  }
  return out;
}

/**
 * Parse Excel rows into ice observation objects.
 * Supports FIVE formats:
 * 
 * Format 1 (pure geo-coordinates):
 *   Column names containing Lng/Lat or Долгота/Широта for upper/lower edges
 *   e.g. UpperLng, UpperLat, LowerLng, LowerLat
 *   or  Верх.Долгота (Lng), Верх.Широта (Lat), Низ.Долгота (Lng), Низ.Широта (Lat)
 * 
 * Format 2 (settlement-based):
 *   Дата, Верхняя кромка (поселок), Нижняя кромка (поселок), Примечания
 * 
 * Format 3 (mixed — settlement name + optional geo override):
 *   Дата, Верхняя кромка, Верх.Lng, Верх.Lat, Нижняя кромка, Низ.Lng, Низ.Lat, Примечания
 *   When coordinates are provided they override the settlement lookup.
 *
 * Format 4 (operational "Сведения на карту"):
 *   Река, Пункт, Ледовые явления (примечания),
 *   Широта/Долгота и Широта__2/Долгота__2 — две точки кромок (порядок по км вдоль Лены),
 *   все строки с координатами агрегируются в одну сводку за файл
 *
 * Format 5 (hydro-bulletin without coordinates):
 *   Река, Пункт, Ледовые явления (примечания)
 *   No explicit coordinates — resolved from Пункт via SETTLEMENT_COORDS.
 *   Date extracted from the file name.
 */
export function parseIceRows(
  rows: any[],
  fileName: string,
  fileModified?: string,
  coordWarnings?: string[],
): ParsedObservation[] {
  if (isOperationalBulletinFormat(rows)) {
    if (!bulletinDateISO(fileName)) return [];
    const out: ParsedObservation[] = [];
    const aggregated = aggregateOperationalBulletin(rows, fileName, fileModified, coordWarnings);
    if (aggregated) out.push(aggregated);
    out.push(...parseOperationalPhenomenonPoints(rows, fileName, fileModified));
    if (out.length > 0) return out;
  }

  const observations: ParsedObservation[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const dateValue = row.Date || row['Дата'] || row.date;

      let upperCoords: [number, number] | null = null;
      let lowerCoords: [number, number] | null = null;
      let upperFromNumeric = false;
      let lowerFromNumeric = false;
      let upperSettlement: string | undefined;
      let lowerSettlement: string | undefined;
      let locationName = '';

      // ---- Try to extract upper edge coordinates ----
      const upperLng = extractNum(row, ['UpperLng', 'Верх.Долгота (Lng)', 'Верх.Lng', 'upperLng', 'upper_lng']);
      const upperLat = extractNum(row, ['UpperLat', 'Верх.Широта (Lat)', 'Верх.Lat', 'upperLat', 'upper_lat']);

      upperCoords = inferLngLatPair(upperLng, upperLat);
      if (upperLng !== null && upperLat !== null && upperCoords) upperFromNumeric = true;

      // ---- Try to extract lower edge coordinates ----
      const lowerLng = extractNum(row, ['LowerLng', 'Низ.Долгота (Lng)', 'Низ.Lng', 'lowerLng', 'lower_lng']);
      const lowerLat = extractNum(row, ['LowerLat', 'Низ.Широта (Lat)', 'Низ.Lat', 'lowerLat', 'lower_lat']);

      lowerCoords = inferLngLatPair(lowerLng, lowerLat);
      if (lowerLng !== null && lowerLat !== null && lowerCoords) lowerFromNumeric = true;

      // Operational bulletin: две пары координат → порядок по км вдоль русла (normalizeEdgeOrder)
      if (!lowerCoords && !upperCoords) {
        const opLng = extractNum(row, ['Долгота']);
        const opLat = extractNum(row, ['Широта']);
        const opLng2 = extractNum(row, ['Долгота__2', 'Долгота_2']);
        const opLat2 = extractNum(row, ['Широта__2', 'Широта_2']);
        const pair1 = inferLngLatPair(opLng, opLat);
        const pair2 = inferLngLatPair(opLng2, opLat2);
        if (pair1 && pair2) {
          const ordered = normalizeEdgeOrder({
            upperEdgeCoords: pair1,
            lowerEdgeCoords: pair2,
          });
          upperCoords = ordered.upperEdgeCoords;
          lowerCoords = ordered.lowerEdgeCoords;
          upperFromNumeric = true;
          lowerFromNumeric = true;
        } else if (pair1) {
          lowerCoords = pair1;
          lowerFromNumeric = true;
        } else if (pair2) {
          upperCoords = pair2;
          upperFromNumeric = true;
        }
      }

      let allowCoincidentEdges = false;
      if (lowerCoords && !upperCoords && lowerFromNumeric) {
        upperCoords = lowerCoords;
        allowCoincidentEdges = true;
        if (!upperSettlement && lowerSettlement) upperSettlement = lowerSettlement;
      }

      // Format 4 / compound-header: try named columns first (narrow match to avoid mix-up of two lat/lng pairs)
      if (!lowerCoords) {
        const tplLat = extractNum(row, [
          // Compound names from two-row merged headers (e.g. "Нижняя кромка.Широта")
          'Нижняя кромка.Широта', 'Нижняя кромка.Lat', 'Нижняя кромка.lat',
          'Широта (нижняя кромка)', 'Нижняя широта', 'Широта нижней кромки',
          'Широта',
        ]);
        const tplLng = extractNum(row, [
          'Нижняя кромка.Долгота', 'Нижняя кромка.Lng', 'Нижняя кромка.lng',
          'Долгота (нижняя кромка)', 'Нижняя долгота', 'Долгота нижней кромки',
          'Долгота',
        ]);
        lowerCoords = inferLngLatPair(tplLng, tplLat);
        if (tplLng !== null && tplLat !== null && lowerCoords) lowerFromNumeric = true;
      }
      if (!upperCoords) {
        const tplLat = extractNum(row, [
          'Верхняя кромка.Широта', 'Верхняя кромка.Lat', 'Верхняя кромка.lat',
          'Широта (верхняя кромка)', 'Верхняя широта', 'Широта верхней кромки',
          'Широта__2', 'Широта_2',
        ]);
        const tplLng = extractNum(row, [
          'Верхняя кромка.Долгота', 'Верхняя кромка.Lng', 'Верхняя кромка.lng',
          'Долгота (верхняя кромка)', 'Верхняя долгота', 'Долгота верхней кромки',
          'Долгота__2', 'Долгота_2',
        ]);
        upperCoords = inferLngLatPair(tplLng, tplLat);
        if (tplLng !== null && tplLat !== null && upperCoords) upperFromNumeric = true;
      }

      // Format 6: «Нижняя кромка» / «Верхняя кромка» columns contain raw numbers (lat first, lng second).
      // This happens when the header row IS the кромка row and no sub-headers were found.
      // Example: column "Нижняя кромка" = 60.890727, next column (unnamed) = 125.800869
      if (!lowerCoords) {
        const rawLower = row['Нижняя кромка'] ?? row['нижняя кромка'];
        const numLower = rawLower !== undefined && rawLower !== '' ? Number(String(rawLower).replace(',', '.')) : NaN;
        if (!isNaN(numLower)) {
          // The value in "Нижняя кромка" is numeric — treat as lat; scan row for a plausible lng partner
          const rowValues = Object.values(row as Record<string, unknown>)
            .map((v) => Number(String(v ?? '').replace(',', '.')))
            .filter((n) => !isNaN(n) && n !== numLower);
          for (const partner of rowValues) {
            const attempt = inferLngLatPair(numLower, partner);
            if (attempt) { lowerCoords = attempt; lowerFromNumeric = true; break; }
            const attempt2 = inferLngLatPair(partner, numLower);
            if (attempt2) { lowerCoords = attempt2; lowerFromNumeric = true; break; }
          }
        }
      }
      if (!upperCoords) {
        const rawUpper = row['Верхняя кромка'] ?? row['верхняя кромка'];
        const numUpper = rawUpper !== undefined && rawUpper !== '' ? Number(String(rawUpper).replace(',', '.')) : NaN;
        if (!isNaN(numUpper)) {
          const rowValues = Object.values(row as Record<string, unknown>)
            .map((v) => Number(String(v ?? '').replace(',', '.')))
            .filter((n) => !isNaN(n) && n !== numUpper && (lowerCoords ? Math.abs(n - lowerCoords[0]) > 0.0001 && Math.abs(n - lowerCoords[1]) > 0.0001 : true));
          for (const partner of rowValues) {
            const attempt = inferLngLatPair(numUpper, partner);
            if (attempt) { upperCoords = attempt; upperFromNumeric = true; break; }
            const attempt2 = inferLngLatPair(partner, numUpper);
            if (attempt2) { upperCoords = attempt2; upperFromNumeric = true; break; }
          }
        }
      }

      // ---- Try to resolve settlement names ----
      const upperName = extractStr(row, ['Верхняя кромка (поселок)', 'Верхняя кромка', 'UpperSettlement', 'upper_settlement']);
      const lowerName = extractStr(row, ['Нижняя кромка (поселок)', 'Нижняя кромка', 'LowerSettlement', 'lower_settlement']);

      if (upperName) {
        upperSettlement = upperName;
        // Only use settlement coords if no explicit coordinates were provided
        if (!upperCoords) {
          const resolved = resolveSettlementCoords(upperName);
          if (resolved) upperCoords = resolved;
        }
      }

      if (lowerName) {
        lowerSettlement = lowerName;
        if (!lowerCoords) {
          const resolved = resolveSettlementCoords(lowerName);
          if (resolved) lowerCoords = resolved;
        }
      }

      // Build location name
      locationName = extractStr(row, ['Location', 'Участок', 'Участок (описание)']) || '';
      const riverName = extractStr(row, ['Река']);
      const pointName = extractStr(row, ['Пункт']);
      const waterSection = extractStr(row, ['расположения на воде']);
      if (!locationName && (riverName || pointName || waterSection)) {
        locationName = [riverName, pointName, waterSection].filter(Boolean).join(' • ');
      }
      if (!locationName && (upperSettlement || lowerSettlement)) {
        locationName = [upperSettlement, lowerSettlement].filter(Boolean).join(' – ');
      }

      // Пункт без координат кромок — гидробюллетень (уровень/явления), не пара кромок на карте
      if (pointName && !isInvalidPointName(pointName)) {
        const pointCoords = resolveSettlementCoords(pointName);
        if (pointCoords) {
          if (!upperCoords && !lowerCoords) {
            continue;
          }
          if (!upperCoords && !lowerFromNumeric) {
            upperCoords = pointCoords;
            upperSettlement = pointName;
          } else if (!lowerCoords && !upperFromNumeric) {
            lowerCoords = pointCoords;
            lowerSettlement = pointName;
          }
          if (!locationName) {
            locationName = [riverName, pointName].filter(Boolean).join(' • ');
          }
        }
      }

      const phenomenon = extractStr(row, ['Явление', 'Phenomenon', 'phenomenon', 'Ледовые явления (примечания)']) || '';

      // Skip if we couldn't resolve coordinates for either edge
      if (!upperCoords || !lowerCoords) {
        const upperLabel = upperName || pointName || '';
        const lowerLabel = lowerName || pointName || '';
        const sameSettlementLabel =
          Boolean(upperLabel) &&
          Boolean(lowerLabel) &&
          normalizeSettlementName(upperLabel) === normalizeSettlementName(lowerLabel);
        // Строка гидробюллетеня (пункт + явление, без Lat/Lng кромок) — не ошибка ледохода
        const hydrologyOnlyRow =
          !upperFromNumeric &&
          !lowerFromNumeric &&
          (Boolean(pointName) || Boolean(phenomenon) || sameSettlementLabel);
        if (hydrologyOnlyRow) {
          continue;
        }

        if (!isInvalidPointName(upperLabel || 'N/A') && !isInvalidPointName(lowerLabel || 'N/A')) {
          const msg = `Не удалось определить координаты кромок: верх="${upperLabel || 'N/A'}", низ="${lowerLabel || 'N/A'}" (файл: ${fileName})`;
          if (coordWarnings) coordWarnings.push(msg);
          else console.warn(msg);
        }
        continue;
      }

      const notes = extractStr(row, ['Notes', 'Примечания', 'notes']) || '';
      const noteParts = [phenomenon, notes];
      const pointHint = pointName || lowerName || upperName || locationName;
      const expandedFinal = expandSinglePointEdges(upperCoords, lowerCoords, pointHint);
      const pushUpper = expandedFinal.upper;
      const pushLower = expandedFinal.lower;
      if (expandedFinal.settlementNote) {
        noteParts.push(expandedFinal.settlementNote);
      } else if (allowCoincidentEdges) {
        noteParts.push('верхняя кромка в файле не указана');
      }

      const parsedDate = new Date(dateValue || bulletinDateISO(fileName) || fileModified || '');
      if (Number.isNaN(parsedDate.getTime())) continue;

      observations.push(
        normalizeEdgeOrder({
          date: parsedDate.toISOString(),
          locationName,
          upperEdgeCoords: pushUpper,
          lowerEdgeCoords: pushLower,
          notes: noteParts.filter(Boolean).join(' — ') || undefined,
          upperSettlement,
          lowerSettlement,
        }),
      );
      if (coordWarnings) {
        coordWarnings.push(
          ...collectIceCoordinateWarnings(fileName, i, locationName, pushUpper, pushLower, {
            allowCoincidentEdges: false,
          }),
        );
      }
    } catch (e) {
      const msg = `Ошибка парсинга строки в ${fileName}: ${e instanceof Error ? e.message : String(e)}`;
      if (coordWarnings) coordWarnings.push(msg);
      else console.warn(msg, row);
    }
  }

  return observations;
}

/** Extract a numeric value from a row trying multiple possible column names */
function extractNum(row: any, keys: string[]): number | null {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null && val !== '') {
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      const s = String(val).replace(',', '.').trim();
      const m = s.match(/-?\d+(?:\.\d+)?/);
      if (m) {
        const num = Number(m[0]);
        if (!Number.isNaN(num)) return num;
      }
    }
  }
  return null;
}

/** Extract a string value from a row trying multiple possible column names */
function extractStr(row: any, keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null && val !== '') {
      return String(val).trim();
    }
  }
  return '';
}

// ============================================================================
// Water levels — fetched from the same Yandex Disk folder as ice observations
// ============================================================================

const RUSSIAN_MONTHS: Record<string, number> = {
  'январ': 0, 'jan': 0,
  'феврал': 1, 'feb': 1,
  'март': 2, 'mar': 2,
  'апрел': 3, 'apr': 3,
  'мае': 4, 'май': 4, 'may': 4,
  'июн': 5, 'jun': 5,
  'июл': 6, 'jul': 6,
  'август': 7, 'aug': 7,
  'сентябр': 8, 'sep': 8,
  'октябр': 9, 'oct': 9,
  'ноябр': 10, 'nov': 10,
  'декабр': 11, 'dec': 11,
};

/**
 * Heuristic: a file likely contains water levels if its name mentions either
 * explicit "уровни воды" wording or operational hydro bulletin wording
 * ("сведения ... гидрология").
 */
function isLikelyWaterLevelFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.includes('инструк') || lower.includes('шаблон')) return false;
  if (lower.includes('карт') || lower.includes('кромк') || lower.includes('ледоход')) return false;
  return (
    lower.includes('уровн') ||
    lower.includes('уровни воды') ||
    (lower.includes('сведени') && lower.includes('гидролог')) ||
    lower.includes('гидролог') ||
    lower.includes('water') ||
    lower.includes('level')
  );
}

/**
 * Extract a 4-digit year from a filename like "Уровни воды в мае 2026.xls".
 * Returns null if no year is found.
 */
function extractYearFromFileName(fileName: string): number | null {
  const m = fileName.match(/(20\d{2})/);
  return m ? Number(m[1]) : null;
}

/**
 * Best-effort guess of the calendar month covered by a water-level file.
 * Used as a sanity tie-breaker when filtering files by month.
 */
function extractMonthFromFileName(fileName: string): number | null {
  const lower = fileName.toLowerCase();
  for (const [needle, monthIndex] of Object.entries(RUSSIAN_MONTHS)) {
    if (lower.includes(needle)) return monthIndex;
  }
  return null;
}

/**
 * Infer year primarily from file name, with a fallback to modified timestamp.
 */
function inferYearForFile(file: YandexFile): number | null {
  const fromName = extractYearFromFileName(file.name);
  if (fromName) return fromName;
  const modified = new Date(file.modified);
  return Number.isNaN(modified.getTime()) ? null : modified.getUTCFullYear();
}

function normalizeHeaderCell(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Prefer «в 8 час» over «в 20 час 05.05» and similar evening columns. */
function findOperationalLevelColumnIndex(header: string[]): number {
  let idx = header.findIndex((h) => h === 'в 8 час');
  if (idx >= 0) return idx;
  idx = header.findIndex((h) => /^в\s*8(\s|$|час)/.test(h));
  if (idx >= 0) return idx;
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (!/^в\s*\d{1,2}/.test(h)) continue;
    if (/20\s*час/.test(h)) continue;
    if (/час/.test(h) || h.includes('уровни')) return i;
  }
  return header.findIndex((h) => h.includes('уровни'));
}

/**
 * Parse an operational bulletin sheet with columns like:
 *   Река | Пункт | в 8 час | ... | Ледовые явления
 * and one daily value per station.
 */
export function parseOperationalWaterLevels(
  rows: unknown[][],
  dateKey: string,
): WaterLevelStation[] {
  if (rows.length === 0) return [];

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const headers = (rows[i] ?? []).map(normalizeHeaderCell);
    const hasRiver = headers.some((h) => h === 'река');
    const hasPoint = headers.some((h) => h === 'пункт');
    const hasLevel = findOperationalLevelColumnIndex(headers) >= 0;
    if (hasRiver && hasPoint && hasLevel) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex < 0) return [];

  const header = (rows[headerRowIndex] ?? []).map(normalizeHeaderCell);
  const riverIdx = header.findIndex((h) => h === 'река');
  const pointIdx = header.findIndex((h) => h === 'пункт');
  const levelIdx = findOperationalLevelColumnIndex(header);
  if (riverIdx < 0 || pointIdx < 0 || levelIdx < 0) return [];

  const byKey = new Map<string, WaterLevelStation>();

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const river = String(row[riverIdx] ?? '').trim();
    const name = String(row[pointIdx] ?? '').trim();
    if (!river || !name) continue;

    const rawLevel = row[levelIdx];
    if (rawLevel === '' || rawLevel === null || rawLevel === undefined) continue;
    const levelNum = Number(
      typeof rawLevel === 'string' ? rawLevel.replace(',', '.').trim() : rawLevel,
    );
    if (!Number.isFinite(levelNum)) continue;

    const key = `${river}__${name}`.toLowerCase().trim();
    const existing = byKey.get(key);
    if (existing) {
      existing.levels[dateKey] = levelNum;
      continue;
    }

    byKey.set(key, {
      id: `${river}_${name}`,
      index: null,
      river,
      name,
      criticalLevel: null,
      coords: resolveSettlementCoords(name),
      levels: { [dateKey]: levelNum },
    });
  }

  return Array.from(byKey.values());
}

/**
 * Download a Yandex Disk file and parse water levels from either:
 * - monthly archive format (many dates across columns), or
 * - operational bulletin format (single date in file name + "в 8 час" column).
 */
export async function downloadAndParseWaterLevels(file: YandexFile): Promise<{
  stations: WaterLevelStation[];
  year: number | null;
}> {
  const response = await fetch(getDiskFileFetchUrl(file.path));
  if (!response.ok) {
    throw new Error(`Ошибка скачивания файла: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const inferredYear = inferYearForFile(file);

  // 1) Try monthly tabular format first.
  if (inferredYear) {
    const monthlyStations = await parseExcelData(arrayBuffer, inferredYear);
    const monthlyEntries = monthlyStations.reduce((sum, s) => sum + Object.keys(s.levels).length, 0);
    if (monthlyEntries > 0) {
      return { stations: monthlyStations, year: inferredYear };
    }
  }

  // 2) Fallback to operational bulletin format.
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  const isoDate =
    extractDateFromFileName(file.name) ||
    (file.modified ? new Date(file.modified).toISOString() : new Date().toISOString());
  // Keep the time so we can store hourly data instead of just daily substring(0, 10)
  const dateKey = isoDate;
  const opStations = parseOperationalWaterLevels(rows, dateKey);
  return { stations: opStations, year: inferredYear };
}

export interface FetchWaterLevelsResult {
  stations: WaterLevelStation[];
  fileCount: number;
  totalFiles: number;
  hasNewFiles: boolean;
  latestModified: string | null;
  errors: string[];
  filesProcessed: { name: string; year: number; entries: number }[];
}

export interface FetchWaterLevelsOptions {
  /** Only consider files modified after this ISO timestamp. */
  onlyNewerThan?: string | null;
  /** Limit to a single year (e.g. 2026). When omitted, all years are returned. */
  year?: number | null;
}

/**
 * Walk the public Yandex Disk folder, parse every file that looks like a
 * water-level table, and return the consolidated list of stations.
 *
 * Stations from multiple files are merged: levels from each file are added
 * to the station's `levels` map keyed by ISO date. The year for each file is
 * inferred from its file name (e.g. "Уровни воды в мае 2026.xls" → 2026).
 */
export async function fetchAllWaterLevelData(
  options: FetchWaterLevelsOptions = {},
): Promise<FetchWaterLevelsResult> {
  const errors: string[] = [];
  const filesProcessed: { name: string; year: number; entries: number }[] = [];

  let files: YandexFile[];
  try {
    files = await listYandexFiles();
  } catch (e: any) {
    return {
      stations: [],
      fileCount: 0,
      totalFiles: 0,
      hasNewFiles: false,
      latestModified: null,
      errors: [e.message ?? 'Не удалось получить список файлов с Яндекс.Диска'],
      filesProcessed: [],
    };
  }

  const candidateFiles = files.filter((f) => isLikelyWaterLevelFile(f.name));
  if (candidateFiles.length === 0) {
    return {
      stations: [],
      fileCount: 0,
      totalFiles: files.length,
      hasNewFiles: false,
      latestModified: null,
      errors: ['На Яндекс.Диске нет файлов с уровнями воды'],
      filesProcessed: [],
    };
  }

  const latestModifiedTs = candidateFiles
    .map((f) => new Date(f.modified).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a)[0];

  const filteredByDate = options.onlyNewerThan
    ? candidateFiles.filter(
        (f) => new Date(f.modified).getTime() > new Date(options.onlyNewerThan as string).getTime(),
      )
    : candidateFiles;

  const targetYear = options.year ?? null;
  const filteredByYear = targetYear
    ? filteredByDate.filter((f) => inferYearForFile(f) === targetYear)
    : filteredByDate;

  if (filteredByYear.length === 0) {
    return {
      stations: [],
      fileCount: 0,
      totalFiles: files.length,
      hasNewFiles: false,
      latestModified: Number.isFinite(latestModifiedTs)
        ? new Date(latestModifiedTs).toISOString()
        : null,
      errors: [],
      filesProcessed: [],
    };
  }

  const merged = new Map<string, WaterLevelStation>();
  const keyOf = (s: WaterLevelStation) => `${s.river}__${s.name}`.toLowerCase().trim();

  for (const file of filteredByYear) {
    const year = inferYearForFile(file);
    if (!year) {
      errors.push(`${file.name}: не удалось определить год по имени файла`);
      continue;
    }
    try {
      const parsed = await downloadAndParseWaterLevels(file);
      const stations = parsed.stations;
      let entries = 0;
      for (const stn of stations) {
        const k = keyOf(stn);
        const existing = merged.get(k);
        if (existing) {
          merged.set(k, {
            ...existing,
            index: stn.index ?? existing.index,
            criticalLevel: stn.criticalLevel ?? existing.criticalLevel,
            coords: stn.coords ?? existing.coords,
            levels: { ...existing.levels, ...stn.levels },
          });
        } else {
          merged.set(k, { ...stn, levels: { ...stn.levels } });
        }
        entries += Object.keys(stn.levels).length;
      }
      filesProcessed.push({ name: file.name, year, entries });
    } catch (e: any) {
      errors.push(`${file.name}: ${e.message ?? e}`);
    }
  }

  return {
    stations: Array.from(merged.values()),
    fileCount: filesProcessed.length,
    totalFiles: files.length,
    hasNewFiles: filesProcessed.length > 0,
    latestModified: Number.isFinite(latestModifiedTs)
      ? new Date(latestModifiedTs).toISOString()
      : null,
    errors,
    filesProcessed,
  };
}

// Exposed for unit tests / future filtering UI.
export const __waterLevelHelpers = {
  isLikelyWaterLevelFile,
  extractYearFromFileName,
  extractMonthFromFileName,
  inferYearForFile,
};

