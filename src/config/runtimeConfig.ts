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

export const EXTERNAL_NETWORK_ALLOWED = boolFromEnv(
  import.meta.env.VITE_ENABLE_EXTERNAL_NETWORK,
  !import.meta.env.PROD,
);

export const DATA_SOURCE_MODE = (import.meta.env.VITE_DATA_SOURCE ?? (import.meta.env.PROD ? 'internal' : 'yandex')).toLowerCase();
export const INTERNAL_DATA_API_BASE = trimTrailingSlash(import.meta.env.VITE_INTERNAL_DATA_API_BASE ?? '/api');

export const MAP_DEFAULT_TYPE = (import.meta.env.VITE_MAP_DEFAULT_TYPE ?? (EXTERNAL_NETWORK_ALLOWED ? 'satellite' : 'local')).toLowerCase();
export const MAP_SATELLITE_TILES_URL =
  viteString(import.meta.env.VITE_MAP_SATELLITE_TILES_URL) ??
  (EXTERNAL_NETWORK_ALLOWED ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : '');
export const MAP_VECTOR_STYLE_URL =
  viteString(import.meta.env.VITE_MAP_VECTOR_STYLE_URL) ??
  (EXTERNAL_NETWORK_ALLOWED ? 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' : '');
export const MAP_BASIN_STYLE_URL = import.meta.env.VITE_MAP_BASIN_STYLE_URL ?? '/frexosm_basin_style.json';

/** If set, basin style relative paths (/tiles, /fonts, …) are prefixed (e.g. https://frexosm.ru). */
export const MAP_ASSETS_BASE = trimTrailingSlash(import.meta.env.VITE_MAP_ASSETS_BASE ?? '');

export const NOMINATIM_ENABLED = boolFromEnv(import.meta.env.VITE_NOMINATIM_ENABLED, EXTERNAL_NETWORK_ALLOWED);
export const NOMINATIM_URL = import.meta.env.VITE_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org/reverse';

export const YANDEX_PUBLIC_KEY = import.meta.env.VITE_YANDEX_PUBLIC_KEY ?? 'https://disk.yandex.ru/d/LENyBdYBr2B3rA';
export const YANDEX_API_BASE = import.meta.env.VITE_YANDEX_API_BASE ?? 'https://cloud-api.yandex.net/v1/disk/public/resources';
