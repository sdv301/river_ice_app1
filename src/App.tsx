import React, { useState } from 'react';
import MapEditor from './components/MapEditor';
import Sidebar from './components/Sidebar';
import { useIceStore } from './store/iceStore';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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
    setDraftJamCoords,
    getDailySpeed
  } = useIceStore();

  const [isAdmin, setIsAdmin] = useState(false);
  const [pickMode, setPickMode] = useState<PickMode>('none');
  const [draftUpper, setDraftUpper] = useState<[number, number] | null>(null);
  const [draftLower, setDraftLower] = useState<[number, number] | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedSettlement, setSelectedSettlement] = useState<any | null>(null);

  const currentSpeed = getDailySpeed();

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans relative">
      {/* Main Map Area */}
      <div className="flex-1 relative w-full h-full">
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
          onSettlementClick={setSelectedSettlement}
        />
        
        {/* Speed / Distance Indicator */}
        {currentSpeed !== null && (
          <div className="absolute bottom-12 left-6 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 shadow-xl rounded-xl p-3 flex items-center gap-3 transition-transform duration-300">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Скорость ледохода (на участке)</div>
              <div className="text-lg font-bold text-slate-800 leading-tight">
                ~{currentSpeed.speed.toFixed(1)} <span className="text-sm font-medium text-slate-500">км/сутки</span>
              </div>
              <div className="text-[9px] font-bold text-slate-400 mt-0.5 truncate max-w-[140px]">
                {currentSpeed.startLoc} → {currentSpeed.endLoc}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar Overlay */}
      <div className={`absolute top-0 right-0 h-full w-96 bg-white shadow-2xl transition-transform duration-300 z-30 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Sidebar Toggle Button attached to its edge */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-6 left-0 -ml-[50px] w-[50px] h-12 bg-white border border-slate-200 border-r-0 text-slate-800 p-2 rounded-l-xl shadow-[-6px_0_12px_rgba(0,0,0,0.1)] hover:bg-slate-50 flex items-center justify-center focus:outline-none focus:ring-0 cursor-pointer z-50 transition-colors"
          title={isSidebarOpen ? "Скрыть панель" : "Показать панель"}
        >
          {isSidebarOpen ? <PanelLeftOpen className="w-6 h-6 rotate-180 text-blue-600" /> : <PanelLeftClose className="w-6 h-6 rotate-180 text-slate-600" />}
        </button>

        <div className="w-96 h-full z-40 relative">
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
            sectionSpeeds={useIceStore().getSectionSpeeds()}
            selectedSettlement={selectedSettlement}
            setSelectedSettlement={setSelectedSettlement}
          />
        </div>
      </div>
    </div>
  );
}
