const boolFromEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/** Treat empty Vite env as unset so `??` fallbacks apply (Docker often passes ""). */
const viteString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
};

/** Vite injects import.meta.env; Node API (tsx in Docker) uses process.env. */
function viteEnv(): Record<string, unknown> {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env as Record<string, unknown>;
    }
  } catch {
    // not in a Vite bundle
  }
  return {};
}

function envStr(key: string): string | undefined {
  return viteString(viteEnv()[key]) ?? viteString(process.env[key]);
}

function isProdBuild(): boolean {
  const prod = viteEnv().PROD;
  if (prod === true) return true;
  if (prod === false) return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * URL к файлам из `public/` с учётом `base` в vite.config (подкаталог на сервере).
 * Без этого `/water_levels_db.json` уходит в корень хоста, а не в `/my-app/...`.
 */
export function publicAssetUrl(relativePath: string): string {
  const path = relativePath.replace(/^\/+/, '');
  const base = String(viteEnv().BASE_URL ?? '/');
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${path}`;
}

export const EXTERNAL_NETWORK_ALLOWED = boolFromEnv(
  envStr('VITE_ENABLE_EXTERNAL_NETWORK'),
  !isProdBuild(),
);

export const DATA_SOURCE_MODE = (
  envStr('VITE_DATA_SOURCE') ?? (isProdBuild() ? 'internal' : 'yandex')
).toLowerCase();
export const INTERNAL_DATA_API_BASE = trimTrailingSlash(envStr('VITE_INTERNAL_DATA_API_BASE') ?? '/api');

/** По умолчанию спутник: тайлы идут через `/api/tiles/arcgis` (сервер → Esri), браузеру не нужен прямой выход в интернет. */
export const MAP_DEFAULT_TYPE = (envStr('VITE_MAP_DEFAULT_TYPE') ?? 'satellite').toLowerCase();
/** Default via same-origin proxy so the browser does not hit Esri directly (avoids CORS on LAN origins). */
export const MAP_SATELLITE_TILES_URL =
  envStr('VITE_MAP_SATELLITE_TILES_URL') ??
  `${INTERNAL_DATA_API_BASE}/tiles/arcgis/{z}/{y}/{x}`;
/** Вектор: URL остаётся Carto; загрузка идёт через `transformRequest` → `/api/map/fetch` (сервер → Carto). */
export const MAP_VECTOR_STYLE_URL =
  envStr('VITE_MAP_VECTOR_STYLE_URL') ??
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
export const MAP_BASIN_STYLE_URL =
  envStr('VITE_MAP_BASIN_STYLE_URL') ?? publicAssetUrl('frexosm_basin_style.json');

/** If set, basin style relative paths (/tiles, /fonts, …) are prefixed (e.g. https://frexosm.ru). */
export const MAP_ASSETS_BASE = trimTrailingSlash(envStr('VITE_MAP_ASSETS_BASE') ?? '');

export const NOMINATIM_ENABLED = boolFromEnv(envStr('VITE_NOMINATIM_ENABLED'), EXTERNAL_NETWORK_ALLOWED);
export const NOMINATIM_URL = envStr('VITE_NOMINATIM_URL') ?? 'https://nominatim.openstreetmap.org/reverse';

export const YANDEX_PUBLIC_KEY =
  envStr('VITE_YANDEX_PUBLIC_KEY') ??
  process.env.YANDEX_PUBLIC_KEY ??
  'https://disk.yandex.ru/d/LENyBdYBr2B3rA';
export const YANDEX_API_BASE =
  envStr('VITE_YANDEX_API_BASE') ??
  process.env.YANDEX_API_BASE ??
  'https://cloud-api.yandex.net/v1/disk/public/resources';
