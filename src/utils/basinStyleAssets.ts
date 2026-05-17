import { MAP_ASSETS_BASE } from '../config/runtimeConfig';

/** Absolute base for basin style relative URLs (/tiles, /fonts, …). Браузер не ходит на frexosm напрямую — см. `mapTransformRequest`. */
export function resolveBasinStyleAssetsBase(): string {
  if (MAP_ASSETS_BASE) return MAP_ASSETS_BASE;
  return 'https://frexosm.ru';
}

function withAssetBase(base: string, url: string): string {
  if (!base || !url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${base}${url}`;
  return url;
}

/** Rewrite relative tile/font URLs so basin works without local /tiles and /fonts. */
export function patchBasinStyleUrls<T extends Record<string, unknown>>(style: T, base: string): T {
  if (!base) return style;
  const out = { ...style } as Record<string, unknown>;

  if (typeof out.glyphs === 'string') {
    out.glyphs = withAssetBase(base, out.glyphs);
  }
  if (typeof out.sprite === 'string') {
    out.sprite = withAssetBase(base, out.sprite);
  }

  const sources = out.sources;
  if (sources && typeof sources === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(sources as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') {
        next[key] = raw;
        continue;
      }
      const s = { ...(raw as Record<string, unknown>) };
      if (typeof s.url === 'string') s.url = withAssetBase(base, s.url);
      if (Array.isArray(s.tiles)) {
        s.tiles = s.tiles.map((t) => (typeof t === 'string' ? withAssetBase(base, t) : t));
      }
      next[key] = s;
    }
    out.sources = next;
  }

  return out as T;
}
