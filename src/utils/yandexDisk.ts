import * as XLSX from 'xlsx';

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
};

/**
 * Resolve a settlement name to coordinates.
 * Tries exact match first, then partial/fuzzy match.
 */
export function resolveSettlementCoords(name: string): [number, number] | null {
  if (!name) return null;
  
  const normalized = name.trim();
  
  // Exact match
  if (SETTLEMENT_COORDS[normalized]) {
    return SETTLEMENT_COORDS[normalized];
  }
  
  // Case-insensitive match
  const lowerName = normalized.toLowerCase();
  for (const [key, coords] of Object.entries(SETTLEMENT_COORDS)) {
    if (key.toLowerCase() === lowerName) return coords;
  }
  
  // Partial match (settlement name contains search or vice versa)
  for (const [key, coords] of Object.entries(SETTLEMENT_COORDS)) {
    if (key.toLowerCase().includes(lowerName) || lowerName.includes(key.toLowerCase())) {
      return coords;
    }
  }
  
  return null;
}

/**
 * Parse Excel rows into ice observation objects.
 * Supports FOUR formats:
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

      // Skip if we couldn't resolve coordinates for either edge
      if (!upperCoords || !lowerCoords) {
        console.warn(
          `Не удалось определить координаты кромок: верх="${upperName || 'N/A'}", низ="${lowerName || 'N/A'}" (файл: ${fileName})`
        );
        continue;
      }

      const notes = extractStr(row, ['Notes', 'Примечания', 'notes']) || '';
      const phenomenon = extractStr(row, ['Явление', 'Phenomenon', 'phenomenon', 'Ледовые явления (примечания)']) || '';

      observations.push({
        date: new Date(dateValue || fileModified || Date.now()).toISOString(),
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

