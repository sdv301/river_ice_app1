import React, { useMemo, useState } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, Popup } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getSegments, generateGeoJSONSource } from '../utils/mapUtils';
import { Droplets, Snowflake, AlertTriangle, CircleDot, Layers } from 'lucide-react';
import type { IceJam, PickMode } from '../types';
import { SETTLEMENTS } from '../utils/riverData';
import yakutiaBoundaries from '../utils/yakutia_boundaries.json';
import basinStyle from '../utils/frexosm_basin_style.json';

interface MapEditorProps {
  currentData: {
    upperEdgeCoords: [number, number];
    lowerEdgeCoords: [number, number];
  } | null;
  jams: IceJam[];
  draftJamCoords: [number, number] | null;
  setDraftJamCoords: (coords: [number, number] | null) => void;
  isAdmin: boolean;
  pickMode: PickMode;
  draftUpper: [number, number] | null;
  draftLower: [number, number] | null;
  setDraftUpper: (coords: [number, number] | null) => void;
  setDraftLower: (coords: [number, number] | null) => void;
  onSettlementClick: (settlement: any) => void;
}

type MapType = 'satellite' | 'vector' | '3d' | 'basin';

const MAP_STYLES: Record<string, any> = {
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
  '3d': {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256
      },
      'mapzen-terrain-dem': {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: 'Terrain tiles by Mapzen'
      }
    },
    terrain: { source: 'mapzen-terrain-dem', exaggeration: 1.5 },
    layers: [{ id: 'satellite', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 22 }]
  },
  'basin': basinStyle
};

export default function MapEditor({ 
  currentData, jams, draftJamCoords, setDraftJamCoords, isAdmin, 
  pickMode, draftUpper, draftLower, setDraftUpper, setDraftLower,
  onSettlementClick
}: MapEditorProps) {
  
  const [mapType, setMapType] = useState<MapType>('satellite');
  const [selectedDistrict, setSelectedDistrict] = useState<{name: string, lngLat: [number, number]} | null>(null);
  
  const geojsonSource = useMemo(() => {
    const segments = getSegments(
      currentData?.upperEdgeCoords ?? null,
      currentData?.lowerEdgeCoords ?? null
    );
    return generateGeoJSONSource(segments);
  }, [currentData]);

  const onMapClick = (e: any) => {
    const districtFeature = e.features?.find((f: any) => f.layer.id === 'yakutia-district-fill');
    if (districtFeature) {
      setSelectedDistrict({
        name: districtFeature.properties.name,
        lngLat: [e.lngLat.lng, e.lngLat.lat]
      });
    }

    if (!isAdmin) return;
    
    if (pickMode === 'jam') {
      setDraftJamCoords([e.lngLat.lng, e.lngLat.lat]);
    } else if (pickMode === 'upper') {
      setDraftUpper([e.lngLat.lng, e.lngLat.lat]);
    } else if (pickMode === 'lower') {
      setDraftLower([e.lngLat.lng, e.lngLat.lat]);
    }
  };

  const [hoverInfo, setHoverInfo] = useState<{x: number, y: number, feature: any} | null>(null);

  const onMouseMove = (e: any) => {
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
        <button
          onClick={() => setMapType('satellite')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${mapType === 'satellite' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Спутник
        </button>
        <button
          onClick={() => setMapType('3d')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${mapType === '3d' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          3D
        </button>
        <button
          onClick={() => setMapType('vector')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${mapType === 'vector' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Вектор
        </button>
        <button
          onClick={() => setMapType('basin')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${mapType === 'basin' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Бассейны
        </button>
      </div>

      <Map
        initialViewState={{
          longitude: 129.7, // Yakutsk
          latitude: 62.0,
          zoom: 5,
          pitch: mapType === '3d' ? 60 : 0,
        }}
        mapStyle={MAP_STYLES[mapType]}
        interactiveLayerIds={['river-line', 'yakutia-district-fill']}
        cursor={cursorType}
        onClick={onMapClick}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
      >
        <Source id="yakutia-bounds" type="geojson" data={yakutiaBoundaries as any}>
          <Layer
            id="yakutia-district-fill"
            type="fill"
            filter={['==', 'type', 'district']}
            paint={{
              'fill-color': 'rgba(255, 255, 255, 0.1)',
              'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0]
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
              <div className="flex flex-col items-center">
                <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow-md mb-1 whitespace-nowrap">
                  Верхняя кромка (Вода)
                </div>
                <Droplets className="w-6 h-6 text-blue-500 drop-shadow-md" fill="currentColor" />
              </div>
            </Marker>

            <Marker longitude={currentData.lowerEdgeCoords[0]} latitude={currentData.lowerEdgeCoords[1]} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className="bg-slate-100 text-slate-800 text-xs text-center border border-slate-300 font-bold px-2 py-1 rounded-md shadow-md mb-1 whitespace-nowrap">
                  Нижняя кромка (Лед)
                </div>
                <Snowflake className="w-6 h-6 text-slate-200 fill-slate-200 stroke-slate-300 drop-shadow-md" />
              </div>
            </Marker>
          </>
        )}

        {jams.map(jam => (
          jam.status === 'active' && (
            <Marker key={jam.id} longitude={jam.coords[0]} latitude={jam.coords[1]} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className={`text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-md mb-1 whitespace-nowrap ${jam.severity === 'high' ? 'bg-red-600' : jam.severity === 'medium' ? 'bg-orange-500' : 'bg-amber-500'}`}>
                  Затор ({jam.severity === 'high' ? 'Критичный' : jam.severity === 'medium' ? 'Средний' : 'Слабый'})
                </div>
                <AlertTriangle className={`w-8 h-8 drop-shadow-md ${jam.severity === 'high' ? 'text-red-500' : jam.severity === 'medium' ? 'text-orange-400' : 'text-amber-400'}`} fill="currentColor" />
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

        {/* Render Settlements */}
        {SETTLEMENTS.map(settlement => (
          <Marker key={settlement.id} longitude={settlement.coords[0]} latitude={settlement.coords[1]} anchor="center">
             <div 
               className="flex items-center gap-1 group cursor-pointer hover:scale-110 transition-transform"
               onClick={(e) => {
                 e.stopPropagation();
                 onSettlementClick(settlement);
               }}
             >
               <CircleDot className={`w-3 h-3 ${settlement.isMajor ? 'text-white fill-slate-800' : 'text-slate-200 fill-slate-600'} drop-shadow`} />
               <span className={`text-[10px] font-bold drop-shadow-md whitespace-nowrap pl-0.5 ${settlement.isMajor ? 'text-white' : 'text-slate-200 opacity-80'}`}>
                 {settlement.name}
               </span>
             </div>
          </Marker>
        ))}

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
    </div>
  );
}
