import React, { useMemo } from 'react';
import Map, { Source, Layer, Marker, NavigationControl } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getSegments, generateGeoJSONSource } from '../utils/mapUtils';
import { MapPin, Navigation, Droplets, Snowflake, AlertTriangle, CircleDot } from 'lucide-react';
import type { IceJam, PickMode } from '../types';
import { SETTLEMENTS } from '../utils/riverData';

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
}

export default function MapEditor({ 
  currentData, jams, draftJamCoords, setDraftJamCoords, isAdmin, 
  pickMode, draftUpper, draftLower, setDraftUpper, setDraftLower 
}: MapEditorProps) {
  
  const geojsonSource = useMemo(() => {
    const segments = getSegments(
      currentData?.upperEdgeCoords ?? null,
      currentData?.lowerEdgeCoords ?? null
    );
    return generateGeoJSONSource(segments);
  }, [currentData]);

  const onMapClick = (e: any) => {
    if (!isAdmin) return;
    
    if (pickMode === 'jam') {
      setDraftJamCoords([e.lngLat.lng, e.lngLat.lat]);
    } else if (pickMode === 'upper') {
      setDraftUpper([e.lngLat.lng, e.lngLat.lat]);
    } else if (pickMode === 'lower') {
      setDraftLower([e.lngLat.lng, e.lngLat.lat]);
    }
  };

  const cursorType = pickMode !== 'none' ? 'crosshair' : (isAdmin ? "crosshair" : "grab");

  return (
    <div className="w-full h-full relative">
      <Map
        initialViewState={{
          longitude: 129.7, // Yakutsk
          latitude: 62.0,
          zoom: 5,
          pitch: 0,
        }}
        mapStyle={{
          version: 8,
          sources: {
            'esri-satellite': {
              type: 'raster',
              tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              ],
              tileSize: 256,
              attribution: 'Esri, Maxar, Earthstar Geographics'
            }
          },
          layers: [
            {
              id: 'satellite',
              type: 'raster',
              source: 'esri-satellite',
              minzoom: 0,
              maxzoom: 22
            }
          ]
        }}
        interactiveLayerIds={['river-line']}
        cursor={cursorType}
        onClick={onMapClick}
      >
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
             <div className="flex items-center gap-1 group">
               <CircleDot className={`w-3 h-3 ${settlement.isMajor ? 'text-white fill-slate-800' : 'text-slate-200 fill-slate-600'} drop-shadow`} />
               <span className={`text-[10px] font-bold drop-shadow-md whitespace-nowrap pl-0.5 ${settlement.isMajor ? 'text-white' : 'text-slate-200 opacity-80'}`}>
                 {settlement.name}
               </span>
             </div>
          </Marker>
        ))}

        <NavigationControl position="bottom-right" showCompass={true} showZoom={true} />
      </Map>
    </div>
  );
}
