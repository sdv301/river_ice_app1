import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DataProcessor } from './dataProcessor';

const app = express();
app.set('etag', false);

/** Данные льда/уровней не кэшируем в браузере (иначе 304 и устаревший JSON). */
function noStoreJson(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
}

const host = process.env.INTERNAL_DATA_HOST ?? '0.0.0.0';
const port = Number(process.env.INTERNAL_DATA_PORT ?? 8787);
const dataDir = path.resolve(process.env.INTERNAL_DATA_DIR ?? path.join(process.cwd(), 'internal-data'));
const syncDir = path.resolve(process.env.INTERNAL_DATA_SYNC_DIR ?? dataDir);

await fs.mkdir(syncDir, { recursive: true }).catch(() => {});

const processor = new DataProcessor(syncDir);
const sourceDirs = (): string[] => (syncDir === dataDir ? [dataDir] : [dataDir, syncDir]);
const allowedExt = new Set(['.xlsx', '.xls', '.csv']);

async function countExcelFilesOnDisk(): Promise<number> {
  const names = new Set<string>();
  for (const dir of sourceDirs()) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && allowedExt.has(path.extname(e.name).toLowerCase())) {
          names.add(e.name);
        }
      }
    } catch {
      // directory may be missing or unreadable
    }
  }
  return names.size;
}
await processor.loadFromCache();

/** При первом запуске в Docker: сразу читаем ./internal-data, не ждём синхронизацию с Яндексом. */
async function ensureLocalDataProcessed(): Promise<void> {
  const filesOnDisk = await countExcelFilesOnDisk();
  if (filesOnDisk === 0) return;
  if (processor.needsReprocess() || processor.getData().observations.length === 0) {
    console.log(`[Startup] Processing ${filesOnDisk} Excel file(s) from ${sourceDirs().join(', ')}...`);
    await processor.processFiles(sourceDirs());
    console.log(
      `[Startup] Ready: ${processor.getData().observations.length} ice observations, ${processor.getData().levels.length} level rows`,
    );
  }
}
await ensureLocalDataProcessed();

let lastSyncTime: string | null = null;
let lastSyncError: string | null = null;
let lastDownloadedCount = 0;

const yandexPublicKey =
  process.env.YANDEX_PUBLIC_KEY ?? 'https://disk.yandex.ru/d/LENyBdYBr2B3rA';
const yandexApiBase =
  process.env.YANDEX_API_BASE ?? 'https://cloud-api.yandex.net/v1/disk/public/resources';

const toDiskPath = (candidate: string): string => {
  const normalized = path.normalize(candidate).replace(/^(\.\.(\/|\\|$))+/, '');
  for (const dir of sourceDirs()) {
    const resolved = path.resolve(dir, normalized);
    if (ensureInsideDir(resolved, dir)) return resolved;
  }
  return path.resolve(dataDir, normalized);
};

const ensureInsideDir = (resolvedPath: string, baseDir: string): boolean => {
  const rel = path.relative(baseDir, resolvedPath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

const ensureInsideDataDir = (resolvedPath: string): boolean =>
  sourceDirs().some((dir) => ensureInsideDir(resolvedPath, dir));

async function listAllYandexFiles(): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const listUrl = `${yandexApiBase}?public_key=${encodeURIComponent(yandexPublicKey)}&limit=${limit}&offset=${offset}`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) throw new Error(`Yandex list failed: ${listRes.status}`);
    const data = (await listRes.json()) as { _embedded?: { items?: any[] } };
    const items = data._embedded?.items ?? [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

/**
 * Background Task: Sync with Yandex Disk and re-process files
 */
async function syncAndProcess(options?: {
  forceReprocess?: boolean;
}): Promise<{ downloadedCount: number; filesOnDisk: number }> {
  console.log('[Sync] Starting Yandex Disk sync...');
  let downloadedCount = 0;
  try {
    const items = await listAllYandexFiles();

    for (const item of items) {
      if (item.type !== 'file' || !allowedExt.has(path.extname(item.name).toLowerCase())) continue;

      const localPath = path.join(syncDir, item.name);
      try {
        const stats = await fs.stat(localPath);
        if (stats.size === item.size) continue;
      } catch {
        // File doesn't exist
      }

      console.log(`[Sync] Downloading new/updated file: ${item.name}`);
      const fileRes = await fetch(item.file);
      if (!fileRes.ok) continue;

      const buf = Buffer.from(await fileRes.arrayBuffer());
      await fs.writeFile(localPath, buf);
      downloadedCount++;
    }

    const filesOnDisk = await countExcelFilesOnDisk();

    const shouldReprocess =
      options?.forceReprocess ||
      downloadedCount > 0 ||
      processor.getData().observations.length === 0 ||
      processor.needsReprocess();
    if (shouldReprocess) {
      console.log(`[Sync] Downloaded ${downloadedCount} files. Starting re-process...`);
      await processor.processFiles(sourceDirs());
      console.log('[Sync] Processing complete.');
    } else {
      console.log('[Sync] No new files found.');
    }

    lastSyncTime = new Date().toISOString();
    lastSyncError = null;
    lastDownloadedCount = downloadedCount;
    return { downloadedCount, filesOnDisk };
  } catch (err: any) {
    lastSyncError = err?.message ?? String(err);
    console.error('[Sync] Error during sync:', err);
    return { downloadedCount, filesOnDisk: await countExcelFilesOnDisk() };
  }
}

function scheduleSync(): void {
  void syncAndProcess().catch((err) => {
    console.error('[Sync] Unhandled sync error:', err);
  });
}

setInterval(scheduleSync, 15 * 60 * 1000);
scheduleSync();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dataDir, syncDir, lastUpdated: new Date().toISOString() });
});

/**
 * NEW: Pre-parsed data endpoint for frontend
 */
function filterByYear<T extends { date: string }>(items: T[], year: number | null): T[] {
  if (!year || Number.isNaN(year)) return items;
  return items.filter((item) => new Date(item.date).getUTCFullYear() === year);
}

app.get('/api/data/status', noStoreJson, async (_req, res) => {
  try {
    const filesOnDisk = await countExcelFilesOnDisk();
    res.json({
      ...processor.getStatus(filesOnDisk),
      lastSyncTime: lastSyncTime ?? processor.getStatus(filesOnDisk).lastSyncTime,
      lastSyncError,
      lastDownloadedCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Status failed' });
  }
});

app.get('/api/data/all', noStoreJson, (req, res) => {
  const yearRaw = req.query.year;
  const year = yearRaw != null && yearRaw !== '' ? Number(yearRaw) : null;
  const data = processor.getData();
  res.json({
    observations: filterByYear(data.observations, year),
    levels: filterByYear(data.levels, year),
    lastUpdated: lastSyncTime,
  });
});

app.post('/api/data/refresh', noStoreJson, async (_req, res) => {
  try {
    const result = await syncAndProcess({ forceReprocess: true });
    const status = processor.getStatus(result.filesOnDisk);
    res.json({
      ok: true,
      ...result,
      ...status,
      lastSyncTime,
      lastSyncError,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? 'Refresh failed', lastSyncError });
  }
});

app.get('/api/disk/files', async (_req, res) => {
  try {
    const nested = await Promise.all(
      sourceDirs().map(async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return Promise.all(
          entries
            .filter((entry) => entry.isFile() && allowedExt.has(path.extname(entry.name).toLowerCase()))
            .map(async (entry) => {
              const absolute = path.resolve(dir, entry.name);
              const stat = await fs.stat(absolute);
              return {
                type: 'file' as const,
                name: entry.name,
                path: entry.name,
                size: stat.size,
                created: stat.birthtime.toISOString(),
                modified: stat.mtime.toISOString(),
                mime_type: '',
              };
            }),
        );
      }),
    );
    res.json({ items: nested.flat() });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Failed to list files' });
  }
});

app.get('/api/disk/file', async (req, res) => {
  const filePath = String(req.query.path ?? '');
  if (!filePath) {
    res.status(400).json({ error: 'Missing query parameter: path' });
    return;
  }

  const absolutePath = toDiskPath(filePath);
  if (!ensureInsideDataDir(absolutePath)) {
    res.status(403).json({ error: 'Path is outside internal data directory' });
    return;
  }

  try {
    await fs.access(absolutePath);
    res.sendFile(absolutePath);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

/** Upstream hosts for /api/map/fetch (closed proxy — no open SSRF). */
function isAllowedMapFetchHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'frexosm.ru' || h === 'www.frexosm.ru') return true;
  if (h === 'server.arcgisonline.com') return true;
  if (h === 'nominatim.openstreetmap.org') return true;
  if (h.endsWith('.cartocdn.com')) return true;
  if (h.endsWith('.basemaps.cartocdn.com')) return true;
  if (h.includes('cartodb') && h.endsWith('.fastly.net')) return true;
  return false;
}

function parseAllowedUpstreamUrl(raw: string): URL | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  let u: URL;
  try {
    u = new URL(decoded);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!isAllowedMapFetchHost(u.hostname)) return null;
  return u;
}

app.get('/api/map/fetch', async (req, res) => {
  const raw = String(req.query.url ?? '');
  if (!raw) {
    res.status(400).json({ error: 'Missing query parameter: url' });
    return;
  }
  const u = parseAllowedUpstreamUrl(raw);
  if (!u) {
    res.status(403).json({ error: 'URL host is not allowed for map proxy' });
    return;
  }
  try {
    const upstream = await fetch(u.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'river-ice-internal-data-api/map-fetch' },
    });
    const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (!upstream.ok) {
      res.status(upstream.status).send(await upstream.text());
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buf);
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? 'Map upstream fetch failed' });
  }
});

/** Only Yandex Disk download hosts — avoids open SSRF. */
function isAllowedYandexDownloadUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'downloader.disk.yandex.ru') return true;
  if (h.endsWith('.disk.yandex.ru')) return true;
  if (h === 'getfile.disk.yandex.ru') return true;
  if (h.endsWith('.getfile.disk.yandex.ru')) return true;
  return false;
}

app.get('/api/yandex/list', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 2000);
  const listUrl = `${yandexApiBase}?public_key=${encodeURIComponent(yandexPublicKey)}&limit=${limit}`;
  try {
    const upstream = await fetch(listUrl, {
      headers: { 'User-Agent': 'river-ice-internal-data-api/yandex-list' },
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8');
    res.send(text);
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? 'Yandex list request failed' });
  }
});

app.get('/api/yandex/file', async (req, res) => {
  const diskPath = String(req.query.path ?? '');
  if (!diskPath) {
    res.status(400).json({ error: 'Missing query parameter: path' });
    return;
  }

  const metaUrl = `${yandexApiBase}/download?public_key=${encodeURIComponent(yandexPublicKey)}&path=${encodeURIComponent(diskPath)}`;
  try {
    const metaRes = await fetch(metaUrl, {
      headers: { 'User-Agent': 'river-ice-internal-data-api/yandex-file' },
    });
    if (!metaRes.ok) {
      res.status(metaRes.status).send(await metaRes.text());
      return;
    }
    const meta = (await metaRes.json()) as { href?: string };
    const href = meta.href;
    if (!href || typeof href !== 'string') {
      res.status(502).json({ error: 'Yandex did not return download href' });
      return;
    }
    if (!isAllowedYandexDownloadUrl(href)) {
      res.status(502).json({ error: 'Unexpected download host from Yandex API' });
      return;
    }
    const binRes = await fetch(href, {
      redirect: 'follow',
      headers: { 'User-Agent': 'river-ice-internal-data-api/yandex-file' },
    });
    const ct = binRes.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    if (!binRes.ok) {
      res.status(binRes.status).send(await binRes.text());
      return;
    }
    const buf = Buffer.from(await binRes.arrayBuffer());
    res.status(200).send(buf);
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? 'Yandex file fetch failed' });
  }
});

app.get('/api/tiles/arcgis/:z/:y/:x', async (req, res) => {
  const z = Number(req.params.z);
  const y = Number(req.params.y);
  const x = Number(req.params.x);
  if (!Number.isInteger(z) || z < 0 || z > 22) {
    res.status(400).json({ error: 'Invalid zoom level' });
    return;
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    res.status(400).json({ error: 'Invalid tile coordinates' });
    return;
  }
  const extent = 2 ** z;
  if (x < 0 || x >= extent || y < 0 || y >= extent) {
    res.status(400).json({ error: 'Tile out of range' });
    return;
  }
  const upstreamUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'river-ice-internal-data-api/arcgis-tile' },
    });
    const ct = upstream.headers.get('content-type') ?? 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (!upstream.ok) {
      res.status(upstream.status).send(await upstream.text());
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buf);
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? 'ArcGIS tile fetch failed' });
  }
});

app.listen(port, host, () => {
  console.log(`Internal data API listening on http://${host}:${port}`);
  console.log(`Serving files from ${dataDir} (sync cache: ${syncDir})`);
});
