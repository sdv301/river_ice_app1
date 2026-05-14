import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
// This service is intended to run inside a private network and be exposed
// externally only via reverse-proxy on :443.
const host = process.env.INTERNAL_DATA_HOST ?? '0.0.0.0';
const port = Number(process.env.INTERNAL_DATA_PORT ?? 8787);
const dataDir = path.resolve(process.env.INTERNAL_DATA_DIR ?? path.join(process.cwd(), 'internal-data'));

const yandexPublicKey =
  process.env.YANDEX_PUBLIC_KEY ?? 'https://disk.yandex.ru/d/LENyBdYBr2B3rA';
const yandexApiBase =
  process.env.YANDEX_API_BASE ?? 'https://cloud-api.yandex.net/v1/disk/public/resources';

const allowedExt = new Set(['.xlsx', '.xls', '.csv']);

const toDiskPath = (candidate: string): string => {
  const normalized = path.normalize(candidate).replace(/^(\.\.(\/|\\|$))+/, '');
  return path.resolve(dataDir, normalized);
};

const ensureInsideDataDir = (resolvedPath: string): boolean => {
  const rel = path.relative(dataDir, resolvedPath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dataDir });
});

app.get('/api/disk/files', async (_req, res) => {
  try {
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && allowedExt.has(path.extname(entry.name).toLowerCase()))
        .map(async (entry) => {
          const absolute = path.resolve(dataDir, entry.name);
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
    res.json({ items: files });
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

// Browser → same origin → this service → Yandex (ПК в LAN может быть без интернета).
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

/** Same-origin raster tiles for MapLibre (browser avoids Esri CORS). z/y/x as in Esri tile URLs. */
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
  console.log(`Serving files from ${dataDir}`);
});
