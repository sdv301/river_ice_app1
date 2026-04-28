import React, { useState } from 'react';
import MapEditor from './components/MapEditor';
import Sidebar from './components/Sidebar';
import { useIceStore } from './store/iceStore';
import { useAppStore } from './store/appStore';
import { useWaterLevelStore } from './store/waterLevelStore';
import { PanelLeftClose, PanelLeftOpen, Database, Snowflake } from 'lucide-react';
import DatabaseViewer from './components/DatabaseViewer';
import SettlementInfoPanel from './components/SettlementInfoPanel';
import HelpModal from './components/HelpModal';
import Tooltip from './components/Tooltip';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const { observations, currentDate, getDailySpeed, setCurrentDate, loadYearData } = useIceStore();
  const {
    selectedSettlement, setSelectedSettlement,
    isAdmin, setIsAdmin,
    selectedYear, setSelectedYear,
    isSidebarOpen, setIsSidebarOpen,
    isHelpOpen, setIsHelpOpen
  } = useAppStore();
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
          <Tooltip text="Расчётная скорость ледохода между ближайшими точками наблюдения" position="right">
            <div className="absolute bottom-16 left-3 z-10 bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 min-w-[240px] hover:scale-105">
              <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Скорость ледохода (на участке)</div>
                <div className="text-2xl font-black text-slate-800 leading-tight flex items-baseline gap-1">
                  {currentSpeed.speed.toFixed(1)} <span className="text-xs font-bold text-slate-400 uppercase">км/сутки</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-tight truncate max-w-[200px]">
                    {currentSpeed.startLoc} → {currentSpeed.endLoc}
                  </div>
                </div>
              </div>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Right Sidebar Overlay */}
      <div className={`absolute top-0 right-0 h-full w-96 bg-white shadow-2xl transition-all duration-300 z-30 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} ${isHelpOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

        {/* Sidebar Toggle Button attached to its edge */}
        <Tooltip text={isSidebarOpen ? 'Скрыть боковую панель' : 'Показать боковую панель'} position="left">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute top-6 left-0 -ml-[50px] w-[50px] h-12 bg-white border border-slate-200 border-r-0 text-slate-800 p-2 rounded-l-xl shadow-[-6px_0_12px_rgba(0,0,0,0.1)] hover:bg-slate-50 flex items-center justify-center focus:outline-none focus:ring-0 cursor-pointer z-50 transition-colors"
          >
            {isSidebarOpen ? <PanelLeftOpen className="w-6 h-6 rotate-180 text-blue-600" /> : <PanelLeftClose className="w-6 h-6 rotate-180 text-slate-600" />}
          </button>
        </Tooltip>

        <div className="w-96 h-full z-40 relative">
          <Sidebar />
        </div>
      </div>

      <DatabaseViewer isOpen={isDbOpen} onClose={() => setIsDbOpen(false)} />

      {/* Central Modal for Settlement Info */}
      <AnimatePresence>
        {selectedSettlement && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSettlement(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-white/20"
            >
              <SettlementInfoPanel
                settlement={selectedSettlement}
                onClose={() => setSelectedSettlement(null)}
                currentDate={currentDate}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
