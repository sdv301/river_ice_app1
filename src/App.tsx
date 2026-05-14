import React, { useState, useCallback } from 'react';
import MapEditor from './components/MapEditor';
import Sidebar from './components/Sidebar';
import { useIceStore } from './store/iceStore';
import { useAppStore } from './store/appStore';
import { WATER_LEVEL_AUTO_SYNC_INTERVAL_MS, useWaterLevelStore } from './store/waterLevelStore';
import { PanelLeftClose, PanelLeftOpen, Database, Snowflake } from 'lucide-react';
import DatabaseViewer from './components/DatabaseViewer';
import SettlementInfoPanel from './components/SettlementInfoPanel';
import HelpModal from './components/HelpModal';
import InteractiveTour, { TourStep } from './components/InteractiveTour';
import Tooltip from './components/Tooltip';
import { motion, AnimatePresence } from 'motion/react';
import { SETTLEMENTS } from './utils/riverData';
import { DATA_SOURCE_MODE } from './config/runtimeConfig';

const TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="logo"]',
    title: 'Система мониторинга ледохода',
    description: 'Добро пожаловать! Это панель управления мониторингом ледохода на реке Лена. Здесь отображаются все данные.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="help-btn"]',
    title: 'Инструкция',
    description: 'Нажмите эту кнопку в любой момент, чтобы открыть инструкцию или запустить экскурсию повторно.',
    position: 'left',
  },
  {
    targetSelector: '[data-tour="database-link"]',
    title: 'Архив: База данных',
    description: 'Откройте полную базу данных гидропостов с историческими данными уровней воды и документами.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="year-switcher"]',
    title: 'Переключатель года',
    description: 'Переключайтесь между архивом 2025 года и текущими данными 2026 года для сравнения динамики.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="search"]',
    title: 'Поиск населённых пунктов',
    description: 'Введите название поселка для быстрого поиска и перехода к нему на карте.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="admin-toggle"]',
    title: 'Режим администратора',
    description: 'Включите режим админа (PIN: 1234) для доступа к функциям добавления данных, обновления с Яндекс.Диска и управления заторами.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="timeline"]',
    title: 'Временная шкала',
    description: 'Перемещайтесь по дням, чтобы видеть движение ледохода. Нажмите ▶ для анимации.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="legend"]',
    title: 'Легенда ледовых явлений',
    description: 'Цветовая схема показывает тип ледового явления на каждом участке реки.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="jams"]',
    title: 'Заторы',
    description: 'Здесь отображаются активные ледовые заторы. В режиме админа можно добавлять и управлять ими.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="observations"]',
    title: 'Точки наблюдений',
    description: 'Список всех зарегистрированных наблюдений ледохода. Кликните, чтобы перейти к дате.',
    position: 'top',
  },
  {
    targetSelector: '[data-tour="map-indicator"]',
    title: 'Интерактивная карта',
    description: 'Карта отображает реку Лена, населённые пункты, уровни воды и положение кромок ледохода. Кликните по поселку для детальной информации.',
    position: 'bottom',
  },
  {
    targetSelector: '[data-tour="sidebar-toggle"]',
    title: 'Скрыть / показать панель',
    description: 'Используйте эту кнопку чтобы скрыть или показать боковую панель для лучшего обзора карты.',
    position: 'bottom',
  },
];

export default function App() {
  const {
    observations,
    currentDate,
    getDailySpeed,
    setCurrentDate,
    loadYearData,
    checkYandexForUpdates: checkIceYandexForUpdates,
  } = useIceStore();
  const {
    selectedSettlement, setSelectedSettlement,
    isAdmin, setIsAdmin,
    selectedYear, setSelectedYear,
    isSidebarOpen, setIsSidebarOpen,
    isHelpOpen, setIsHelpOpen,
    setMapCenter,
    mapViewportIceSpeed,
  } = useAppStore();
  const { loadData, checkYandexForUpdates: checkWaterLevelsYandexForUpdates } = useWaterLevelStore();
  const [isDbOpen, setIsDbOpen] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadData();
      if (cancelled) return;
      // First sync from disk (Yandex or internal) after local snapshot is shown.
      if (DATA_SOURCE_MODE !== 'none') {
        checkWaterLevelsYandexForUpdates().catch(() => {});
        checkIceYandexForUpdates().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData, checkWaterLevelsYandexForUpdates, checkIceYandexForUpdates]);

  React.useEffect(() => {
    if (DATA_SOURCE_MODE === 'none') return;
    const timer = window.setInterval(() => {
      checkWaterLevelsYandexForUpdates().catch(() => {});
      checkIceYandexForUpdates().catch(() => {});
    }, WATER_LEVEL_AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkWaterLevelsYandexForUpdates, checkIceYandexForUpdates]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const settlementName = params.get('settlement');
    const yearParamRaw = params.get('year');
    const yearParam = yearParamRaw ? Number(yearParamRaw) : null;

    if (yearParam === 2025 || yearParam === 2026) {
      setSelectedYear(yearParam);
    }

    if (settlementName) {
      const normalized = settlementName.toLowerCase().replace(/ё/g, 'е').trim();
      const target = SETTLEMENTS.find(
        (s) => s.name.toLowerCase().replace(/ё/g, 'е').trim() === normalized,
      );
      if (target) {
        setSelectedSettlement(target);
        setMapCenter(target.coords[0], target.coords[1], 9);
        setIsSidebarOpen(true);
      }
    }

    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [setMapCenter, setIsSidebarOpen, setSelectedSettlement, setSelectedYear]);

  React.useEffect(() => {
    loadYearData(selectedYear);
  }, [selectedYear, loadYearData]);

  const dailySpeed = getDailySpeed();
  const currentSpeed = mapViewportIceSpeed ?? dailySpeed;

  const handleStartTour = useCallback(() => {
    // Ensure sidebar is open for the tour
    setIsSidebarOpen(true);
    setIsTourActive(true);
  }, [setIsSidebarOpen]);

  const handleFinishTour = useCallback(() => {
    setIsTourActive(false);
  }, []);

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans relative">
      <div className="flex-1 relative w-full h-full">
        <MapEditor />

        {/* Small tour anchor on the map — used by the interactive tour */}
        <div
          data-tour="map-indicator"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[5] pointer-events-none print-hide"
          style={{ width: 220, height: 36 }}
        >
          <div className="w-full h-full bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 flex items-center justify-center gap-2 shadow-sm">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span className="text-xs font-bold text-slate-600">Интерактивная карта</span>
          </div>
        </div>

        {/* Speed / Distance Indicator */}
        {currentSpeed !== null && (
          <div className="absolute bottom-16 left-3 z-10 bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 min-w-[240px] hover:scale-105 print-hide">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">
                Скорость ледохода
                {mapViewportIceSpeed ? ' (участок у центра карты)' : ' (средняя по сроку)'}
              </div>
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
        )}
      </div>

      {/* Right Sidebar Overlay */}
      <div className={`absolute top-0 right-0 h-full w-96 bg-white shadow-2xl transition-all duration-300 z-30 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} ${isHelpOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'} print-hide`}>

        {/* Sidebar Toggle Button attached to its edge */}
        <button
          data-tour="sidebar-toggle"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-6 left-0 -ml-[50px] w-[50px] h-12 bg-white border border-slate-200 border-r-0 text-slate-800 p-2 rounded-l-xl shadow-[-6px_0_12px_rgba(0,0,0,0.1)] hover:bg-slate-50 flex items-center justify-center focus:outline-none focus:ring-0 cursor-pointer z-50 transition-colors print-hide"
        >
          {isSidebarOpen ? <PanelLeftOpen className="w-6 h-6 rotate-180 text-blue-600" /> : <PanelLeftClose className="w-6 h-6 rotate-180 text-slate-600" />}
        </button>

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

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onStartTour={handleStartTour}
      />

      {/* Interactive Tour Overlay */}
      <InteractiveTour
        steps={TOUR_STEPS}
        isActive={isTourActive}
        onFinish={handleFinishTour}
      />
    </div>
  );
}
