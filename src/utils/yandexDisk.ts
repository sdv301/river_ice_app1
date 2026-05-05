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
export async function downloadAndParseExcel(filePath: string): Promise<any[]> {
  const downloadUrl = await getDownloadLink(filePath);
  
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Ошибка скачивания файла: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  
  // Try to find a data sheet (skip instruction sheets)
  let ws = wb.Sheets[wb.SheetNames[0]];
  for (const sheetName of wb.SheetNames) {
    const lowered = sheetName.toLowerCase();
    if (lowered.includes('данн') || lowered.includes('ледоход') || lowered.includes('data')) {
      ws = wb.Sheets[sheetName];
      break;
    }
  }
  
  return XLSX.utils.sheet_to_json(ws);
}

/**
 * Download all Excel files from Yandex Disk, parse them, 
 * and return consolidated ice observation data.
 */
export async function fetchAllIceData(): Promise<{
  observations: ParsedObservation[];
  fileCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const allObservations: ParsedObservation[] = [];
  
  let files: YandexFile[];
  try {
    files = await listYandexFiles();
  } catch (e: any) {
    return { observations: [], fileCount: 0, errors: [e.message] };
  }
  
  if (files.length === 0) {
    return { observations: [], fileCount: 0, errors: ['Файлы не найдены в папке Яндекс.Диска'] };
  }
  
  for (const file of files) {
    try {
      const rows = await downloadAndParseExcel(file.path);
      const parsed = parseIceRows(rows, file.name);
      allObservations.push(...parsed);
    } catch (e: any) {
      errors.push(`${file.name}: ${e.message}`);
    }
  }
  
  return {
    observations: allObservations,
    fileCount: files.length,
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
 * Supports THREE formats:
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
 */
function parseIceRows(rows: any[], fileName: string): ParsedObservation[] {
  const observations: ParsedObservation[] = [];

  for (const row of rows) {
    try {
      const dateValue = row.Date || row['Дата'] || row.date;
      if (!dateValue) continue;

      let upperCoords: [number, number] | null = null;
      let lowerCoords: [number, number] | null = null;
      let upperSettlement: string | undefined;
      let lowerSettlement: string | undefined;
      let locationName = '';

      // ---- Try to extract upper edge coordinates ----
      const upperLng = extractNum(row, ['UpperLng', 'Верх.Долгота (Lng)', 'Верх.Lng', 'upperLng', 'upper_lng']);
      const upperLat = extractNum(row, ['UpperLat', 'Верх.Широта (Lat)', 'Верх.Lat', 'upperLat', 'upper_lat']);

      if (upperLng !== null && upperLat !== null) {
        upperCoords = [upperLng, upperLat];
      }

      // ---- Try to extract lower edge coordinates ----
      const lowerLng = extractNum(row, ['LowerLng', 'Низ.Долгота (Lng)', 'Низ.Lng', 'lowerLng', 'lower_lng']);
      const lowerLat = extractNum(row, ['LowerLat', 'Низ.Широта (Lat)', 'Низ.Lat', 'lowerLat', 'lower_lat']);

      if (lowerLng !== null && lowerLat !== null) {
        lowerCoords = [lowerLng, lowerLat];
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
      const phenomenon = extractStr(row, ['Явление', 'Phenomenon', 'phenomenon']) || '';

      observations.push({
        date: new Date(dateValue).toISOString(),
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
      const num = Number(val);
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

