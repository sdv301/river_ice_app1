import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
// This service is intended to run inside a private network and be exposed
// externally only via reverse-proxy on :443.
const host = process.env.INTERNAL_DATA_HOST ?? '0.0.0.0';
const port = Number(process.env.INTERNAL_DATA_PORT ?? 8787);
const dataDir = path.resolve(process.env.INTERNAL_DATA_DIR ?? path.join(process.cwd(), 'internal-data'));

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

/** Only Yandex Disk download hosts — avoids open SSRF via ?url=. */
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

// Browser cannot fetch downloader.disk.yandex.ru (no CORS); same-origin proxy through gateway.
app.get('/api/yandex/proxy', async (req, res) => {
  const target = String(req.query.url ?? '');
  if (!target) {
    res.status(400).json({ error: 'Missing query parameter: url' });
    return;
  }
  if (!isAllowedYandexDownloadUrl(target)) {
    res.status(403).json({ error: 'URL host is not an allowed Yandex Disk download endpoint' });
    return;
  }

  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: { 'User-Agent': 'river-ice-internal-data-api/yandex-proxy' },
    });
    const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).send(text);
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buf);
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? 'Upstream fetch failed' });
  }
});

app.listen(port, host, () => {
  console.log(`Internal data API listening on http://${host}:${port}`);
  console.log(`Serving files from ${dataDir}`);
});
