import React, { useState } from 'react';
import MapEditor from './components/MapEditor';
import Sidebar from './components/Sidebar';
import { useIceStore } from './store/iceStore';
import type { PickMode } from './types';

export default function App() {
  const {
    observations,
    addObservation,
    currentDate,
    setCurrentDate,
    currentObservationData,
    jams,
    addJam,
    resolveJam,
    removeJam,
    draftJamCoords,
    setDraftJamCoords
  } = useIceStore();

  const [isAdmin, setIsAdmin] = useState(false);
  const [pickMode, setPickMode] = useState<PickMode>('none');
  const [draftUpper, setDraftUpper] = useState<[number, number] | null>(null);
  const [draftLower, setDraftLower] = useState<[number, number] | null>(null);

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      <div className="flex-1 relative">
        <MapEditor 
          currentData={currentObservationData} 
          jams={jams}
          draftJamCoords={draftJamCoords}
          setDraftJamCoords={setDraftJamCoords}
          isAdmin={isAdmin}
          pickMode={pickMode}
          draftUpper={draftUpper}
          draftLower={draftLower}
          setDraftUpper={setDraftUpper}
          setDraftLower={setDraftLower}
        />
      </div>
      <Sidebar 
        observations={observations}
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        addObservation={addObservation}
        jams={jams}
        addJam={addJam}
        resolveJam={resolveJam}
        removeJam={removeJam}
        draftJamCoords={draftJamCoords}
        setDraftJamCoords={setDraftJamCoords}
        isAdmin={isAdmin}
        setIsAdmin={setIsAdmin}
        pickMode={pickMode}
        setPickMode={setPickMode}
        draftUpper={draftUpper}
        draftLower={draftLower}
        setDraftUpper={setDraftUpper}
        setDraftLower={setDraftLower}
      />
    </div>
  );
}
