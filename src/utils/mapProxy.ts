import { INTERNAL_DATA_API_BASE } from '../config/runtimeConfig';

/** Hosts that may be fetched via same-origin `/api/map/fetch` (server must have egress). */
function isAllowedMapUpstreamHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'frexosm.ru' || h === 'www.frexosm.ru') return true;
  if (h === 'server.arcgisonline.com') return true;
  if (h === 'nominatim.openstreetmap.org') return true;
  if (h.endsWith('.cartocdn.com')) return true;
  if (h.endsWith('.basemaps.cartocdn.com')) return true;
  if (h.includes('cartodb') && h.endsWith('.fastly.net')) return true;
  return false;
}

export function shouldProxyMapUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return isAllowedMapUpstreamHost(u.hostname);
  } catch {
    return false;
  }
}

function mapFetchEndpoint(): string {
  const base = INTERNAL_DATA_API_BASE;
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base}/map/fetch`;
  }
  if (typeof window === 'undefined') return '/api/map/fetch';
  const path = base.startsWith('/') ? base : `/${base}`;
  return `${window.location.origin}${path}/map/fetch`;
}

/**
 * MapLibre transformRequest: перенаправляет разрешённые внешние URL на same-origin прокси
 * (ПК в LAN без VPN не ходит на Carto/Esri/OSM напрямую).
 */
export function mapTransformRequest(
  url: string,
  _resourceType?: string,
): { url: string } | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!/^https?:\/\//i.test(url)) return undefined;
  try {
    const u = new URL(url);
    if (u.origin === window.location.origin) return undefined;
    if (!shouldProxyMapUrl(url)) return undefined;
    return { url: `${mapFetchEndpoint()}?url=${encodeURIComponent(url)}` };
  } catch {
    return undefined;
  }
}
