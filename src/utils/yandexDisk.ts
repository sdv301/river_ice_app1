import * as XLSX from 'xlsx';
import type { WaterLevelStation } from '../store/waterLevelStore';
import { parseExcelData } from './excelParser';

// Yandex Disk public folder link
const YANDEX_PUBLIC_KEY = 'https://disk.yandex.ru/d/LENyBdYBr2B3rA';
const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk/public/resources';

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
  const url = `${YANDEX_API_BASE}?public_key=${encodeURIComponent(YANDEX_PUBLIC_KEY)}&limit=100`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ошибка получения списка файлов: ${response.status}`);
  }
  
  const data = await response.json();
  const items = data._embedded?.items || [];
  
  // Filter for Excel files only
  return items.filter((item: any) => 
    item.type === 'file' && 
    (item.name.endsWith('.xlsx') || item.name.endsWith('.xls') || item.name.endsWith('.csv'))
  ).map((item: any) => ({
    name: item.name,
    path: item.path,
    size: item.size,
    created: item.created,
    modified: item.modified,
    mime_type: item.mime_type || '',
    file: item.file || null
  }));
}

/**
 * Get download link for a file in the public Yandex Disk folder
 */
export async function getDownloadLink(filePath: string): Promise<string> {
  const url = `${YANDEX_API_BASE}/download?public_key=${encodeURIComponent(YANDEX_PUBLIC_KEY)}&path=${encodeURIComponent(filePath)}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ошибка получения ссылки на скачивание: ${response.status}`);
  }
  
  const data = await response.json();
  return data.href;
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

function parseSheetRows(ws: XLSX.WorkSheet): any[] {
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
  const header = rawHeader.map((h, idx) => {
    const base = h || `col_${idx}`;
    const count = (headerCounts.get(base) ?? 0) + 1;
    headerCounts.set(base, count);
    return count === 1 ? base : `${base}__${count}`;
  });
  const out: any[] = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const values = rows[r];
    const obj: Record<string, unknown> = {};
    let hasData = false;
    for (let c = 0; c < header.length; c++) {
      const key = header[c] || `col_${c}`;
      const value = values?.[c];
      if (value !== '' && value !== null && value !== undefined) hasData = true;
      obj[key] = value;
    }
    if (hasData) out.push(obj);
  }
  return out;
}

export async function downloadAndParseExcel(filePath: string): Promise<any[]> {
  const downloadUrl = await getDownloadLink(filePath);
  
  const response = await fetch(downloadUrl);
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
      const parsed = parseIceRows(rows, file.name, file.modified);
      allObservations.push(...parsed);
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
}

/**
 * Normalize coordinate pair in WGS-84 (longitude, latitude).
 * Returns null for invalid values.
 */
function normalizeWgs84Coords(lng: number | null, lat: number | null): [number, number] | null {
  if (lng === null || lat === null) return null;

  // Standard order in app: [longitude, latitude]
  if (lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
    return [lng, lat];
  }

  // Common user mistake: swapped lat/lng
  if (lat >= -180 && lat <= 180 && lng >= -90 && lng <= 90) {
    return [lat, lng];
  }

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

  // Олёкма river basin (Бассейн Олёкмы)
  'Ср.Олёкма': [121.80, 57.60],
  'Средняя Олёкма': [121.80, 57.60],

  // Lena main-stem observation points
  'Иннялы': [119.00, 60.00],
  'Комака': [116.00, 60.10],
  'Курум': [113.70, 59.85],
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

/**
 * Resolve a settlement name to coordinates.
 * Tries exact match first, then partial/fuzzy match.
 */
export function resolveSettlementCoords(name: string): [number, number] | null {
  if (!name) return null;

  const normalized = String(name).trim();
  const normalizedKey = normalizeSettlementName(normalized);
  if (isInvalidPointName(normalizedKey)) return null;

  // Alias remap for known operational naming variants.
  const aliased = SETTLEMENT_ALIASES[normalizedKey];
  if (aliased && SETTLEMENT_COORDS[aliased]) {
    return SETTLEMENT_COORDS[aliased];
  }

  // Exact match
  if (SETTLEMENT_COORDS[normalized]) {
    return SETTLEMENT_COORDS[normalized];
  }

  // Case-insensitive + ё/е normalized match
  for (const [key, coords] of Object.entries(SETTLEMENT_COORDS)) {
    if (normalizeSettlementName(key) === normalizedKey) return coords;
  }

  // Partial match (settlement name contains search or vice versa)
  for (const [key, coords] of Object.entries(SETTLEMENT_COORDS)) {
    const normalizedCandidate = normalizeSettlementName(key);
    if (normalizedCandidate.includes(normalizedKey) || normalizedKey.includes(normalizedCandidate)) {
      return coords;
    }
  }

  // Stem-like match for frequent adjective ending drift:
  // e.g. "Крестовское" vs "Крестовский"
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

  return null;
}

/**
 * Extract a date from a file name like
 * "Сведения на карту р. Лена 09.05.2026.xlsx" or
 * "Сведения в карту р. Лена (гидрология) на 08.05.2026 г..xlsx"
 */
function extractDateFromFileName(fileName: string): string | null {
  // Match DD.MM.YYYY pattern
  const match = fileName.match(/(\d{2})\.(\d{2})\.(\d{4})/);
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
 * Format 4 (operational "Шаблон 2.xlsx"):
 *   Река, Пункт, Ледовые явления (примечания),
 *   Широта/Долгота (нижняя кромка), Широта/Долгота (верхняя кромка),
 *   расположения на воде
 *
 * Format 5 (hydro-bulletin without coordinates):
 *   Река, Пункт, Ледовые явления (примечания)
 *   No explicit coordinates — resolved from Пункт via SETTLEMENT_COORDS.
 *   Date extracted from the file name.
 */
function parseIceRows(rows: any[], fileName: string, fileModified?: string): ParsedObservation[] {
  const observations: ParsedObservation[] = [];

  for (const row of rows) {
    try {
      const dateValue = row.Date || row['Дата'] || row.date;

      let upperCoords: [number, number] | null = null;
      let lowerCoords: [number, number] | null = null;
      let upperSettlement: string | undefined;
      let lowerSettlement: string | undefined;
      let locationName = '';

      // ---- Try to extract upper edge coordinates ----
      const upperLng = extractNum(row, ['UpperLng', 'Верх.Долгота (Lng)', 'Верх.Lng', 'upperLng', 'upper_lng']);
      const upperLat = extractNum(row, ['UpperLat', 'Верх.Широта (Lat)', 'Верх.Lat', 'upperLat', 'upper_lat']);

      upperCoords = normalizeWgs84Coords(upperLng, upperLat);

      // ---- Try to extract lower edge coordinates ----
      const lowerLng = extractNum(row, ['LowerLng', 'Низ.Долгота (Lng)', 'Низ.Lng', 'lowerLng', 'lower_lng']);
      const lowerLat = extractNum(row, ['LowerLat', 'Низ.Широта (Lat)', 'Низ.Lat', 'lowerLat', 'lower_lat']);

      lowerCoords = normalizeWgs84Coords(lowerLng, lowerLat);

      // Format 4: "Шаблон 2.xlsx" with duplicate headers in one row:
      // Широта/Долгота (нижняя кромка) + Широта__2/Долгота__2 (верхняя кромка)
      if (!lowerCoords) {
        const tplLowerLat = extractNum(row, ['Широта']);
        const tplLowerLng = extractNum(row, ['Долгота']);
        lowerCoords = normalizeWgs84Coords(tplLowerLng, tplLowerLat);
      }
      if (!upperCoords) {
        const tplUpperLat = extractNum(row, ['Широта__2']);
        const tplUpperLng = extractNum(row, ['Долгота__2']);
        upperCoords = normalizeWgs84Coords(tplUpperLng, tplUpperLat);
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

      // ---- Format 5: Hydro-bulletin (Река + Пункт, no/partial edge coordinates) ----
      // Case A: Neither upper nor lower coords found → use Пункт for both
      // Case B: Only one coord pair found → use Пункт for the missing one
      if (pointName && !isInvalidPointName(pointName)) {
        const pointCoords = resolveSettlementCoords(pointName);
        if (pointCoords) {
          if (!upperCoords && !lowerCoords) {
            upperCoords = pointCoords;
            lowerCoords = pointCoords;
            upperSettlement = pointName;
            lowerSettlement = pointName;
          } else if (!upperCoords) {
            upperCoords = pointCoords;
            upperSettlement = pointName;
          } else if (!lowerCoords) {
            lowerCoords = pointCoords;
            lowerSettlement = pointName;
          }
          if (!locationName) {
            locationName = [riverName, pointName].filter(Boolean).join(' • ');
          }
        }
      }

      // Skip if we couldn't resolve coordinates for either edge
      if (!upperCoords || !lowerCoords) {
        const upperLabel = upperName || pointName || 'N/A';
        const lowerLabel = lowerName || pointName || 'N/A';
        if (!isInvalidPointName(upperLabel) && !isInvalidPointName(lowerLabel)) {
          console.warn(
            `Не удалось определить координаты кромок: верх="${upperLabel}", низ="${lowerLabel}" (файл: ${fileName})`
          );
        }
        continue;
      }

      const notes = extractStr(row, ['Notes', 'Примечания', 'notes']) || '';
      const phenomenon = extractStr(row, ['Явление', 'Phenomenon', 'phenomenon', 'Ледовые явления (примечания)']) || '';

      observations.push({
        date: new Date(dateValue || extractDateFromFileName(fileName) || fileModified || Date.now()).toISOString(),
        locationName,
        upperEdgeCoords: upperCoords,
        lowerEdgeCoords: lowerCoords,
        notes: [phenomenon, notes].filter(Boolean).join(' — ') || undefined,
        upperSettlement,
        lowerSettlement,
      });
    } catch (e) {
      console.warn('Ошибка парсинга строки:', e, row);
    }
  }

  return observations;
}

/** Extract a numeric value from a row trying multiple possible column names */
function extractNum(row: any, keys: string[]): number | null {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null && val !== '') {
      const normalized = typeof val === 'string' ? val.replace(',', '.').trim() : val;
      const num = Number(normalized);
      if (!isNaN(num)) return num;
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
  return (
    lower.includes('уровн') ||
    lower.includes('уровни воды') ||
    lower.includes('сведени') ||
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

/**
 * Parse an operational bulletin sheet with columns like:
 *   Река | Пункт | в 8 час | ... | Ледовые явления
 * and one daily value per station.
 */
function parseOperationalWaterLevels(
  rows: unknown[][],
  dateKey: string,
): WaterLevelStation[] {
  if (rows.length === 0) return [];

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const headers = (rows[i] ?? []).map(normalizeHeaderCell);
    const hasRiver = headers.some((h) => h === 'река');
    const hasPoint = headers.some((h) => h === 'пункт');
    const hasLevel = headers.some((h) => h.includes('в 8') || h.match(/в \d{1,2}/) || h.includes('уровни'));
    if (hasRiver && hasPoint && hasLevel) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex < 0) return [];

  const header = (rows[headerRowIndex] ?? []).map(normalizeHeaderCell);
  const riverIdx = header.findIndex((h) => h === 'река');
  const pointIdx = header.findIndex((h) => h === 'пункт');
  const levelIdx = header.findIndex((h) => h.includes('в 8') || h.match(/в \d{1,2}/) || h.includes('уровни'));
  if (riverIdx < 0 || pointIdx < 0 || levelIdx < 0) return [];

  const byKey = new Map<string, WaterLevelStation>();

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const river = String(row[riverIdx] ?? '').trim();
    const name = String(row[pointIdx] ?? '').trim();
    if (!river || !name) continue;

    const rawLevel = row[levelIdx];
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
  const downloadUrl = await getDownloadLink(file.path);
  const response = await fetch(downloadUrl);
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

