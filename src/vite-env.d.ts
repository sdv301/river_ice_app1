/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_EXTERNAL_NETWORK?: string;
  readonly VITE_DATA_SOURCE?: string;
  readonly VITE_INTERNAL_DATA_API_BASE?: string;
  readonly VITE_MAP_DEFAULT_TYPE?: string;
  readonly VITE_MAP_SATELLITE_TILES_URL?: string;
  readonly VITE_MAP_VECTOR_STYLE_URL?: string;
  readonly VITE_MAP_BASIN_STYLE_URL?: string;
  readonly VITE_NOMINATIM_ENABLED?: string;
  readonly VITE_NOMINATIM_URL?: string;
  readonly VITE_YANDEX_PUBLIC_KEY?: string;
  readonly VITE_YANDEX_API_BASE?: string;
  readonly VITE_TILE_CACHE_HOSTS?: string;
  readonly VITE_INTERNAL_DATA_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
