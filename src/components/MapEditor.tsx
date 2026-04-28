import React, { useMemo, useState, useRef, useEffect } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, Popup, useMap } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getSegments, generateGeoJSONSource } from '../utils/mapUtils';
import { Droplets, Snowflake, AlertTriangle, CircleDot, Layers, Home } from 'lucide-react';
import Tooltip from './Tooltip';
import type { IceJam, PickMode } from '../types';
import { SETTLEMENTS } from '../utils/riverData';
import { useAppStore } from '../store/appStore';
import { useIceStore } from '../store/iceStore';
import { useWaterLevelStore } from '../store/waterLevelStore';

type MapType = 'satellite' | 'vector' | 'basin' | 'local';

const MAP_STYLES: Record<string, any> = {
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
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      }
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 22 }]
  },
  'vector': 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  'basin': '/frexosm_basin_style.json'
};

// Memoized Marker Components for performance
const StationMarker = React.memo(({ stn, level, onSelect }: { stn: any, level: number, onSelect: (stn: any) => void }) => {
  let colorClass = 'bg-green-500';
  let textClass = 'text-green-800';
  let borderClass = 'border-green-600';
  
  if (stn.criticalLevel) {
     const diff = stn.criticalLevel - level;
     if (diff < 0) { colorClass = 'bg-red-600'; textClass = 'text-white'; borderClass = 'border-red-800'; }
     else if (diff < 100) { colorClass = 'bg-orange-500'; textClass = 'text-white'; borderClass = 'border-orange-700'; }
     else if (diff < 300) { colorClass = 'bg-yellow-400'; textClass = 'text-yellow-900'; borderClass = 'border-yellow-600'; }
  }

  return (
    <Marker longitude={stn.coords![0]} latitude={stn.coords![1]} anchor="bottom-left">
      <div className={`px-1.5 py-0.5 rounded shadow-sm text-[9px] font-bold border ${colorClass} ${textClass} ${borderClass} opacity-90 cursor-pointer hover:opacity-100 hover:scale-110 transition-transform`}
           onClick={(e) => {
             e.stopPropagation();
             onSelect(stn);
           }}
      >
        {level} см
      </div>
    </Marker>
  );
});

const SettlementMarker = React.memo(({ settlement, onSelect }: { settlement: any, onSelect: (s: any) => void }) => {
  return (
    <Marker longitude={settlement.coords[0]} latitude={settlement.coords[1]} anchor="center">
       <div 
         className="flex items-center gap-1 group cursor-pointer hover:scale-110 transition-transform"
         onClick={(e) => {
           e.stopPropagation();
           onSelect(settlement);
         }}
       >
         <CircleDot className={`w-3 h-3 ${settlement.isMajor ? 'text-white fill-slate-800 scale-125' : 'text-slate-200 fill-slate-600'} drop-shadow`} />
         <span className={`font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] whitespace-nowrap px-1 rounded-sm backdrop-blur-[2px] ${settlement.isMajor ? 'text-white bg-slate-900/60 text-xs tracking-wide' : 'text-slate-100 bg-slate-900/40 text-[10px] opacity-90'}`}>
           {settlement.name}
         </span>
       </div>
    </Marker>
  );
});

export default function MapEditor() {
  const { getCurrentObservationData, jams, draftJamCoords, setDraftJamCoords, getSectionSpeeds } = useIceStore();
  const currentData = getCurrentObservationData();
  const sectionSpeeds = getSectionSpeeds();
  const { stations } = useWaterLevelStore();
  const { 
    isAdmin, pickMode, draftUpper, draftLower, 
    setDraftUpper, setDraftLower,
    setSelectedSettlement, selectedSettlement, mapCenter, isSidebarOpen
  } = useAppStore();
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (mapCenter && mapRef.current) {
      mapRef.current.flyTo({ center: [mapCenter.lng, mapCenter.lat], zoom: mapCenter.zoom, essential: true });
    }
  }, [mapCenter]);
  
  const [mapType, setMapType] = useState<MapType>('satellite');
  const [viewState, setViewState] = useState({ longitude: 129.7, latitude: 62.0, zoom: 5, pitch: 0 });
  const [selectedDistrict, setSelectedDistrict] = useState<{name: string, lngLat: [number, number]} | null>(null);
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | null>(null);

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
  
  const geojsonSource = useMemo(() => {
    const segments = getSegments(
      currentData?.upperEdgeCoords ?? null,
      currentData?.lowerEdgeCoords ?? null
    );
    return generateGeoJSONSource(segments);
  }, [currentData]);

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
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.lngLat.lat}&lon=${e.lngLat.lng}&zoom=10&accept-language=ru`);
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

  return (
    <div className="w-full h-full relative group">
      {/* Map Type Switcher */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-1.5 flex gap-1 border border-slate-200">
        <Tooltip text="Спутниковые снимки ESRI" position="bottom">
          <button
            onClick={() => setMapType('satellite')}
            className={`px-3 py-1.5 text-xs font-semibold rounded ${mapType === 'satellite' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Спутник
          </button>
        </Tooltip>

        <Tooltip text="Векторная карта OpenStreetMap" position="bottom">
          <button
            onClick={() => setMapType('vector')}
            className={`px-3 py-1.5 text-xs font-semibold rounded ${mapType === 'vector' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Вектор
          </button>
        </Tooltip>
        <Tooltip text="Карта речных бассейнов" position="bottom">
          <button
            onClick={() => setMapType('basin')}
            className={`px-3 py-1.5 text-xs font-semibold rounded ${mapType === 'basin' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
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
        mapStyle={MAP_STYLES[mapType]}
        interactiveLayerIds={['river-line', 'yakutia-district-fill']}
        cursor={cursorType}
        onClick={onMapClick}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
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
            id="river-line"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 6,
            }}
          />
        </Source>

        {currentData && (
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
        {stations.filter(stn => {
           if (!stn.coords || viewState.zoom < 7.2) return false;
           if (!mapBounds) return true;
           const [lng, lat] = stn.coords;
           return lng >= mapBounds[0] && lat >= mapBounds[1] && lng <= mapBounds[2] && lat <= mapBounds[3];
        }).map(stn => {
           const dateStr = currentData?.date ? currentData.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
           const level = Object.keys(stn.levels).length > 0 ? (stn.levels[dateStr] ?? Object.values(stn.levels).pop()) : null;
           if (level === null) return null;

           return (
             <StationMarker 
               key={stn.id} 
               stn={stn} 
               level={level} 
               onSelect={(s) => {
                  const existingSettlement = SETTLEMENTS.find(settle => settle.name === s.name) || {
                    id: s.id, name: s.name, coords: s.coords
                  };
                  setSelectedSettlement(existingSettlement);
               }} 
             />
           );
        })}

        {/* Render Settlements (with Viewport Filtering) */}
        {SETTLEMENTS.filter(s => {
           if (viewState.zoom < 6.8 && !s.isMajor) return false;
           if (!mapBounds) return true;
           const [lng, lat] = s.coords;
           return lng >= mapBounds[0] && lat >= mapBounds[1] && lng <= mapBounds[2] && lat <= mapBounds[3];
        }).map(settlement => (
          <SettlementMarker 
            key={settlement.id} 
            settlement={settlement} 
            onSelect={setSelectedSettlement} 
          />
        ))}

        {/* Reset View Button */}
        <div 
          className="absolute bottom-[140px] z-10 p-[1px] bg-white border border-slate-200 rounded shadow-[0_0_0_2px_rgba(0,0,0,0.1)] transition-transform duration-300"
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
              {hoverInfo.feature.properties.status === 'water' ? 'Чистая вода' : 
               hoverInfo.feature.properties.status === 'drift' ? 'Ледоход' : 'Ледостав'}
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

      <style>{`
        .maplibregl-ctrl-bottom-right {
          transition: transform 0.3s ease-in-out;
          transform: translateX(${isSidebarOpen ? '-384px' : '0'});
        }
      `}</style>
    </div>
  );
}
