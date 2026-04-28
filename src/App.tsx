import React, { useState } from 'react';
import MapEditor from './components/MapEditor';
import Sidebar from './components/Sidebar';
import { useIceStore } from './store/iceStore';
import { useAppStore } from './store/appStore';
import { useWaterLevelStore } from './store/waterLevelStore';
import { PanelLeftClose, PanelLeftOpen, Database, Snowflake } from 'lucide-react';
import DatabaseViewer from './components/DatabaseViewer';

export default function App() {
  const { getDailySpeed, setCurrentDate, loadYearData } = useIceStore();
  const { selectedSettlement, isAdmin, setIsAdmin, selectedYear, setSelectedYear, isSidebarOpen, setIsSidebarOpen } = useAppStore();
  const { loadData } = useWaterLevelStore();
  const [isDbOpen, setIsDbOpen] = useState(false);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => {
    loadYearData(selectedYear);
  }, [selectedYear, loadYearData]);

  const currentSpeed = getDailySpeed();

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans relative">
      {/* Main Map Area */}
      <div className="flex-1 relative w-full h-full">
        <MapEditor />



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
                <span className="text-sm font-medium text-blue-500 ml-1">({(currentSpeed.speed / 24).toFixed(1)} км/ч)</span>
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
          <Sidebar />
        </div>
      </div>

    </div>
  );
}
