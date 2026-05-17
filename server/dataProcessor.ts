import * as XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs/promises';
import { isHydrologyBulletinFile, isIceFile, isWaterFile } from '../shared/fileFilters.ts';
import { normalizeEdgeOrder } from '../shared/normalizeEdge.ts';
import {
  extractDateFromFileName,
  parseIceRows,
  parseOperationalWaterLevels,
  parseSheetRows,
  type ParsedObservation,
} from '../src/utils/yandexDisk.ts';

export type { ParsedObservation };

/** Bump when parsing rules change so stale db_cache.json is reprocessed. */
export const DATA_CACHE_VERSION = 10;

export interface StationLevel {
  stationName: string;
  date: string;
  level: number;
}

function extractStr(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return String(v).trim();
  }
  return '';
}

function extractNum(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(String(v).replace(',', '.'));
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

function bulletinLevelsFromSheet(fileName: string, ws: XLSX.WorkSheet): StationLevel[] {
  const rows2d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  const isoDate = extractDateFromFileName(fileName);
  if (!isoDate) return [];
  const stations = parseOperationalWaterLevels(rows2d, isoDate);
  const levels: StationLevel[] = [];
  for (const station of stations) {
    for (const [dateKey, level] of Object.entries(station.levels)) {
      levels.push({
        stationName: station.name,
        date: new Date(dateKey).toISOString(),
        level,
      });
    }
  }
  return levels;
}

function parseLevelRows(rows: Record<string, unknown>[], fileName: string): StationLevel[] {
  const levels: StationLevel[] = [];
  const fileDate = extractDateFromFileName(fileName);
  for (const row of rows) {
    const stnName = extractStr(row, ['Пункт', 'Station', 'Название']);
    const level = extractNum(row, ['Уровень', 'Уровень воды', 'Level', 'Value']);
    const dateVal = row.Date ?? row['Дата'] ?? fileDate;
    if (stnName && level !== null && dateVal) {
      levels.push({
        stationName: stnName,
        date: new Date(String(dateVal)).toISOString(),
        level,
      });
    }
  }
  return levels;
}

function sheetHasIceKeywords(sheetRows: Record<string, unknown>[]): boolean {
  if (sheetRows.length === 0) return false;
  const sample = JSON.stringify(sheetRows[0]).toLowerCase();
  return sample.includes('кромка') || sample.includes('ледов') || sample.includes('явлен');
}

export class DataProcessor {
  private cachePath: string;
  private observations: ParsedObservation[] = [];
  private levels: StationLevel[] = [];
  private lastUpdated: string | null = null;
  private parseErrors: string[] = [];
  private cacheStale = false;

  constructor(dataDir: string) {
    this.cachePath = path.join(dataDir, 'db_cache.json');
  }

  async loadFromCache() {
    try {
      const data = await fs.readFile(this.cachePath, 'utf8');
      const parsed = JSON.parse(data);
      this.observations = parsed.observations || [];
      this.levels = parsed.levels || [];
      this.lastUpdated = parsed.lastUpdated ?? null;
      this.parseErrors = parsed.parseErrors || [];
      if (parsed.cacheVersion !== DATA_CACHE_VERSION) {
        console.log(
          `Cache version ${parsed.cacheVersion ?? 'none'} != ${DATA_CACHE_VERSION}, will reprocess Excel files`,
        );
        this.cacheStale = true;
        this.observations = [];
        this.levels = [];
        this.parseErrors = [];
      } else {
        console.log(`Loaded ${this.observations.length} observations and ${this.levels.length} levels from cache`);
      }
    } catch {
      console.log('No cache found, starting fresh');
      this.cacheStale = true;
    }
  }

  needsReprocess(): boolean {
    return this.cacheStale;
  }

  async saveToCache() {
    const data = JSON.stringify({
      cacheVersion: DATA_CACHE_VERSION,
      lastUpdated: new Date().toISOString(),
      observations: this.observations,
      levels: this.levels,
      parseErrors: this.parseErrors,
    }, null, 2);
    await fs.writeFile(this.cachePath, data);
    this.lastUpdated = new Date().toISOString();
    this.cacheStale = false;
  }

  async processFiles(dataDirs: string | string[]) {
    const dirs = Array.isArray(dataDirs) ? dataDirs : [dataDirs];
    const allObservations: ParsedObservation[] = [];
    const allLevels: StationLevel[] = [];
    const errors: string[] = [];
    /** Один и тот же xlsx в /data и /cache не разбираем дважды (приоритет у первой папки). */
    const seenFiles = new Set<string>();

    for (const dataDir of dirs) {
      let entries;
      try {
        entries = await fs.readdir(dataDir, { withFileTypes: true });
      } catch {
        continue;
      }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fileName = entry.name;
      if (seenFiles.has(fileName)) continue;
      seenFiles.add(fileName);
      const ext = path.extname(fileName).toLowerCase();
      if (ext !== '.xlsx' && ext !== '.xls') continue;

      const absolutePath = path.join(dataDir, fileName);
      try {
        const buf = await fs.readFile(absolutePath);
        const wb = XLSX.read(buf, { type: 'buffer' });

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const sheetRows = parseSheetRows(ws) as Record<string, unknown>[];
          if (sheetRows.length === 0 && !isHydrologyBulletinFile(fileName)) continue;

          if (isHydrologyBulletinFile(fileName)) {
            allLevels.push(...bulletinLevelsFromSheet(fileName, ws));
            if (!extractDateFromFileName(fileName)) continue;
            const fileWarnings: string[] = [];
            const hydroIce = parseIceRows(sheetRows, fileName, undefined, fileWarnings).map((obs) =>
              normalizeEdgeOrder(obs),
            );
            if (hydroIce.length > 0) {
              allObservations.push(...hydroIce);
              errors.push(...fileWarnings);
            }
            continue;
          }

          const fileWarnings: string[] = [];
          if (isIceFile(fileName) || sheetHasIceKeywords(sheetRows)) {
            if (!extractDateFromFileName(fileName)) {
              errors.push(`${fileName}: пропущен — в имени нет даты (дд.мм.гггг)`);
              continue;
            }
            const parsed = parseIceRows(sheetRows, fileName, undefined, fileWarnings).map((obs) =>
              normalizeEdgeOrder(obs),
            );
            allObservations.push(...parsed);
            errors.push(...fileWarnings);
          } else if (isWaterFile(fileName)) {
            allLevels.push(...parseLevelRows(sheetRows, fileName));
          } else if (sheetHasIceKeywords(sheetRows)) {
            if (!extractDateFromFileName(fileName)) {
              errors.push(`${fileName}: пропущен — в имени нет даты (дд.мм.гггг)`);
              continue;
            }
            const parsed = parseIceRows(sheetRows, fileName, undefined, fileWarnings).map((obs) =>
              normalizeEdgeOrder(obs),
            );
            allObservations.push(...parsed);
            errors.push(...fileWarnings);
          } else {
            allLevels.push(...parseLevelRows(sheetRows, fileName));
          }
        }
      } catch (err: any) {
        errors.push(`${fileName}: ${err?.message ?? String(err)}`);
        console.error(`Error processing ${fileName}:`, err);
      }
    }
    }

    this.observations = allObservations.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    this.levels = allLevels;
    this.parseErrors = errors;
    await this.saveToCache();
  }

  getData() {
    return {
      observations: this.observations,
      levels: this.levels,
    };
  }

  getStatus(filesOnDisk: number) {
    return {
      lastSyncTime: this.lastUpdated,
      filesOnDisk,
      observationsCount: this.observations.length,
      levelsCount: this.levels.length,
      errors: this.parseErrors,
    };
  }
}
