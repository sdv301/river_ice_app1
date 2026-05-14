import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, Popup } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getSegments, generateGeoJSONSource, interpolateAlongRiver } from '../utils/mapUtils';
import { Droplets, Snowflake, AlertTriangle, CircleDot, Layers, Home, Printer, X, Crop, Camera } from 'lucide-react';
import Tooltip from './Tooltip';
import type { IceJam, PickMode } from '../types';
import { SETTLEMENTS } from '../utils/riverData';
import { useAppStore } from '../store/appStore';
import { useIceStore } from '../store/iceStore';
import { useWaterLevelStore } from '../store/waterLevelStore';
import {
  EXTERNAL_NETWORK_ALLOWED,
  MAP_ASSETS_BASE,
  MAP_BASIN_STYLE_URL,
  MAP_DEFAULT_TYPE,
  MAP_SATELLITE_TILES_URL,
  MAP_VECTOR_STYLE_URL,
  NOMINATIM_ENABLED,
  NOMINATIM_URL,
} from '../config/runtimeConfig';
import { patchBasinStyleUrls, resolveBasinStyleAssetsBase } from '../utils/basinStyleAssets';

type MapType = 'satellite' | 'vector' | 'basin' | 'local';
type RiskLevel = 'normal' | 'watch' | 'warning' | 'danger';
const WATER_RISE_ALERT_CM = 10;
const RISK_LABELS: Record<RiskLevel, string> = {
  normal: 'Норма',
  watch: 'Внимание',
  warning: 'НЯ (Неблагоприятное явление)',
  danger: 'ОЯ (Опасное явление)',
};

type RiskNotification = {
  id: number;
  message: string;
  level: RiskLevel;
};

type PhenomenonKind = 'water' | 'drift' | 'freeze' | 'jam' | 'unknown';
const PHENOMENON_INFO: Record<PhenomenonKind, { title: string; description: string }> = {
  water: {
    title: 'Чистая вода',
    description: 'Участок свободен ото льда или наблюдается вода на льду.',
  },
  drift: {
    title: 'Ледоход',
    description: 'Наблюдается движение льда, подвижки, закраины или разводья.',
  },
  freeze: {
    title: 'Ледостав',
    description: 'Фиксируется устойчивый ледяной покров на участке реки.',
  },
  jam: {
    title: 'Затор',
    description: 'Обнаружено скопление льда с риском подпора воды.',
  },
  unknown: {
    title: 'Не определено',
    description: 'Есть отметка наблюдения, но тип явления не распознан.',
  },
};

function detectPhenomenonKind(notes?: string, locationName?: string): PhenomenonKind {
  const text = `${notes ?? ''} ${locationName ?? ''}`.toLowerCase();
  if (text.includes('затор') || text.includes('навал')) return 'jam';
  if (text.includes('чистая вода') || text.includes('вода на льду')) return 'water';
  if (text.includes('ледостав')) return 'freeze';
  if (
    text.includes('ледоход') ||
    text.includes('подвижк') ||
    text.includes('закраин') ||
    text.includes('развод')
  ) {
    return 'drift';
  }
  return 'unknown';
}

const MAP_STYLES: Record<MapType, any> = {
  'local': {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f8fafc' } }]
  },
  'satellite': {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [MAP_SATELLITE_TILES_URL],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      }
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 22 }]
  },
  'vector': MAP_VECTOR_STYLE_URL,
  'basin': MAP_BASIN_STYLE_URL,
};

const availableMapTypes = new Set<MapType>(['local']);
if (EXTERNAL_NETWORK_ALLOWED && MAP_SATELLITE_TILES_URL) availableMapTypes.add('satellite');
if (EXTERNAL_NETWORK_ALLOWED && MAP_VECTOR_STYLE_URL) availableMapTypes.add('vector');
if (MAP_BASIN_STYLE_URL) availableMapTypes.add('basin');

const resolveInitialMapType = (): MapType => {
  const preferred = MAP_DEFAULT_TYPE as MapType;
  if (availableMapTypes.has(preferred)) return preferred;
  if (availableMapTypes.has('local')) return 'local';
  return 'satellite';
};

// Memoized Marker Components for performance
const StationMarker = React.memo(({
  stn,
  level,
  onSelect,
  riskLevel = 'normal',
}: {
  stn: any,
  level: number,
  onSelect: (stn: any) => void,
  riskLevel?: RiskLevel,
}) => {
  let colorClass = 'bg-green-500';
  let textClass = 'text-green-800';
  let borderClass = 'border-green-600';
  
  if (riskLevel === 'danger') {
    colorClass = 'bg-red-600';
    textClass = 'text-white';
    borderClass = 'border-red-800';
  } else if (riskLevel === 'warning') {
    colorClass = 'bg-amber-400';
    textClass = 'text-amber-950';
    borderClass = 'border-amber-600';
  } else if (riskLevel === 'watch') {
    colorClass = 'bg-blue-100';
    textClass = 'text-blue-700';
    borderClass = 'border-blue-300';
  }

  return (
    <Marker longitude={stn.coords![0]} latitude={stn.coords![1]} anchor="bottom" offset={[0, -8]}>
      <div className={`px-1.5 py-0.5 rounded shadow-sm text-[9px] font-bold border ${colorClass} ${textClass} ${borderClass} opacity-90 cursor-pointer hover:opacity-100 hover:scale-110 transition-transform`}
           onClick={(e) => {
             e.stopPropagation();
             onSelect(stn);
           }}
      >
        {level} см
        {riskLevel === 'danger' && ' (ОЯ)'}
        {riskLevel === 'warning' && ' (НЯ)'}
      </div>
    </Marker>
  );
});

const SettlementMarker = React.memo(({
  settlement,
  onSelect,
  riskLevel = 'normal',
}: {
  settlement: any,
  onSelect: (s: any) => void,
  riskLevel?: RiskLevel,
}) => {
  return (
    <Marker longitude={settlement.coords[0]} latitude={settlement.coords[1]} anchor="center">
       <div 
        className="flex items-center gap-1 group cursor-pointer hover:scale-110 transition-transform"
         onClick={(e) => {
           e.stopPropagation();
           onSelect(settlement);
         }}
       >
         <CircleDot className={`w-3 h-3 ${
           riskLevel === 'danger'
             ? 'text-red-100 fill-red-500 scale-125'
             : riskLevel === 'warning'
               ? 'text-yellow-100 fill-yellow-500 scale-125'
               : riskLevel === 'watch'
                 ? 'text-slate-200 fill-slate-600'
                 : settlement.isMajor
                   ? 'text-white fill-slate-800 scale-125'
                   : 'text-slate-200 fill-slate-600'
         } drop-shadow`} />
         <span className={`font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] whitespace-nowrap px-1 rounded-sm backdrop-blur-[2px] ${
           riskLevel === 'danger'
             ? 'text-red-50 bg-red-700/75 text-xs ring-1 ring-red-300/80 shadow-[0_0_12px_rgba(239,68,68,0.8)] animate-pulse'
             : riskLevel === 'warning'
               ? 'text-yellow-50 bg-yellow-700/75 text-xs ring-1 ring-yellow-300/80'
               : riskLevel === 'watch'
                 ? 'text-slate-100 bg-slate-900/40 text-[10px] opacity-90'
                 : settlement.isMajor
                   ? 'text-white bg-slate-900/60 text-xs tracking-wide'
                   : 'text-slate-100 bg-slate-900/40 text-[10px] opacity-90'
         }`}>
           {settlement.name}
           {riskLevel === 'danger' && <span className="ml-1 text-[8px] px-1 bg-red-600 text-white rounded">ОЯ</span>}
           {riskLevel === 'warning' && <span className="ml-1 text-[8px] px-1 bg-amber-500 text-white rounded">НЯ</span>}
         </span>
       </div>
    </Marker>
  );
});

export default function MapEditor() {
  const {
    getCurrentObservationData,
    jams,
    draftJamCoords,
    setDraftJamCoords,
    getSectionSpeeds,
    observations,
    currentDate
  } = useIceStore();
  const currentData = useMemo(() => getCurrentObservationData(), [getCurrentObservationData, observations, currentDate]);
  const sectionSpeeds = useMemo(() => getSectionSpeeds(), [getSectionSpeeds, observations]);
  const { stations } = useWaterLevelStore();
  const { 
    isAdmin, pickMode, draftUpper, draftLower, 
    setDraftUpper, setDraftLower,
    setSelectedSettlement, selectedSettlement, mapCenter, isSidebarOpen,
    isPrintCropMode, setIsPrintCropMode, printType, setIsSidebarOpen
  } = useAppStore();
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (mapCenter && mapRef.current) {
      mapRef.current.flyTo({ center: [mapCenter.lng, mapCenter.lat], zoom: mapCenter.zoom, essential: true });
    }
  }, [mapCenter]);
  
  const [mapType, setMapType] = useState<MapType>(resolveInitialMapType());
  const [basinStyleSpec, setBasinStyleSpec] = useState<Record<string, unknown> | null>(null);
  const [viewState, setViewState] = useState({ longitude: 129.7, latitude: 62.0, zoom: 5, pitch: 0 });
  const [selectedDistrict, setSelectedDistrict] = useState<{name: string, lngLat: [number, number]} | null>(null);
  const [activePhenomenon, setActivePhenomenon] = useState<{
    id: string;
    coords: [number, number];
    kind: PhenomenonKind;
    isCurrent: boolean;
  } | null>(null);
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | null>(null);
  const [riskNotifications, setRiskNotifications] = useState<RiskNotification[]>([]);
  const previousSettlementRiskRef = useRef<globalThis.Map<string, number>>(new globalThis.Map<string, number>());
  const hasAskedNotificationPermissionRef = useRef(false);

  // Print Crop State
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [cropStart, setCropStart] = useState<{x: number, y: number} | null>(null);
  const [customCropRect, setCustomCropRect] = useState<{left: number, top: number, width: number, height: number} | null>(null);
  const mapRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const styleUrl = typeof MAP_BASIN_STYLE_URL === 'string' ? MAP_BASIN_STYLE_URL : '';
    if (!styleUrl) {
      setBasinStyleSpec(null);
      return () => {
        cancelled = true;
      };
    }
    fetch(styleUrl)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((raw) => {
        if (cancelled) return;
        setBasinStyleSpec(patchBasinStyleUrls(raw, resolveBasinStyleAssetsBase()));
      })
      .catch(() => {
        if (!cancelled) setBasinStyleSpec(null);
      });
    return () => {
      cancelled = true;
    };
  }, [MAP_BASIN_STYLE_URL, EXTERNAL_NETWORK_ALLOWED, MAP_ASSETS_BASE]);

  const resolvedMapStyle = useMemo(() => {
    if (mapType === 'basin') {
      if (basinStyleSpec) return basinStyleSpec;
      return MAP_STYLES.local;
    }
    return MAP_STYLES[mapType] as (typeof MAP_STYLES)[MapType];
  }, [mapType, basinStyleSpec]);

  const observationPoints = useMemo(() => {
    return observations.flatMap((obs) => {
      return [
        {
          id: `${obs.id}-upper`,
          coords: obs.upperEdgeCoords,
          type: 'upper' as const,
        },
        {
          id: `${obs.id}-lower`,
          coords: obs.lowerEdgeCoords,
          type: 'lower' as const,
        },
      ];
    });
  }, [observations]);
  const observationPointsGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: observationPoints.map((pt) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: pt.coords,
      },
      properties: {
        id: pt.id,
        pointType: pt.type,
      },
    })),
  }), [observationPoints]);
  const currentDay = useMemo(() => new Date(currentDate).toISOString().slice(0, 10), [currentDate]);
  const hasAnyObservations = observations.length > 0;
  const hasObservationOnSelectedDay = useMemo(
    () => observations.some((obs) => new Date(obs.date).toISOString().slice(0, 10) === currentDay),
    [observations, currentDay]
  );
  const phenomenonMarkers = useMemo(() => {
    return observations.map((obs) => {
      const kind = detectPhenomenonKind(obs.notes, obs.locationName);
      return {
        id: `ph-${obs.id}`,
        day: new Date(obs.date).toISOString().slice(0, 10),
        kind,
        coords: interpolateAlongRiver(obs.upperEdgeCoords, obs.lowerEdgeCoords, 0.5),
      };
    });
  }, [observations]);

  const getRelativePoint = (e: React.MouseEvent) => {
    const rect = mapRootRef.current?.getBoundingClientRect();
    if (!rect) return { x: e.clientX, y: e.clientY };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleCropMouseDown = (e: React.MouseEvent) => {
    setCropStart(getRelativePoint(e));
  };
  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (cropStart && isDrawingMode) {
      const pt = getRelativePoint(e);
      setCustomCropRect({
        left: Math.min(cropStart.x, pt.x),
        top: Math.min(cropStart.y, pt.y),
        width: Math.abs(pt.x - cropStart.x),
        height: Math.abs(pt.y - cropStart.y)
      });
    }
  };
  const handleCropMouseUp = () => {
    if (cropStart) {
      setCropStart(null);
      setIsDrawingMode(false);
    }
  };

  const waitForMapRender = (map: any): Promise<void> =>
    new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      map.once('idle', done);
      window.setTimeout(done, 700);
    });

  const getCropArea = () => {
    if (!mapRootRef.current) return null;
    const containerRect = mapRootRef.current.getBoundingClientRect();
    
    if (customCropRect && customCropRect.width > 20 && customCropRect.height > 20) {
      return customCropRect;
    }
    
    const defaultW = Math.min(containerRect.width * 0.85, 1200);
    const defaultH = Math.min(containerRect.height * 0.75, 800);
    return {
      left: (containerRect.width - defaultW) / 2,
      top: (containerRect.height - defaultH) / 2,
      width: defaultW,
      height: defaultH,
    };
  };

  const captureSelectedArea = async (): Promise<string | null> => {
    if (!mapRef.current || !mapRootRef.current) return null;

    const map = mapRef.current.getMap();
    const sourceCanvas = map.getCanvas();
    const containerRect = mapRootRef.current.getBoundingClientRect();
    const crop = getCropArea();
    if (!crop) return null;
    if (sourceCanvas.width < 2 || sourceCanvas.height < 2) return null;

    const scaleX = sourceCanvas.width / containerRect.width;
    const scaleY = sourceCanvas.height / containerRect.height;
    const srcX = Math.max(0, Math.round(crop.left * scaleX));
    const srcY = Math.max(0, Math.round(crop.top * scaleY));
    const srcW = Math.min(Math.round(crop.width * scaleX), sourceCanvas.width - srcX);
    const srcH = Math.min(Math.round(crop.height * scaleY), sourceCanvas.height - srcY);
    if (srcW < 10 || srcH < 10) return null;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = srcW;
    outCanvas.height = srcH;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return null;

    const loadImageFromDataUrl = (dataUrl: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      });

    let lastFullFrame: string | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      map.triggerRepaint();
      await waitForMapRender(map);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      try {
        const fullFrame = sourceCanvas.toDataURL('image/png');
        if (!fullFrame || fullFrame.length <= 1000) {
          await new Promise((resolve) => window.setTimeout(resolve, 180));
          continue;
        }
        lastFullFrame = fullFrame;

        const frameImage = await loadImageFromDataUrl(fullFrame);
        ctx.clearRect(0, 0, srcW, srcH);
        ctx.drawImage(frameImage, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
        const dataUrl = outCanvas.toDataURL('image/png');
        if (dataUrl && dataUrl.length > 1000) return dataUrl;
      } catch {
        // SecurityError can happen on tainted canvases, try again after a short delay.
      }

      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }

    // Fallback: return full frame if crop failed but frame capture worked.
    return lastFullFrame;
  };

  const handleExecutePrint = async () => {
    const dataUrl = await captureSelectedArea();
    
    if (!dataUrl) {
      alert('Не удалось захватить область. Попробуйте тип карты "Вектор" или "Офлайн".');
      return;
    }

    const bwStyle = printType === 'bw' ? 'filter: grayscale(100%) contrast(110%);' : '';
    
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      alert('Браузер заблокировал всплывающее окно.');
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Печать карты</title>
  <style>
    * { margin: 0; padding: 0; }
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: white; }
    img { max-width: 100%; max-height: 100vh; ${bwStyle} }
    @media print {
      @page { margin: 5mm; }
      img { max-width: 100%; height: auto; }
    }
  </style>
</head>
<body>
  <img src="${dataUrl}" onload="setTimeout(function(){window.print();},100);" />
</body>
</html>`);
    printWindow.document.close();
    
    setIsPrintCropMode(false);
    setCustomCropRect(null);
    setIsDrawingMode(false);
    setIsSidebarOpen(true);
  };

  const downloadMapScreenshot = async () => {
    const dataUrl = await captureSelectedArea();
    
    if (!dataUrl) {
      alert('Не удалось создать скриншот. Спутниковые тайлы имеют CORS-ограничения.\n\nРешение: переключите тип карты на "Вектор" или "Офлайн".');
      return;
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `map-screenshot-${stamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setIsPrintCropMode(false);
    setCustomCropRect(null);
    setIsDrawingMode(false);
    setIsSidebarOpen(true);
  };

  const handleCancelPrint = () => {
    setIsPrintCropMode(false);
    setCustomCropRect(null);
    setIsDrawingMode(false);
    setIsSidebarOpen(true);
  };

  const updateBounds = () => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    const bounds = map.getBounds();
    setMapBounds([
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ]);
  };

  useEffect(() => {
    // Initial bounds after map is ready
    const timer = setTimeout(updateBounds, 1000);
    return () => clearTimeout(timer);
  }, []);

  const onMoveEnd = (evt: any) => {
    setViewState(evt.viewState);
    updateBounds();
  };

  useEffect(() => {
    setViewState(prev => ({ ...prev, pitch: 0 }));
  }, [mapType]);

  useEffect(() => {
    if (!availableMapTypes.has(mapType)) {
      setMapType(resolveInitialMapType());
    }
  }, [mapType]);
  
  const geojsonSource = useMemo(() => {
    // Keep map readable when DB is still empty: show neutral full-river line.
    // But when observations exist and selected day has no data, hide the river.
    if (!hasAnyObservations) {
      return generateGeoJSONSource(getSegments(null, null));
    }
    if (!hasObservationOnSelectedDay) {
      return generateGeoJSONSource([]);
    }
    const segments = getSegments(
      currentData?.upperEdgeCoords ?? null,
      currentData?.lowerEdgeCoords ?? null
    );
    return generateGeoJSONSource(segments);
  }, [currentData, hasAnyObservations, hasObservationOnSelectedDay]);

  const normalizeName = (name: string) => name.toLowerCase().replace(/ё/g, 'е').trim();
  const riskFromScore = (score: number): RiskLevel => {
    if (score >= 3) return 'danger';
    if (score >= 2) return 'warning';
    if (score >= 1) return 'watch';
    return 'normal';
  };

  const toRadians = (deg: number) => deg * (Math.PI / 180);
  const distanceKm = (a: [number, number], b: [number, number]) => {
    const earthRadiusKm = 6371;
    const dLat = toRadians(b[1] - a[1]);
    const dLng = toRadians(b[0] - a[0]);
    const lat1 = toRadians(a[1]);
    const lat2 = toRadians(b[1]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
  };

  const getJamRiskScore = (point: [number, number], activeJams: IceJam[]) => {
    let score = 0;
    for (const jam of activeJams) {
      const km = distanceKm(point, jam.coords);
      if (km > 45) continue;
      if (jam.severity === 'high') score = Math.max(score, 3);
      else if (jam.severity === 'medium') score = Math.max(score, 2);
      else score = Math.max(score, 1);
    }
    return score;
  };

  const getLevelWithFallback = (stn: any, date: Date): number | null => {
    const directKey = date.toISOString().substring(0, 10);
    if (stn.levels[directKey] !== undefined) return stn.levels[directKey];

    for (let i = 1; i <= 5; i++) {
      const probe = new Date(date);
      probe.setDate(probe.getDate() - i);
      const key = probe.toISOString().substring(0, 10);
      if (stn.levels[key] !== undefined) return stn.levels[key];
    }
    return null;
  };

  const activeJams = useMemo(() => jams.filter((jam) => jam.status === 'active'), [jams]);

  const stationRiskByName = useMemo(() => {
    // Prefer the actual timeline date (which reflects user's slider position)
    // and fall back to the observation date or today.
    const baseDate = currentData?.date ?? currentDate ?? new Date().toISOString();
    const targetDate = new Date(baseDate);
    if (Number.isNaN(targetDate.getTime())) targetDate.setTime(Date.now());
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 3);
    const riskMap = new globalThis.Map<string, number>();

    for (const stn of stations) {
      if (!stn.levels || Object.keys(stn.levels).length === 0 || !stn.coords) continue;
      const currentLevel = getLevelWithFallback(stn, targetDate);
      const prevLevel = getLevelWithFallback(stn, prevDate);
      if (currentLevel === null) continue;

      let riskScore = 0;
      const critical = Number(stn.criticalLevel);
      if (Number.isFinite(critical) && critical > 0) {
        const diff = critical - currentLevel;
        // Risk level based on percentage of critical level:
        //   ≥ 70% (30% remaining) → red (danger/ОЯ)
        //   ≥ 50% (50% remaining) → yellow (warning/НЯ)
        //   < 50% → green (normal)
        const ratio = currentLevel / critical;
        if (ratio >= 0.7) riskScore = Math.max(riskScore, 3);
        else if (ratio >= 0.5) riskScore = Math.max(riskScore, 2);
      }

      if (prevLevel !== null) {
        const rise = currentLevel - prevLevel;
        // Water rise alerts are now capped at Yellow (2) unless ratio is already high
        if (rise >= WATER_RISE_ALERT_CM * 2.5) riskScore = Math.max(riskScore, 2);
        else if (rise >= WATER_RISE_ALERT_CM) riskScore = Math.max(riskScore, 1);
      }

      const jamRisk = getJamRiskScore(stn.coords, activeJams);
      // Ice jam proximity is now capped at Yellow (2) unless ratio is already high
      riskScore = Math.max(riskScore, jamRisk >= 3 ? 2 : jamRisk);

      const coordKey = `${stn.coords[0].toFixed(4)},${stn.coords[1].toFixed(4)}`;
      const existing = riskMap.get(coordKey) ?? 0;
      riskMap.set(coordKey, Math.max(existing, riskScore));
    }

    return riskMap;
  }, [stations, currentData?.date, currentDate, activeJams]);

  const settlementRiskByName = useMemo(() => {
    const riskMap = new globalThis.Map<string, number>();
    for (const settlement of SETTLEMENTS) {
      const coordKey = `${settlement.coords[0].toFixed(4)},${settlement.coords[1].toFixed(4)}`;
      const stationRisk = stationRiskByName.get(coordKey) ?? 0;
      const jamRisk = getJamRiskScore(settlement.coords, activeJams);
      riskMap.set(coordKey, Math.max(stationRisk, jamRisk));
    }
    return riskMap;
  }, [activeJams, stationRiskByName]);

  useEffect(() => {
    const pushInAppNotification = (message: string, level: RiskLevel) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setRiskNotifications((prev) => [{ id, message, level }, ...prev].slice(0, 4));
      window.setTimeout(() => {
        setRiskNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 9000);
    };

    const toRiskLevel = (score: number): RiskLevel => {
      if (score >= 3) return 'danger';
      if (score >= 2) return 'warning';
      return 'normal';
    };

    const previous = previousSettlementRiskRef.current;
    const escalated: { name: string; score: number }[] = [];
    for (const settlement of SETTLEMENTS) {
      const coordKey = `${settlement.coords[0].toFixed(4)},${settlement.coords[1].toFixed(4)}`;
      const currentScore = settlementRiskByName.get(coordKey) ?? 0;
      const previousScore = previous.get(coordKey) ?? 0;
      if (currentScore > previousScore && currentScore >= 2) {
        escalated.push({ name: settlement.name, score: currentScore });
      }
    }

    if (escalated.length > 0) {
      for (const item of escalated.slice(0, 3)) {
        const level = toRiskLevel(item.score);
        const levelLabel = RISK_LABELS[level];
        const message = `${item.name} (ожидается: ${levelLabel})`;
        pushInAppNotification(message, level);

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Оповещение по ледоходу', { body: message });
        }
      }
    }

    if (typeof window !== 'undefined' && 'Notification' in window && !hasAskedNotificationPermissionRef.current && Notification.permission === 'default') {
      hasAskedNotificationPermissionRef.current = true;
      Notification.requestPermission().catch(() => {});
    }

    previousSettlementRiskRef.current = new globalThis.Map(settlementRiskByName);
  }, [settlementRiskByName]);

  useEffect(() => {
    return () => {
      if (mouseMoveTimer.current) window.clearTimeout(mouseMoveTimer.current);
    };
  }, []);

  const onMapClick = async (e: any) => {
    if (pickMode === 'jam') {
      setDraftJamCoords([e.lngLat.lng, e.lngLat.lat]);
      return;
    } else if (pickMode === 'upper') {
      setDraftUpper([e.lngLat.lng, e.lngLat.lat]);
      return;
    } else if (pickMode === 'lower') {
      setDraftLower([e.lngLat.lng, e.lngLat.lat]);
      return;
    }

    // Attempt to identify district by geometry first (works on borders)
    const districtFeature = e.features?.find((f: any) => f.layer.id === 'yakutia-district-fill');
    if (districtFeature) {
      setSelectedDistrict({
        name: districtFeature.properties.name,
        lngLat: [e.lngLat.lng, e.lngLat.lat]
      });
    } else {
      // Show loading indicator
      setSelectedDistrict({ name: 'Определение района...', lngLat: [e.lngLat.lng, e.lngLat.lat] });
      
      // Fallback: Reverse geocoding for exact coordinate (fixes interior clicks on broken geometries)
      try {
        if (!NOMINATIM_ENABLED || !EXTERNAL_NETWORK_ALLOWED) {
          setSelectedDistrict({
            name: 'Район не определен (внешний геокодинг отключен)',
            lngLat: [e.lngLat.lng, e.lngLat.lat],
          });
          return;
        }
        const url = `${NOMINATIM_URL}?format=json&lat=${e.lngLat.lat}&lon=${e.lngLat.lng}&zoom=10&accept-language=ru`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Reverse geocoding failed: ${res.status}`);
        const data = await res.json();
        if (data && data.address) {
          const districtName = data.address.county || data.address.state_district || data.address.city || data.address.town || 'Район не определен';
          setSelectedDistrict({
            name: districtName,
            lngLat: [e.lngLat.lng, e.lngLat.lat]
          });
        } else {
          setSelectedDistrict(null);
        }
      } catch (err) {
        setSelectedDistrict(null);
      }
    }
  };

  const [hoverInfo, setHoverInfo] = useState<{x: number, y: number, feature: any} | null>(null);

  const mouseMoveTimer = useRef<number | null>(null);
  const onMouseMove = (e: any) => {
    if (mouseMoveTimer.current) return;
    
    // Simple throttle
    mouseMoveTimer.current = window.setTimeout(() => {
      mouseMoveTimer.current = null;
    }, 16); // ~60fps cap for state updates

    if (e.features && e.features.length > 0) {
      setHoverInfo({ x: e.point.x, y: e.point.y, feature: e.features[0] });
    } else {
      setHoverInfo(null);
    }
  };

  const cursorType = pickMode !== 'none' ? 'crosshair' : (hoverInfo ? "pointer" : (isAdmin ? "crosshair" : "grab"));
  const handleStationSelect = useCallback((s: any) => {
    const existingSettlement = SETTLEMENTS.find(settle => settle.name === s.name) || {
      id: s.id, name: s.name, coords: s.coords
    };
    setSelectedSettlement(existingSettlement);
  }, [setSelectedSettlement]);

  const visibleStations = useMemo(() => {
    const baseDate = currentData?.date ?? currentDate ?? new Date().toISOString();
    const targetDate = new Date(baseDate);
    if (Number.isNaN(targetDate.getTime())) targetDate.setTime(Date.now());
    return stations
      .filter(stn => {
        if (!stn.coords || viewState.zoom < 7.2) return false;
        if (!mapBounds) return true;
        const [lng, lat] = stn.coords;
        return lng >= mapBounds[0] && lat >= mapBounds[1] && lng <= mapBounds[2] && lat <= mapBounds[3];
      })
      .map(stn => {
        const level = Object.keys(stn.levels).length > 0 ? getLevelWithFallback(stn, targetDate) : null;
        if (level === null) return null;
        return {
          stn,
          level,
          riskLevel: riskFromScore(stationRiskByName.get(`${stn.coords[0].toFixed(4)},${stn.coords[1].toFixed(4)}`) ?? 0),
        };
      })
      .filter(Boolean) as { stn: any; level: number; riskLevel: RiskLevel }[];
  }, [stations, viewState.zoom, mapBounds, currentData?.date, currentDate, stationRiskByName]);

  const visibleSettlements = useMemo(() => {
    return SETTLEMENTS
      .filter(s => {
        if (viewState.zoom < 6.8 && !s.isMajor) return false;
        if (!mapBounds) return true;
        const [lng, lat] = s.coords;
        return lng >= mapBounds[0] && lat >= mapBounds[1] && lng <= mapBounds[2] && lat <= mapBounds[3];
      })
      .map(settlement => ({
        settlement,
        riskLevel: riskFromScore(settlementRiskByName.get(`${settlement.coords[0].toFixed(4)},${settlement.coords[1].toFixed(4)}`) ?? 0),
      }));
  }, [viewState.zoom, mapBounds, settlementRiskByName]);

  return (
    <div ref={mapRootRef} className="w-full h-full relative group">
      {/* Print Crop Mode Overlay */}
      {isPrintCropMode && (
        <div className="absolute inset-0 z-[100] pointer-events-none print-hide overflow-hidden">
          
          {/* Default Box Shadow Mask */}
          {!isDrawingMode && !customCropRect && (
            <div id="print-default-mask" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] h-[75vh] md:w-[70vw] md:h-[65vh] border-2 border-dashed border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] rounded-lg pointer-events-none flex items-center justify-center transition-all">
               <span className="text-white/40 text-xl font-black uppercase tracking-widest pointer-events-none select-none">Область печати</span>
            </div>
          )}

          {/* Custom Drawn Mask */}
          {(isDrawingMode || customCropRect) && (
            <div 
              id="print-custom-mask"
              className="absolute border-2 border-dashed border-blue-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] pointer-events-none flex items-center justify-center transition-all duration-75 bg-blue-500/10"
              style={
                customCropRect 
                  ? { left: customCropRect.left, top: customCropRect.top, width: customCropRect.width, height: customCropRect.height }
                  : { display: 'none' }
              }
            >
              {customCropRect && !isDrawingMode && <span className="text-white/60 font-bold uppercase tracking-widest pointer-events-none select-none drop-shadow-md text-sm">Выделенная область</span>}
            </div>
          )}
          
          {/* Drawing Canvas Overlay */}
          {isDrawingMode && (
             <div 
               className="absolute inset-0 z-[110] cursor-crosshair touch-none pointer-events-auto"
               onMouseDown={handleCropMouseDown}
               onMouseMove={handleCropMouseMove}
               onMouseUp={handleCropMouseUp}
               onMouseLeave={handleCropMouseUp}
             />
          )}

          {/* Print Action Bar */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-2xl pointer-events-auto border border-slate-200 z-[120]">
            <div className="text-sm font-bold text-slate-800 mx-2 flex flex-col">
              <span>Область печати</span>
              <span className="text-[10px] text-slate-500 font-medium">
                {isDrawingMode ? 'Рисуйте рамку на карте...' : customCropRect ? 'Область выделена вручную' : 'Двигайте карту или выделите'}
              </span>
            </div>
            <div className="w-px h-8 bg-slate-200 mx-1"></div>
            
            <button
              onClick={() => { setIsDrawingMode(!isDrawingMode); if (!isDrawingMode) setCustomCropRect(null); }}
              className={`px-3 py-2 rounded-xl font-medium transition flex items-center gap-2 border ${
                isDrawingMode 
                  ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-inner' 
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <Crop className="w-4 h-4" /> 
              {isDrawingMode ? 'Рисование...' : 'Выделить'}
            </button>

            <button
              onClick={handleCancelPrint}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-medium transition flex items-center gap-2 ml-1"
            >
              <X className="w-4 h-4" /> Отмена
            </button>
            <button
              onClick={downloadMapScreenshot}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-500/30"
            >
              <Camera className="w-4 h-4" /> PNG
            </button>
            <button
              onClick={handleExecutePrint}
              disabled={isDrawingMode && !customCropRect}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-bold transition flex items-center gap-2 shadow-lg shadow-blue-500/30"
            >
              <Printer className="w-4 h-4" /> Распечатать ({printType === 'bw' ? 'Ч/Б' : 'Цвет'})
            </button>
          </div>
        </div>
      )}

      {/* Map Type Switcher */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-1.5 flex gap-1 border border-slate-200 print-hide">
        <Tooltip text="Спутниковые снимки ESRI" position="bottom">
          <button
            onClick={() => setMapType('satellite')}
            disabled={!availableMapTypes.has('satellite')}
            className={`px-3 py-1.5 text-xs font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed ${mapType === 'satellite' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Спутник
          </button>
        </Tooltip>

        <Tooltip text="Векторная карта OpenStreetMap" position="bottom">
          <button
            onClick={() => setMapType('vector')}
            disabled={!availableMapTypes.has('vector')}
            className={`px-3 py-1.5 text-xs font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed ${mapType === 'vector' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Вектор
          </button>
        </Tooltip>
        <Tooltip text="Карта речных бассейнов" position="bottom">
          <button
            onClick={() => setMapType('basin')}
            disabled={!availableMapTypes.has('basin')}
            className={`px-3 py-1.5 text-xs font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed ${mapType === 'basin' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Бассейны
          </button>
        </Tooltip>
        <Tooltip text="Схема без загрузки данных из интернета (работает офлайн)" position="bottom">
          <button
            onClick={() => setMapType('local')}
            className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1 ${mapType === 'local' ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div> Офлайн
          </button>
        </Tooltip>
      </div>

      <Map
        ref={mapRef}
        initialViewState={viewState}
        onMoveEnd={onMoveEnd}
        mapStyle={resolvedMapStyle}
        interactiveLayerIds={['river-line', 'yakutia-district-fill']}
        cursor={cursorType}
        onClick={onMapClick}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
        canvasContextAttributes={{ preserveDrawingBuffer: true }}
      >
        <Source id="yakutia-bounds" type="geojson" data="/yakutia_boundaries.json">
          <Layer
            id="yakutia-district-fill"
            type="fill"
            filter={['==', 'type', 'district']}
            paint={{
              'fill-color': 'rgba(255, 255, 255, 0.1)',
              'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.01]
            }}
          />
          <Layer
            id="yakutia-district-fill-highlight"
            type="fill"
            filter={['all', ['==', 'type', 'district'], ['==', 'name', selectedDistrict ? selectedDistrict.name : '']]}
            paint={{
              'fill-color': 'rgba(59, 130, 246, 0.25)'
            }}
          />
          <Layer
            id="yakutia-region-border"
            type="line"
            filter={['==', 'type', 'region']}
            paint={{
              'line-color': mapType === 'satellite' || mapType === '3d' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.5)',
              'line-width': 2
            }}
          />
          <Layer
            id="yakutia-district-border"
            type="line"
            filter={['==', 'type', 'district']}
            paint={{
              'line-color': mapType === 'satellite' || mapType === '3d' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)',
              'line-width': 1,
              'line-dasharray': ['literal', [2, 4]] as any
            }}
          />
        </Source>

        <Source id="river-data" type="geojson" data={geojsonSource}>
          <Layer
            id="river-line-glow"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 12,
              'line-blur': 8,
              'line-opacity': 0.5
            }}
          />
          <Layer
            id="river-line-casing"
            type="line"
            paint={{
              'line-color': '#0f172a',
              'line-width': 8,
              'line-opacity': 0.6
            }}
          />
          <Layer
            id="river-line"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 4,
            }}
          />
        </Source>

        {viewState.zoom >= 5.2 && observationPointsGeoJSON.features.length > 0 && (
          <Source id="observation-points" type="geojson" data={observationPointsGeoJSON as any}>
            <Layer
              id="observation-points-upper"
              type="circle"
              filter={['==', ['get', 'pointType'], 'upper']}
              paint={{
                'circle-radius': 3,
                'circle-color': '#60a5fa',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1,
                'circle-opacity': 0.9,
              }}
            />
            <Layer
              id="observation-points-lower"
              type="circle"
              filter={['==', ['get', 'pointType'], 'lower']}
              paint={{
                'circle-radius': 3,
                'circle-color': '#e2e8f0',
                'circle-stroke-color': '#64748b',
                'circle-stroke-width': 1,
                'circle-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {viewState.zoom >= 5.8 && phenomenonMarkers.map((marker) => {
          const isCurrent = marker.day === currentDay;
          const info = PHENOMENON_INFO[marker.kind];
          const Icon =
            marker.kind === 'water'
              ? Droplets
              : marker.kind === 'freeze'
                ? Snowflake
                : marker.kind === 'jam'
                  ? AlertTriangle
                  : CircleDot;
          const toneClass =
            marker.kind === 'water'
              ? 'bg-blue-500/90 text-white'
              : marker.kind === 'freeze'
                ? 'bg-slate-300/95 text-slate-700'
                : marker.kind === 'jam'
                  ? 'bg-orange-500/90 text-white'
                  : marker.kind === 'drift'
                    ? 'bg-cyan-500/90 text-white'
                    : 'bg-slate-500/80 text-white';
          const animationClass =
            marker.kind === 'jam' ? 'animate-ping' : marker.kind === 'freeze' ? 'animate-pulse' : 'animate-bounce';
          return (
            <Marker key={marker.id} longitude={marker.coords[0]} latitude={marker.coords[1]} anchor="center">
              <button
                type="button"
                title={`${info.title}: ${info.description}`}
                onMouseEnter={() => setActivePhenomenon({
                  id: marker.id,
                  coords: marker.coords,
                  kind: marker.kind,
                  isCurrent,
                })}
                onMouseLeave={() => {
                  setActivePhenomenon((prev) => (prev?.id === marker.id ? null : prev));
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhenomenon({
                    id: marker.id,
                    coords: marker.coords,
                    kind: marker.kind,
                    isCurrent,
                  });
                }}
                className="pointer-events-auto cursor-pointer"
              >
                <div className={`rounded-full border border-white/80 shadow-md ${toneClass} ${animationClass} ${
                  isCurrent ? 'w-5 h-5' : 'w-4 h-4 opacity-90'
                } flex items-center justify-center`}>
                  <Icon className={isCurrent ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
                </div>
              </button>
            </Marker>
          );
        })}

        {hasObservationOnSelectedDay && currentData && (
          <>
            <Marker longitude={currentData.upperEdgeCoords[0]} latitude={currentData.upperEdgeCoords[1]} anchor="bottom">
              {viewState.zoom >= 6 ? (
                <div className="flex flex-col items-center group cursor-help transition-transform hover:scale-110">
                  <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow-md mb-1 whitespace-nowrap">
                    Верхняя кромка (Вода)
                  </div>
                  <Droplets className="w-6 h-6 text-blue-500 drop-shadow-md" fill="currentColor" />
                </div>
              ) : (
                <div className="w-4 h-4 bg-blue-500 rounded-full border-[3px] border-white shadow-md shadow-blue-500/50"></div>
              )}
            </Marker>

            <Marker longitude={currentData.lowerEdgeCoords[0]} latitude={currentData.lowerEdgeCoords[1]} anchor="bottom">
              {viewState.zoom >= 6 ? (
                <div className="flex flex-col items-center group cursor-help transition-transform hover:scale-110">
                  <div className="bg-slate-100 text-slate-800 text-xs text-center border border-slate-300 font-bold px-2 py-1 rounded-md shadow-md mb-1 whitespace-nowrap">
                    Нижняя кромка (Лед)
                  </div>
                  <Snowflake className="w-6 h-6 text-slate-200 fill-slate-200 stroke-slate-300 drop-shadow-md" />
                </div>
              ) : (
                <div className="w-4 h-4 bg-slate-300 rounded-full border-[3px] border-white shadow-md shadow-slate-500/50"></div>
              )}
            </Marker>
          </>
        )}

        {jams.map(jam => (
          jam.status === 'active' && (
            <Marker key={jam.id} longitude={jam.coords[0]} latitude={jam.coords[1]} anchor="center">
              <div className="relative flex items-center justify-center cursor-pointer group">
                {/* Blinking ring */}
                <div className={`absolute w-8 h-8 rounded-full animate-ping opacity-75 ${jam.severity === 'high' ? 'bg-red-500' : jam.severity === 'medium' ? 'bg-orange-500' : 'bg-amber-500'}`}></div>
                
                {/* Solid center dot */}
                <div className={`relative z-10 w-4 h-4 rounded-full border-2 border-white shadow-lg ${jam.severity === 'high' ? 'bg-red-600' : jam.severity === 'medium' ? 'bg-orange-600' : 'bg-amber-600'}`}></div>
                
                {/* Hover overlay text */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                  <div className={`text-white text-xs font-bold px-2 py-1 rounded-md shadow-lg border border-white/20 ${jam.severity === 'high' ? 'bg-red-600' : jam.severity === 'medium' ? 'bg-orange-500' : 'bg-amber-500'}`}>
                    Затор льда ({jam.severity === 'high' ? 'Критичный' : jam.severity === 'medium' ? 'Средний' : 'Слабый'})
                    {jam.description && <div className="text-[10px] font-normal mt-0.5 opacity-90">{jam.description}</div>}
                  </div>
                </div>
              </div>
            </Marker>
          )
        ))}

        {draftJamCoords && isAdmin && (
           <Marker longitude={draftJamCoords[0]} latitude={draftJamCoords[1]} anchor="bottom">
             <div className="flex flex-col items-center animate-bounce">
               <div className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow-md mb-1 whitespace-nowrap">
                 Новый затор
               </div>
               <AlertTriangle className="w-6 h-6 text-purple-600 drop-shadow-md cursor-pointer" fill="currentColor" />
             </div>
           </Marker>
        )}

        {draftUpper && isAdmin && (
          <Marker longitude={draftUpper[0]} latitude={draftUpper[1]} anchor="center">
            <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
          </Marker>
        )}

        {draftLower && isAdmin && (
          <Marker longitude={draftLower[0]} latitude={draftLower[1]} anchor="center">
            <div className="w-4 h-4 bg-slate-200 rounded-full border-2 border-slate-500 shadow-lg animate-pulse" />
          </Marker>
        )}

        {/* Section Speeds Tags on Map */}
        {viewState.zoom >= 5.5 && sectionSpeeds.map((section: any, i: number) => {
          if (!section.midCoords) return null;
          return (
            <Marker key={`speed-${i}`} longitude={section.midCoords[0]} latitude={section.midCoords[1]} anchor="center">
              <div className="bg-white/90 backdrop-blur-sm border border-blue-200 px-2 py-1 rounded-lg shadow-sm text-[10px] font-bold text-blue-800 hover:scale-110 hover:z-50 cursor-pointer transition-transform whitespace-nowrap flex items-center gap-1 group">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                {section.speed.toFixed(1)} км/сут
                <span className="text-[8px] text-blue-400 font-medium">({(section.speed / 24).toFixed(1)} км/ч)</span>
                
                {/* Popover on hover */}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-max opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none">
                  {section.startLoc} → {section.endLoc}
                </span>
              </div>
            </Marker>
          );
        })}

        {/* Water Level Stations (with Viewport Filtering) */}
        {visibleStations.map(({ stn, level, riskLevel }) => (
          <StationMarker 
            key={stn.id} 
            stn={stn} 
            level={level} 
            riskLevel={riskLevel}
            onSelect={handleStationSelect} 
          />
        ))}

        {/* Render Settlements (with Viewport Filtering) */}
        {visibleSettlements.map(({ settlement, riskLevel }) => (
          <SettlementMarker 
            key={settlement.id} 
            settlement={settlement} 
            riskLevel={riskLevel}
            onSelect={setSelectedSettlement} 
          />
        ))}

        {/* Reset View Button */}
        <div 
          className="absolute bottom-[140px] z-10 p-[1px] bg-white border border-slate-200 rounded shadow-[0_0_0_2px_rgba(0,0,0,0.1)] transition-transform duration-300 print-hide"
          style={{ transform: `translateX(${isSidebarOpen ? '-384px' : '0'})`, right: '8px' }}
        >
          <Tooltip text="Сбросить масштаб и показать всю Якутию" position="left">
            <button 
               onClick={() => {
                  if (mapRef.current) {
                     mapRef.current.flyTo({ center: [129.7, 62.0], zoom: 5, pitch: 0, essential: true });
                  }
               }}
               className="w-[29px] h-[29px] bg-white flex items-center justify-center hover:bg-slate-100 rounded-[2px]"
            >
               <Home className="w-5 h-5 text-slate-700" />
            </button>
          </Tooltip>
        </div>
        
        <NavigationControl position="bottom-right" showCompass={true} showZoom={true} />

        {selectedDistrict && (
          <Popup
            longitude={selectedDistrict.lngLat[0]}
            latitude={selectedDistrict.lngLat[1]}
            anchor="bottom"
            onClose={() => setSelectedDistrict(null)}
            closeOnClick={false}
            className="z-50"
          >
            <div className="font-semibold text-slate-800 px-1 py-0.5">
              {selectedDistrict.name}
            </div>
          </Popup>
        )}

        {activePhenomenon && (
          <Popup
            longitude={activePhenomenon.coords[0]}
            latitude={activePhenomenon.coords[1]}
            anchor="bottom"
            onClose={() => setActivePhenomenon(null)}
            closeOnClick={false}
            className="z-50"
          >
            <div className="max-w-[220px] px-1 py-0.5">
              <div className="text-xs font-bold text-slate-800">
                {PHENOMENON_INFO[activePhenomenon.kind].title}
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                {PHENOMENON_INFO[activePhenomenon.kind].description}
              </div>
              {activePhenomenon.isCurrent && (
                <div className="text-[10px] text-blue-700 font-semibold mt-1">
                  Текущее состояние на выбранную дату
                </div>
              )}
            </div>
          </Popup>
        )}
      </Map>

      {hoverInfo && hoverInfo.feature?.properties?.status && (
        <div 
          className="absolute z-50 bg-slate-900 border border-slate-700 text-white p-2 rounded-lg text-xs shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: hoverInfo.x + 15, top: hoverInfo.y + 15 }}
        >
          <div className="font-bold flex items-center gap-1.5 border-b border-slate-700 pb-1 mb-1">
            <Layers className="w-3.5 h-3.5" />
            Участок реки
          </div>
          <div>
            Статус: <span className="font-semibold text-blue-300">
              {hoverInfo.feature.properties.status === 'water'
                ? 'Чистая вода'
                : hoverInfo.feature.properties.status === 'drift'
                  ? 'Ледоход'
                  : hoverInfo.feature.properties.status === 'no-data'
                    ? 'Нет данных'
                    : 'Ледостав'}
            </span>
          </div>
        </div>
      )}

      {hoverInfo && hoverInfo.feature?.layer?.id === 'yakutia-district-fill' && !hoverInfo.feature?.properties?.status && (
        <div 
          className="absolute z-50 bg-black/80 text-white text-[10px] px-2 py-1 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-8px] font-medium"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          {hoverInfo.feature.properties.name}
        </div>
      )}

      {/* Map Watermark */}
      <div 
        className="absolute bottom-2 left-2 z-50 pointer-events-none transition-transform duration-300"
      >
        <div className="bg-slate-900/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white/80 font-medium tracking-wide border border-white/10 uppercase shadow-lg">
          Разработано в МинГОиОБЖн
        </div>
      </div>

      {riskNotifications.length > 0 && (
        <div className="absolute top-16 left-3 z-[130] flex flex-col gap-2 pointer-events-none">
          {riskNotifications.map((n) => (
            <div
              key={n.id}
              className={`text-xs px-3 py-2 rounded-lg shadow-xl border max-w-[260px] ${
                n.level === 'danger'
                  ? 'bg-red-600/95 text-white border-red-200/70'
                  : n.level === 'warning'
                    ? 'bg-yellow-300/95 text-yellow-950 border-yellow-100'
                    : 'bg-slate-900/90 text-white border-white/20'
              }`}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .maplibregl-ctrl-bottom-right {
          transition: transform 0.3s ease-in-out;
          transform: translateX(${isSidebarOpen ? '-384px' : '0'});
        }
      `}</style>
    </div>
  );
}
