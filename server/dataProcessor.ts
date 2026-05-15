import * as XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs/promises';

// --- Types ---
export interface ParsedObservation {
  date: string;
  locationName: string;
  upperEdgeCoords: [number, number];
  lowerEdgeCoords: [number, number];
  notes?: string;
  upperSettlement?: string;
  lowerSettlement?: string;
}

export interface StationLevel {
  stationName: string;
  date: string;
  level: number;
}

// --- Utils (Copied from frontend for consistency) ---
const SETTLEMENT_COORDS: Record<string, [number, number]> = {
  'Витим': [112.44111, 59.44305],
  'Пеледуй': [112.75638, 59.62388],
  'Крестовское': [113.34222, 60.10694],
  'Ленск': [114.93111, 60.725],
  'Нюя': [116.14722, 60.58333],
  'Джерба': [116.82222, 60.46388],
  'Олекминск': [120.435, 60.375],
  '1-й Нерюктяй': [119.86666, 60.41666],
  'Кыллах': [120.73333, 60.25],
  'Солянка': [121.36666, 60.36666],
  'Хоринцы': [122.56666, 60.38333],
  'Саныяхтах': [123.36666, 60.41666],
  'Марха': [124.31666, 60.38333],
  'Мача': [117.73333, 60.1],
  'Урицкое': [118.88333, 60.38333],
  'Исить': [125.2, 61.1],
  'Еланка': [128.01666, 61.26666],
  'Покровск': [129.15, 61.48333],
  'Якутск': [129.71666, 62.03333],
  'Табага': [129.61666, 61.83333],
  'Кангалассы': [129.93333, 62.33333],
  'Верхний Бестях': [128.8, 61.4],
  'Намцы': [129.66666, 62.71666],
  'Графский Берег': [129.7, 62.7],
  'Арбын': [130.4, 63.3],
  'Сангар': [127.46666, 63.91666],
  'Ситте': [126.7, 64.0],
  'Батамай': [129.1, 63.5],
  'Жиганск': [123.33333, 66.76666],
  'Джарджан': [123.95, 68.73333],
  'Кюсюр': [127.7, 70.7],
  'Хабарова': [126.7, 72.3],
  'Столб': [127.0, 72.4],
  'Быков Мыс': [129.1, 72.0],
  // Алдан и притоки
  'Чагда': [130.63, 58.75],
  'Белькачи': [133.31, 59.33],
  'Усть-Миль': [134.41, 60.25],
  'Петропавловск': [134.13, 60.42],
  'Эжанцы': [134.82, 60.55],
  'Эльдикан': [135.15, 60.77],
  'Кюпцы': [135.26, 60.35],
  'Охотский Перевоз': [136.68, 61.35],
  'Джебарики Хая': [135.84, 62.21],
  'Новый': [135.63, 62.32],
  'Хандыга': [135.58, 62.65],
  'Кескил': [135.43, 62.74],
  'Мегино-Алдан': [134.73, 62.83],
  'Крест-Хальджай': [134.45, 62.83],
  // Вилюй
  'Верхневилюйск': [120.31, 63.45],
  'Вилюйск': [121.65, 63.78],
  'Хатырык-Хомо': [124.31, 63.95],
  'Малыкай': [117.15, 63.33],
  // Другие
  'Березовка': [116.71, 58.45],
};

function normalizeWgs84Coords(lng: number | null, lat: number | null): [number, number] | null {
  if (lng === null || lat === null) return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const isLenaRange = (x: number, y: number) => 
    x > 88 && x < 155 && y > 48 && y < 78;

  if (isLenaRange(lng, lat)) return [lng, lat];
  if (isLenaRange(lat, lng)) return [lat, lng];

  if (lng > -180 && lng <= 180 && lat >= -90 && lat <= 90) return [lng, lat];
  return null;
}

function inferLngLatPair(v1: number | null, v2: number | null): [number, number] | null {
  if (v1 === null || v2 === null) return null;
  return normalizeWgs84Coords(v1, v2);
}

function resolveSettlementCoords(name: string): [number, number] | null {
  const cleanName = name.trim().replace(/^г\.|^с\.|^п\.|^пгт\s+/i, '').trim();
  for (const [key, coords] of Object.entries(SETTLEMENT_COORDS)) {
    if (cleanName.toLowerCase() === key.toLowerCase()) return coords;
  }
  return null;
}

function extractNum(row: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(String(v).replace(',', '.'));
    if (!isNaN(n)) return n;
  }
  return null;
}

function extractStr(row: any, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return String(v).trim();
  }
  return '';
}

function isInvalidPointName(name: string): boolean {
  const n = name.toLowerCase().trim();
  return !n || n === 'n/a' || n === '-' || n === 'нет данных';
}

function extractDateFromFileName(fileName: string): string | null {
  const match = fileName.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}T12:00:00Z`;
  return null;
}

function scoreHeaderRow(row: unknown[]): number {
  if (!Array.isArray(row)) return 0;
  const keywords = ['река', 'пункт', 'дата', 'широта', 'долгота', 'кромка', 'явление', 'уровень'];
  let score = 0;
  for (const cell of row) {
    const s = String(cell ?? '').toLowerCase();
    if (keywords.some((k) => s.includes(k))) score++;
  }
  return score;
}

function tryMergeSecondaryHeaderRow(
  rows: unknown[][],
  headerRowIndex: number,
  primaryHeader: string[],
): string[] | null {
  const nextIdx = headerRowIndex + 1;
  if (nextIdx >= rows.length) return null;
  const next = rows[nextIdx].map((v) => String(v ?? '').trim());
  const nextLower = next.map((v) => v.toLowerCase());
  const hasLatLng = nextLower.some(
    (h) => h.includes('широт') || h.includes('долгот') || h.includes('lat') || h.includes('lng'),
  );
  if (!hasLatLng) return null;
  const hasNumbers = next.some((v) => v !== '' && !isNaN(Number(v.replace(',', '.'))));
  if (hasNumbers) return null;

  return primaryHeader.map((parent, idx) => {
    const sub = next[idx] ?? '';
    if (sub) return `${parent}.${sub}`;
    return parent;
  });
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
  const primaryHeader = rawHeader.map((h, idx) => {
    const base = h || `col_${idx}`;
    const count = (headerCounts.get(base) ?? 0) + 1;
    headerCounts.set(base, count);
    return count === 1 ? base : `${base}__${count}`;
  });

  const mergedHeader = tryMergeSecondaryHeaderRow(rows, headerRowIndex, primaryHeader);
  const header = mergedHeader ?? primaryHeader;
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
    }
    if (hasData) out.push(obj);
  }
  return out;
}

function parseIceRows(rows: any[], fileName: string): ParsedObservation[] {
  const observations: ParsedObservation[] = [];
  for (const row of rows) {
    try {
      const dateValue = row.Date || row['Дата'] || row.date;
      let upperCoords: [number, number] | null = null;
      let lowerCoords: [number, number] | null = null;
      let upperFromNumeric = false;
      let lowerFromNumeric = false;

      const upperLng = extractNum(row, ['UpperLng', 'Верх.Долгота (Lng)', 'Верх.Lng', 'upperLng', 'upper_lng', 'Верхняя кромка.Долгота']);
      const upperLat = extractNum(row, ['UpperLat', 'Верх.Широта (Lat)', 'Верх.Lat', 'upperLat', 'upper_lat', 'Верхняя кромка.Широта']);
      upperCoords = inferLngLatPair(upperLng, upperLat);
      if (upperLng !== null && upperLat !== null && upperCoords) upperFromNumeric = true;

      const lowerLng = extractNum(row, ['LowerLng', 'Низ.Долгота (Lng)', 'Низ.Lng', 'lowerLng', 'lower_lng', 'Нижняя кромка.Долгота']);
      const lowerLat = extractNum(row, ['LowerLat', 'Низ.Широта (Lat)', 'Низ.Lat', 'lowerLat', 'lower_lat', 'Нижняя кромка.Широта']);
      lowerCoords = inferLngLatPair(lowerLng, lowerLat);
      if (lowerLng !== null && lowerLat !== null && lowerCoords) lowerFromNumeric = true;

      const upperName = extractStr(row, ['Верхняя кромка (поселок)', 'Верхняя кромка', 'UpperSettlement', 'upper_settlement']);
      const lowerName = extractStr(row, ['Нижняя кромка (поселок)', 'Нижняя кромка', 'LowerSettlement', 'lower_settlement']);
      
      if (upperName && !upperCoords) {
        const resolved = resolveSettlementCoords(upperName);
        if (resolved) upperCoords = resolved;
      }
      if (lowerName && !lowerCoords) {
        const resolved = resolveSettlementCoords(lowerName);
        if (resolved) lowerCoords = resolved;
      }

      const riverName = extractStr(row, ['Река']);
      const pointName = extractStr(row, ['Пункт']);
      
      if (pointName && !isInvalidPointName(pointName)) {
        const pointCoords = resolveSettlementCoords(pointName);
        if (pointCoords) {
          if (!upperCoords && !lowerCoords) {
             upperCoords = lowerCoords = pointCoords;
          } else if (!upperCoords && !lowerFromNumeric) {
             upperCoords = pointCoords;
          } else if (!lowerCoords && !upperFromNumeric) {
             lowerCoords = pointCoords;
          }
        }
      }

      if (!upperCoords || !lowerCoords) continue;

      const phenomenon = extractStr(row, ['Явление', 'Ледовые явления (примечания)']) || '';
      const notes = extractStr(row, ['Примечания']) || '';

      observations.push({
        date: new Date(dateValue || extractDateFromFileName(fileName) || Date.now()).toISOString(),
        locationName: [riverName, pointName].filter(Boolean).join(' • ') || (upperName + ' - ' + lowerName),
        upperEdgeCoords: upperCoords,
        lowerEdgeCoords: lowerCoords,
        notes: [phenomenon, notes].filter(Boolean).join(' — ') || undefined,
        upperSettlement: upperName || undefined,
        lowerSettlement: lowerName || undefined
      });
    } catch {}
  }
  return observations;
}

function parseLevelRows(rows: any[], fileName: string): StationLevel[] {
  const levels: StationLevel[] = [];
  const fileDate = extractDateFromFileName(fileName);
  for (const row of rows) {
    const stnName = extractStr(row, ['Пункт', 'Station', 'Название']);
    const level = extractNum(row, ['Уровень', 'Уровень воды', 'Level', 'Value']);
    const dateVal = row.Date || row['Дата'] || fileDate;
    if (stnName && level !== null && dateVal) {
      levels.push({
        stationName: stnName,
        date: new Date(dateVal).toISOString(),
        level
      });
    }
  }
  return levels;
}

// --- Main Processor ---
export class DataProcessor {
  private cachePath: string;
  private observations: ParsedObservation[] = [];
  private levels: StationLevel[] = [];

  constructor(dataDir: string) {
    this.cachePath = path.join(dataDir, 'db_cache.json');
  }

  async loadFromCache() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      const parsed = JSON.parse(data);
      this.observations = parsed.observations || [];
      this.levels = parsed.levels || [];
      console.log(`Loaded ${this.observations.length} observations and ${this.levels.length} levels from cache`);
    } catch {
      console.log('No cache found, starting fresh');
    }
  }

  async saveToCache() {
    const data = JSON.stringify({
      lastUpdated: new Date().toISOString(),
      observations: this.observations,
      levels: this.levels
    }, null, 2);
    await fs.writeFile(this.cachePath, data);
  }

  async processFiles(dataDir: string) {
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    const allObservations: ParsedObservation[] = [];
    const allLevels: StationLevel[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== '.xlsx' && ext !== '.xls') continue;

      const absolutePath = path.join(dataDir, entry.name);
      try {
        const buf = await fs.readFile(absolutePath);
        const wb = XLSX.read(buf, { type: 'buffer' });
        
        for (const sheetName of wb.SheetNames) {
          const sheetRows = parseSheetRows(wb.Sheets[sheetName]);
          if (sheetRows.length === 0) continue;

          // Heuristic: if rows have coordinates or "кромка", it's ice data
          const hasIceKeywords = JSON.stringify(sheetRows[0]).toLowerCase().includes('кромка');
          if (hasIceKeywords) {
            allObservations.push(...parseIceRows(sheetRows, entry.name));
          } else {
            allLevels.push(...parseLevelRows(sheetRows, entry.name));
          }
        }
      } catch (err) {
        console.error(`Error processing ${entry.name}:`, err);
      }
    }

    // Merge and deduplicate (simplified)
    this.observations = allObservations;
    this.levels = allLevels;
    await this.saveToCache();
  }

  getData() {
    return {
      observations: this.observations,
      levels: this.levels
    };
  }
}
