import React, { useState, useEffect, useRef, useMemo } from 'react';
import { format, min, max, differenceInDays, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar, MapPin, Plus, Play, Pause, Info, ShieldAlert, CheckCircle2, ShieldUser, XCircle, RefreshCw, Activity, X, TrendingDown, TrendingUp, Minus, Search, Snowflake, Database, Download, HelpCircle, Cloud, AlertCircle, Loader2, Printer } from 'lucide-react';
import type { IceObservation, IceJam, PickMode } from '../types';
import * as XLSX from 'xlsx';
import { SETTLEMENTS } from '../utils/riverData';

import SettlementInfoPanel from './SettlementInfoPanel';
import { useAppStore } from '../store/appStore';
import { getDefaultCurrentDate, useIceStore } from '../store/iceStore';
import { useWaterLevelStore } from '../store/waterLevelStore';
import { motion, AnimatePresence } from 'motion/react';
import { generateWaterLevelHistory } from '../utils/mockDataService';
import { downloadIceObservationTemplate } from '../utils/excelTemplates';

export default function Sidebar() {
  const {
    observations, currentDate, setCurrentDate, addObservation,
    jams, addJam, resolveJam, removeJam, getSectionSpeeds, getCustomSectionSpeed,
    draftJamCoords, setDraftJamCoords,
    fetchFromYandexDisk, isLoading, lastSyncTime, syncError, syncFileCount
  } = useIceStore();

  const {
    isAdmin, setIsAdmin,
    pickMode, setPickMode, draftUpper, draftLower, setDraftUpper, setDraftLower,
    selectedSettlement, setSelectedSettlement, setMapCenter, selectedYear, setSelectedYear,
    setIsHelpOpen, isPrintCropMode, setIsPrintCropMode, printType, setPrintType, setIsSidebarOpen
  } = useAppStore();

  const {
    getStationHistory,
    getStation,
    loadData: reloadWaterData,
    isSyncing: isWaterSyncing,
    lastSyncTime: waterLastSyncTime,
    syncError: waterSyncError,
  } = useWaterLevelStore();

  const sectionSpeeds = useMemo(() => getSectionSpeeds(), [getSectionSpeeds, observations]);
  const [customSpeedStartName, setCustomSpeedStartName] = useState('');
  const [customSpeedEndName, setCustomSpeedEndName] = useState('');
  const normalizeSettlementName = (name: string) => name.toLowerCase().replace(/ё/g, 'е').trim();
  const findSettlementByName = (name: string) => {
    const normalized = normalizeSettlementName(name);
    if (!normalized) return null;
    const exact = SETTLEMENTS.find((s) => normalizeSettlementName(s.name) === normalized);
    return exact || null;
  };
  const customStartSettlement = useMemo(() => findSettlementByName(customSpeedStartName), [customSpeedStartName]);
  const customEndSettlement = useMemo(() => findSettlementByName(customSpeedEndName), [customSpeedEndName]);
  const customSectionSpeed = useMemo(() => (
    customStartSettlement && customEndSettlement
      ? getCustomSectionSpeed(
          { name: customStartSettlement.name, coords: customStartSettlement.coords },
          { name: customEndSettlement.name, coords: customEndSettlement.coords }
        )
      : null
  ), [customStartSettlement, customEndSettlement, getCustomSectionSpeed, observations]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedObservationDay, setSelectedObservationDay] = useState<string | null>(null);
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);

  // Controls for adding observation
  const [showAddObs, setShowAddObs] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [locName, setLocName] = useState('');

  // Quick actual update mode
  const [showActualMode, setShowActualMode] = useState(false);

  const handlePrintClick = (bw: boolean) => {
    setPrintType(bw ? 'bw' : 'color');
    setIsPrintCropMode(true);
    setIsSidebarOpen(false);
  };

  // Controls for adding jam
  const [showAddJam, setShowAddJam] = useState(false);
  const [jamSeverity, setJamSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [jamDesc, setJamDesc] = useState('');

  // Pin logical state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinValue, setPinValue] = useState('');

  // Search local state
  const [searchQuery, setSearchQuery] = useState('');
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length <= 1) return [];
    return SETTLEMENTS.filter((s) => s.name.toLowerCase().includes(q));
  }, [searchQuery]);

  useEffect(() => {
    if (draftJamCoords) {
      setShowAddJam(true);
      setPickMode('none');
    }
  }, [draftJamCoords, setPickMode]);

  const fallbackMin = new Date(`${selectedYear}-05-01T00:00:00Z`);
  const fallbackMax = new Date(`${selectedYear}-06-30T23:59:59Z`);
  const today = new Date();
  // Extend the slider range to also cover today's date if we are currently
  // inside the monitored season for the selected year (so the timeline
  // always shows the actual present day).
  const includeToday = today.getFullYear() === selectedYear && today >= fallbackMin && today <= fallbackMax;
  const baseDates = observations.length > 0
    ? observations.map(o => new Date(o.date))
    : [fallbackMin, fallbackMax];
  if (includeToday) baseDates.push(today);
  const minDate = min(baseDates);
  const maxDate = max(baseDates);
  const observationDays = useMemo(() => {
    return Array.from(new Set(
      observations
        .map((obs) => new Date(obs.date))
        .filter((d) => !Number.isNaN(d.getTime()))
        .map((d) => d.toISOString().slice(0, 10))
    )).sort();
  }, [observations]);
  const observationDaysDesc = useMemo(() => [...observationDays].sort((a, b) => b.localeCompare(a)), [observationDays]);
  const observationsForSelectedDay = useMemo(() => {
    if (!selectedObservationDay) return observations.slice().reverse();
    return observations
      .filter((obs) => new Date(obs.date).toISOString().slice(0, 10) === selectedObservationDay)
      .slice()
      .reverse();
  }, [observations, selectedObservationDay]);

  useEffect(() => {
    if (observationDaysDesc.length === 0) {
      setSelectedObservationDay(null);
      setSelectedObservationId(null);
      return;
    }
    if (!selectedObservationDay || !observationDaysDesc.includes(selectedObservationDay)) {
      setSelectedObservationDay(observationDaysDesc[0]);
      setSelectedObservationId(null);
    }
  }, [observationDaysDesc, selectedObservationDay]);
  const maxObservedDate = useMemo(() => {
    if (observationDays.length === 0) return null;
    return new Date(`${observationDays[observationDays.length - 1]}T12:00:00.000Z`);
  }, [observationDays]);
  const navigationMaxDate = maxObservedDate ?? maxDate;
  const totalDays = Math.max(differenceInDays(navigationMaxDate, minDate), 1);

  const currentDays = Math.max(0, Math.min(totalDays, differenceInDays(new Date(currentDate), minDate)));
  const selectedTimelineDay = new Date(currentDate).toISOString().slice(0, 10);
  const nearestObservedDay = useMemo(() => {
    if (observationDays.length === 0) return null;
    let nearest = observationDays[0];
    for (const day of observationDays) {
      if (day <= selectedTimelineDay) nearest = day;
      else break;
    }
    return nearest;
  }, [observationDays, selectedTimelineDay]);
  const showMissingObservationNotice = observationDays.length > 0 &&
    !observationDays.includes(selectedTimelineDay) &&
    Boolean(nearestObservedDay);
  const todayDay = new Date().toISOString().slice(0, 10);
  const isCurrentDayWithoutData = selectedTimelineDay === todayDay && !observationDays.includes(todayDay);

  const focusObservationOnMap = (obs: IceObservation) => {
    const centerLng = (obs.upperEdgeCoords[0] + obs.lowerEdgeCoords[0]) / 2;
    const centerLat = (obs.upperEdgeCoords[1] + obs.lowerEdgeCoords[1]) / 2;
    setMapCenter(centerLng, centerLat, 7);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const daysToAdd = parseInt(e.target.value, 10);
    const newCurrent = addDays(minDate, daysToAdd);
    if (newCurrent.getTime() > navigationMaxDate.getTime()) {
      setCurrentDate(navigationMaxDate.toISOString());
      return;
    }
    setCurrentDate(newCurrent.toISOString());
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftUpper || !draftLower) return;

    // Either manual date or "now" if it's the actual update
    const selectedDate = showActualMode ? new Date().toISOString() : new Date(newDate).toISOString();

    addObservation({
      date: selectedDate,
      upperEdgeCoords: draftUpper,
      lowerEdgeCoords: draftLower,
      locationName: locName,
    });

    setShowAddObs(false);
    setShowActualMode(false);
    setNewDate(''); setLocName('');
    setDraftUpper(null);
    setDraftLower(null);
    setPickMode('none');

    setCurrentDate(selectedDate); // Jump to new state
  };

  const handleAddJamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftJamCoords) return;

    addJam({
      coords: draftJamCoords,
      dateAdded: new Date(currentDate).toISOString(),
      severity: jamSeverity,
      description: jamDesc,
    });

    setShowAddJam(false);
    setJamDesc('');
    setJamSeverity('medium');
    setPickMode('none');
  };

  // Basic playback logic (interval)
  React.useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        const curDateObj = new Date(currentDate);
        if (curDateObj.getTime() >= navigationMaxDate.getTime()) {
          setIsPlaying(false);
          return;
        } else {
          const nextDate = addDays(curDateObj, 1);
          if (nextDate.getTime() > navigationMaxDate.getTime()) {
            setCurrentDate(navigationMaxDate.toISOString());
            setIsPlaying(false);
            return;
          }
          setCurrentDate(nextDate.toISOString());
        }
      }, 500); // 0.5s per day
    }
    return () => window.clearInterval(interval);
  }, [isPlaying, currentDate, navigationMaxDate, setCurrentDate]);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // Expected Excel structure: 
        // Date (ISO or MM/DD/YYYY), Location, UpperLng, UpperLat, LowerLng, LowerLat, Notes
        let imported = 0;
        data.forEach((row: any) => {
          if (row.Date && row.UpperLng && row.UpperLat && row.LowerLng && row.LowerLat) {
            addObservation({
              date: new Date(row.Date).toISOString(),
              locationName: row.Location || '',
              upperEdgeCoords: [Number(row.UpperLng), Number(row.UpperLat)],
              lowerEdgeCoords: [Number(row.LowerLng), Number(row.LowerLat)],
              notes: row.Notes || ''
            });
            imported++;
          }
        });

        if (imported > 0) alert(`Успешно загружено ${imported} записей из Excel!`);
        else alert("Не найдено корректных записей. Проверьте структуру файла.");

      } catch (error) {
        console.error("Error parsing Excel:", error);
        alert("Ошибка при чтении Excel файла. Убедитесь, что структура верна (Date, Location, UpperLng, UpperLat, LowerLng, LowerLat).");
      }
    };
    reader.readAsBinaryString(file);
    if (e.target) e.target.value = '';
  };

  return (
    <div className="w-96 bg-white border-l border-slate-200 h-full flex flex-col shadow-xl z-10 relative overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4" data-tour="logo">
            <div className="w-10 h-10 bg-blue-600 rounded-xl shadow-inner shadow-blue-400 flex items-center justify-center shrink-0">
              <Snowflake className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-transparent leading-tight">
                Ледоход Якутии
              </h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                Система мониторинга
              </p>
            </div>
          </div>
          
          <button 
            data-tour="help-btn"
            onClick={() => setIsHelpOpen(true)}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
          >
            <HelpCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Database Link Section */}
        <div className="mb-4" data-tour="database-link">
          <a
            href="/database.html"
            target="_blank"
            className="w-full bg-slate-50 hover:bg-blue-50 text-blue-700 border border-blue-100 font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all group"
          >
            <Database className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-sm">База данных уровней воды</span>
          </a>
          <div className={`mt-2 text-[10px] px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
            waterSyncError
              ? 'bg-red-50 border-red-200 text-red-600'
              : isWaterSyncing
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            {waterSyncError ? (
              <AlertCircle className="w-3 h-3 shrink-0" />
            ) : isWaterSyncing ? (
              <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3 h-3 shrink-0" />
            )}
            <span>
              {waterSyncError
                ? `Ошибка sync БД: ${waterSyncError}`
                : isWaterSyncing
                  ? 'Синхронизация БД с Яндекс.Диском...'
                  : 'База воды актуальна (последняя проверка выполнена)'}
            </span>
            {waterLastSyncTime && (
              <span className="ml-auto text-[9px] opacity-60">
                {format(new Date(waterLastSyncTime), 'HH:mm', { locale: ru })}
              </span>
            )}
          </div>
        </div>

        {/* Year Switcher within Sidebar */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 mb-4" data-tour="year-switcher">
          <button
            onClick={() => {
              setSelectedYear(2025);
              setCurrentDate('2025-05-15T12:00:00Z');
            }}
            className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              selectedYear === 2025 
                ? 'bg-white text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            2025 (Архив)
          </button>
          <button
            onClick={() => {
              setSelectedYear(2026);
              setCurrentDate(getDefaultCurrentDate(2026));
            }}
            className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              selectedYear === 2026 
                ? 'bg-white text-blue-700 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            2026 (Текущий)
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative" data-tour="search">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
              placeholder="Поиск населенного пункта..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
              {searchResults.map(result => (
                <button
                  key={result.id}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  onClick={() => {
                    setSelectedSettlement(result);
                    setMapCenter(result.coords[0], result.coords[1], 10);
                    setSearchQuery('');
                  }}
                >
                  <span className="font-medium">{result.name}</span>
                  <span className="text-xs text-slate-400 ml-2">({result.distanceToMouth} км)</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <div className="mb-4 flex items-center justify-between pb-4 border-b border-slate-100" data-tour="admin-toggle">
          <div className="flex items-center gap-2">
            <ShieldUser className={`w-5 h-5 ${isAdmin ? 'text-purple-600' : 'text-slate-400'}`} />
            <span className={`text-sm font-semibold ${isAdmin ? 'text-purple-700' : 'text-slate-500'}`}>Режим админа</span>
          </div>
          <button
            onClick={() => {
              if (isAdmin) setIsAdmin(false);
              else setShowPinModal(true);
            }}
            className={`w-11 h-6 rounded-full transition-colors relative ${isAdmin ? 'bg-purple-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${isAdmin ? 'translate-x-5' : 'translate-x-0'}`}></span>
          </button>
        </div>

        {/* PIN Modal Area */}
        {showPinModal && !isAdmin && (
          <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl relative animate-in fade-in zoom-in-95 duration-200">
            <button onClick={() => setShowPinModal(false)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
            <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">Введите PIN (1234)</h3>
            <div className="flex gap-2">
              <input
                type="password"
                value={pinValue}
                autoFocus
                onChange={(e) => setPinValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (pinValue === '1234') { setIsAdmin(true); setShowPinModal(false); setPinValue(''); }
                    else { alert('Неверный PIN-код'); setPinValue(''); }
                  }
                }}
                placeholder="PIN"
                className="flex-1 text-sm border border-slate-300 rounded p-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                onClick={() => {
                  if (pinValue === '1234') { setIsAdmin(true); setShowPinModal(false); setPinValue(''); }
                  else { alert('Неверный PIN-код'); setPinValue(''); }
                }}
                className="bg-purple-600 text-white px-3 text-sm font-medium rounded hover:bg-purple-700"
              >Войти</button>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="mb-6 space-y-2" data-tour="sync-section">
            {/* Yandex Disk Sync Button */}
            <button
              onClick={async () => {
                await fetchFromYandexDisk();
                reloadWaterData();
              }}
              disabled={isLoading}
              className={`w-full font-medium py-2.5 rounded-lg shadow transition flex items-center justify-center gap-2 ${
                isLoading 
                  ? 'bg-amber-100 text-amber-700 cursor-wait' 
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600'
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isLoading ? 'Загрузка...' : 'Обновить данные'}
              <Cloud className="w-3.5 h-3.5 opacity-70" />
            </button>

            {/* Sync Status */}
            {lastSyncTime && (
              <div className={`text-[10px] px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                syncError 
                  ? 'bg-red-50 border-red-200 text-red-600' 
                  : 'bg-green-50 border-green-200 text-green-700'
              }`}>
                {syncError ? (
                  <AlertCircle className="w-3 h-3 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                )}
                <span>
                  {syncError 
                    ? syncError 
                    : syncFileCount > 0
                      ? `Синхр. — ${syncFileCount} нов. файл(ов), ${observations.length} записей`
                      : 'Проверено: новых файлов нет'
                  }
                </span>
                <span className="ml-auto text-[9px] opacity-60">
                  {format(new Date(lastSyncTime), 'HH:mm', { locale: ru })}
                </span>
              </div>
            )}
            <div className="text-[10px] text-slate-500 text-center">
              Проверка данных выполняется через модуль базы данных
            </div>

            <div className="flex gap-2">
              <button
                onClick={downloadIceObservationTemplate}
                className="flex-1 bg-slate-50 text-slate-700 border border-slate-200 font-medium py-2.5 rounded-lg shadow-sm hover:bg-slate-100 transition flex items-center justify-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                <span className="text-xs">Скачать шаблон</span>
              </button>
            </div>

            {/* Print Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handlePrintClick(false)}
                className="flex-1 bg-slate-50 text-slate-700 border border-slate-200 font-medium py-2.5 rounded-lg shadow-sm hover:bg-slate-100 transition flex items-center justify-center gap-2 text-sm"
              >
                <Printer className="w-4 h-4 text-blue-600" />
                <span className="text-xs">Печать карты</span>
              </button>
              <button
                onClick={() => handlePrintClick(true)}
                className="flex-1 bg-slate-50 text-slate-700 border border-slate-200 font-medium py-2.5 rounded-lg shadow-sm hover:bg-slate-100 transition flex items-center justify-center gap-2 text-sm"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span className="text-xs">Ч/Б Печать</span>
              </button>
            </div>

            {/* Yandex Disk Link */}
            <a 
              href="https://disk.yandex.ru/d/LENyBdYBr2B3rA" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full text-[10px] text-blue-500 hover:text-blue-700 flex items-center justify-center gap-1 py-1 transition-colors"
            >
              <Cloud className="w-3 h-3" />
              Открыть папку Яндекс.Диска
            </a>
          </div>
        )}

        {selectedSettlement && (
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-4 relative shadow-sm">
            <button onClick={() => setSelectedSettlement(null)} className="absolute top-2 right-2 p-1 hover:bg-blue-100 rounded text-blue-500">
              <X className="w-4 h-4" />
            </button>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 pr-6">
              {selectedSettlement.name}
            </h2>
            <div className="mt-1 text-xs text-slate-600">
              Расстояние до устья: <span className="font-bold">{selectedSettlement.distanceToMouth ? `${selectedSettlement.distanceToMouth} км` : 'Неизвестно'}</span>
            </div>

            {(() => {
              const history = getStationHistory(selectedSettlement.name, currentDate, 4);
              if (history.length < 1) return null;
              
              const stnMeta = getStation(selectedSettlement.name);
              const currentLevel = history[history.length - 1].level;
              const prevLevel = history.length > 1 ? history[history.length - 2].level : currentLevel;
              const diff = currentLevel - prevLevel;
              
              return (
                <div className="mt-4 pt-3 border-t border-blue-100">
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-blue-400">Уровень воды</div>
                      <div className="font-bold text-blue-700 text-xl">{currentLevel} <span className="text-xs font-normal">см</span></div>
                      {history.length > 1 && (
                        <div className={`text-xs font-bold flex items-center gap-0.5 mt-0.5 ${diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-500' : 'text-slate-400'}`}>
                          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {diff > 0 ? '+' : ''}{diff} см
                        </div>
                      )}
                    </div>
                    {stnMeta?.criticalLevel && (() => {
                      const remaining = stnMeta.criticalLevel - currentLevel;
                      const ratio = currentLevel / stnMeta.criticalLevel;
                      // ratio >= 0.7 → red; ratio >= 0.5 → yellow; else → green
                      const tone = ratio >= 0.7
                        ? { label: 'text-red-500', value: 'text-red-700' }
                        : ratio >= 0.5
                          ? { label: 'text-amber-500', value: 'text-amber-700' }
                          : { label: 'text-emerald-500', value: 'text-emerald-700' };
                      return (
                        <div>
                          <div className={`text-[10px] uppercase font-bold ${tone.label}`}>
                            {remaining < 0 ? 'Превышен на' : 'До критического'}
                          </div>
                          <div className={`font-bold text-xl ${tone.value}`}>
                            {Math.abs(remaining)} <span className="text-xs font-normal">см</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  
                  {history.length > 1 && (
                    <div className="bg-white/60 rounded-md border border-blue-100 p-2 mt-2">
                      <div className="text-[9px] uppercase font-bold text-slate-500 mb-1 border-b border-blue-100 pb-1">Последние судные дни</div>
                      <div className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                        {history.slice().reverse().map((h, i) => (
                          <div key={h.date} className="flex justify-between items-center">
                            <span className={i === 0 ? "font-bold text-blue-700" : ""}>{format(new Date(h.date), 'd MMM', { locale: ru })}</span>
                            <span className={i === 0 ? "font-bold text-blue-700" : "text-slate-600"}>{h.level} см</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <div className="mb-8" data-tour="timeline">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Временная шкала
            </h2>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded-full transition-colors ${isPlaying ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>

          <div className="px-2">
            <input
              type="range"
              min={0}
              max={totalDays || 1}
              value={currentDays || 0}
              onChange={handleSliderChange}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
          <div className="mt-3 text-center text-lg font-medium text-slate-800">
            {format(new Date(currentDate), 'dd MMMM yyyy', { locale: ru })}
          </div>
          {showMissingObservationNotice && nearestObservedDay && (
            <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-900 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {isCurrentDayWithoutData ? (
                <span>На текущую дату данных на данный момент нет.</span>
              ) : (
                <span>
                  Нет наблюдения на выбранную дату, показано состояние на {format(new Date(`${nearestObservedDay}T12:00:00.000Z`), 'dd.MM', { locale: ru })}.
                </span>
              )}
            </div>
          )}

          <div className="mt-6" data-tour="legend">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ледовые явления</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span className="text-slate-700 font-medium">Чистая вода</span>
                </div>
                <span className="text-[10px] text-slate-500">подпрыгивание</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-cyan-500"></span>
                  <span className="text-slate-700 font-medium">Ледоход</span>
                </div>
                <span className="text-[10px] text-slate-500">подпрыгивание</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-300 border border-slate-400"></span>
                  <span className="text-slate-700 font-medium">Ледостав</span>
                </div>
                <span className="text-[10px] text-slate-500">пульсация</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                  <span className="text-slate-700 font-medium">Затор</span>
                </div>
                <span className="text-[10px] text-slate-500">пульсирующее кольцо</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-500"></span>
                  <span className="text-slate-700 font-medium">Не определено</span>
                </div>
                <span className="text-[10px] text-slate-500">подпрыгивание</span>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              Анимации соответствуют значкам на карте и помогают визуально отличать тип явления.
            </div>
          </div>
          <div className="mt-8 border-t border-slate-100 pt-6">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              История по участкам
            </h3>
            <div className="mb-3 p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg space-y-2">
              <div className="text-[10px] uppercase tracking-wide font-bold text-blue-700">Скорость между выбранными городами</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={customSpeedStartName}
                  onChange={(e) => setCustomSpeedStartName(e.target.value)}
                  list="settlements-speed-from"
                  placeholder="Город от..."
                  className="w-full text-xs rounded bg-white border border-blue-200 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={customSpeedEndName}
                  onChange={(e) => setCustomSpeedEndName(e.target.value)}
                  list="settlements-speed-to"
                  placeholder="Город до..."
                  className="w-full text-xs rounded bg-white border border-blue-200 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <datalist id="settlements-speed-from">
                  {SETTLEMENTS.slice().reverse().map((s) => (
                    <option key={`from-${s.id}`} value={s.name} />
                  ))}
                </datalist>
                <datalist id="settlements-speed-to">
                  {SETTLEMENTS.slice().reverse().map((s) => (
                    <option key={`to-${s.id}`} value={s.name} />
                  ))}
                </datalist>
              </div>
              {(customSpeedStartName.trim() && !customStartSettlement) || (customSpeedEndName.trim() && !customEndSettlement) ? (
                <div className="text-[10px] text-amber-700">
                  Город не найден. Выберите город из выпадающего списка (точное совпадение названия).
                </div>
              ) : null}
              {customStartSettlement && customEndSettlement && customSectionSpeed && (
                <div className="text-[11px] text-blue-900 bg-white border border-blue-200 rounded-md p-2">
                  <div className="font-bold">
                    {customSectionSpeed.startLoc} → {customSectionSpeed.endLoc}
                  </div>
                  <div className="mt-0.5">
                    {customSectionSpeed.speed.toFixed(1)} км/сут
                    <span className="text-slate-500 ml-1">({(customSectionSpeed.speed / 24).toFixed(1)} км/ч)</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Дистанция: {customSectionSpeed.distanceKm.toFixed(1)} км, период: {format(new Date(customSectionSpeed.startDate), 'd MMM', { locale: ru })} — {format(new Date(customSectionSpeed.endDate), 'd MMM', { locale: ru })}
                  </div>
                </div>
              )}
              {customStartSettlement && customEndSettlement && !customSectionSpeed && (
                <div className="text-[10px] text-slate-500 italic">
                  Недостаточно наблюдений для выбранного отрезка.
                </div>
              )}
            </div>
            {sectionSpeeds.length > 0 ? (
              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                {sectionSpeeds.map((s, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-slate-700 truncate mr-2" title={`${s.startLoc} → ${s.endLoc}`}>
                        {s.startLoc || '?'} → {s.endLoc || '?'}
                      </span>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 rounded">
                        {s.speed.toFixed(1)} <span className="text-[10px] font-medium text-blue-400">км/сут</span>
                        <span className="text-[9px] text-slate-400 ml-1">({(s.speed / 24).toFixed(1)} км/ч)</span>
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {format(new Date(s.startDate), 'd MMM', { locale: ru })} — {format(new Date(s.endDate), 'd MMM', { locale: ru })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Недостаточно данных для расчета участков</p>
            )}
          </div>
        </div>

        <div className="mb-4" data-tour="jams">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-orange-500" />
              Заторы
            </h2>
          </div>

          {isAdmin && (
            <div className="mb-4 p-3 bg-purple-50 text-purple-800 text-xs rounded-lg border border-purple-100 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Кликните в любом месте на реке (карте), чтобы добавить затор.</p>
            </div>
          )}

          {showAddJam && draftJamCoords && (
            <form onSubmit={handleAddJamSubmit} className="bg-orange-50 rounded-xl p-4 border border-orange-200 mb-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">Координаты</label>
                <div className="text-xs text-orange-600 bg-orange-100 p-2 rounded">
                  {draftJamCoords[1].toFixed(4)}, {draftJamCoords[0].toFixed(4)}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">Опасность</label>
                <select value={jamSeverity} onChange={e => setJamSeverity(e.target.value as any)} className="w-full text-sm rounded bg-white border border-orange-200 p-2 focus:ring-2 focus:ring-orange-500 py-2">
                  <option value="low">Слабый затор</option>
                  <option value="medium">Средний затор</option>
                  <option value="high">Критичный (Угроза)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-orange-800 mb-1">Описание (опц.)</label>
                <input type="text" value={jamDesc} onChange={e => setJamDesc(e.target.value)} placeholder="Причина или статус" className="w-full text-sm rounded bg-white border border-orange-200 p-2 focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-orange-600 text-white font-medium py-2 rounded shadow hover:bg-orange-700 transition">
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddJam(false);
                    setPickMode('none');
                    setDraftJamCoords(null);
                  }}
                  className="px-3 bg-white border border-orange-200 text-orange-600 rounded hover:bg-orange-50 transition"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3 mb-8">
            {jams.length === 0 && <div className="text-xs text-slate-500 italic">Активных заторов нет.</div>}
            {jams.map(jam => (
              <div key={jam.id} className={`p-3 rounded-lg border flex flex-col gap-2 relative ${jam.status === 'cleared' ? 'bg-slate-50 border-slate-200 opacity-60' : jam.severity === 'high' ? 'bg-red-50 border-red-200' : jam.severity === 'medium' ? 'bg-orange-50 border-orange-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center justify-between">
                  <div className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1 ${jam.status === 'cleared' ? 'text-slate-500' : jam.severity === 'high' ? 'text-red-700' : jam.severity === 'medium' ? 'text-orange-700' : 'text-amber-700'}`}>
                    {jam.status === 'cleared' ? <CheckCircle2 className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                    {jam.status === 'cleared' ? 'Устранен' : jam.severity === 'high' ? 'Критичный' : jam.severity === 'medium' ? 'Средний' : 'Слабый'}
                  </div>
                  <div className="text-[10px] text-slate-500">{format(new Date(jam.dateAdded), 'd MMM', { locale: ru })}</div>
                </div>
                {jam.description && <div className="text-xs text-slate-700">{jam.description}</div>}
                <div className="text-[10px] text-slate-500 font-mono mt-1">lat: {jam.coords[1].toFixed(2)}, lng: {jam.coords[0].toFixed(2)}</div>

                {isAdmin && jam.status === 'active' && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-black/5">
                    <button onClick={() => resolveJam(jam.id)} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Разрешен
                    </button>
                    <button onClick={() => removeJam(jam.id)} className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-300 transition-colors flex items-center gap-1 ml-auto">
                      <XCircle className="w-3 h-3" /> Удал.
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8" data-tour="observations">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Точки наблюдений
            </h2>
            {isAdmin && (
              <button
                onClick={() => setShowAddObs(!showAddObs)}
                className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors flex items-center gap-1 font-medium"
              >
                <Plus className="w-3 h-3" />
                Добавить
              </button>
            )}
          </div>

          {showAddObs && isAdmin && (
            <form onSubmit={handleAddSubmit} className={`${showActualMode ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'} rounded-xl p-4 border mb-6 space-y-4`}>
              {showActualMode && (
                <div className="text-xs bg-blue-100 text-blue-800 p-2 rounded">
                  Обновление статуса на <b>{format(new Date(), 'd MMMM, HH:mm', { locale: ru })}</b>
                </div>
              )}

              {!showActualMode && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Дата</label>
                  <input type="date" required value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full text-sm rounded bg-white border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              )}

              {/* Quick select via dropdowns */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Верхняя кромка</label>
                  <select
                    className="w-full text-xs rounded bg-white border border-slate-300 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onChange={e => {
                      const s = SETTLEMENTS.find(x => x.id === e.target.value);
                      if (s) {
                        setDraftUpper(s.coords);
                        setLocName(prev => {
                          const parts = prev.split(' - ');
                          return `${s.name} - ${parts[1] || '?'}`;
                        });
                      }
                    }}
                  >
                    <option value="">(Клик на карте)</option>
                    {SETTLEMENTS.slice().reverse().map(s => <option key={s.id} value={s.id}>{s.name} ({s.distanceToMouth || '?'} км)</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Нижняя кромка</label>
                  <select
                    className="w-full text-xs rounded bg-white border border-slate-300 p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onChange={e => {
                      const s = SETTLEMENTS.find(x => x.id === e.target.value);
                      if (s) {
                        setDraftLower(s.coords);
                        setLocName(prev => {
                          const parts = prev.split(' - ');
                          return `${parts[0] || '?'} - ${s.name}`;
                        });
                      }
                    }}
                  >
                    <option value="">(Клик на карте)</option>
                    {SETTLEMENTS.slice().reverse().map(s => <option key={s.id} value={s.id}>{s.name} ({s.distanceToMouth || '?'} км)</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-2 bg-white border border-slate-200 rounded-lg text-center">
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === 'upper' ? 'none' : 'upper')}
                    className={`w-full py-1.5 text-xs rounded transition-colors ${pickMode === 'upper' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} font-medium`}
                  >
                    {draftUpper ? 'Уточнить верхнюю на карте' : 'Указать верхнюю на карте'}
                  </button>
                  {draftUpper && (
                    <div className="mt-1.5 text-[10px] text-slate-500 font-mono">
                      Lat: {draftUpper[1].toFixed(4)}, Lng: {draftUpper[0].toFixed(4)}
                    </div>
                  )}
                </div>

                <div className="p-2 bg-white border border-slate-200 rounded-lg text-center">
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === 'lower' ? 'none' : 'lower')}
                    className={`w-full py-1.5 text-xs rounded transition-colors ${pickMode === 'lower' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} font-medium`}
                  >
                    {draftLower ? 'Уточнить нижнюю на карте' : 'Указать нижнюю на карте'}
                  </button>
                  {draftLower && (
                    <div className="mt-1.5 text-[10px] text-slate-500 font-mono">
                      Lat: {draftLower[1].toFixed(4)}, Lng: {draftLower[0].toFixed(4)}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Явление (между кромками)</label>
                <select className="w-full text-sm rounded bg-white border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option>Густой ледоход</option>
                  <option>Редкий ледоход</option>
                  <option>Подвижки</option>
                  <option>Закраины / Разводья</option>
                  <option>Чистая вода</option>
                  <option>Вода на льду</option>
                  <option>Ледостав</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Локация / Описание (опц.)</label>
                <input type="text" value={locName} onChange={e => setLocName(e.target.value)} placeholder="Например: Якутск - Сангар" className="w-full text-sm rounded bg-white border border-slate-300 p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>

              <div className="flex gap-2">
                <button type="submit" disabled={!draftUpper || !draftLower} className="flex-1 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded shadow hover:bg-blue-700 transition">
                  {showActualMode ? 'Опубликовать статус' : 'Сохранить данные'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddObs(false);
                    setShowActualMode(false);
                    setPickMode('none');
                    setDraftUpper(null);
                    setDraftLower(null);
                  }}
                  className="px-3 bg-white border border-slate-200 text-slate-600 rounded hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {observationDaysDesc.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Дни наблюдений
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {observationDaysDesc.map((day) => {
                    const isActiveDay = day === selectedObservationDay;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setSelectedObservationDay(day);
                          setSelectedObservationId(null);
                        }}
                        className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                          isActiveDay
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-blue-300 hover:text-blue-700'
                        }`}
                      >
                        {format(new Date(`${day}T12:00:00.000Z`), 'dd.MM')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <AnimatePresence>
              {observationsForSelectedDay.map((obs, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  key={obs.id} 
                  className={`p-3 rounded-lg border flex flex-col gap-2 relative transition-shadow hover:shadow-md cursor-pointer ${
                    selectedObservationId === obs.id
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
                      : 'border-slate-200 bg-white hover:border-blue-300'
                  }`}
                  onClick={() => {
                    if (isPlaying) setIsPlaying(false);
                    setSelectedObservationId(obs.id);
                    focusObservationOnMap(obs);
                  }}
                >
                  <div className="font-semibold text-slate-800 text-sm">
                    {format(new Date(obs.date), 'd MMM yyyy', { locale: ru })}
                  </div>
                  {obs.locationName && (
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Info className="w-3 h-3" /> {obs.locationName}
                    </div>
                  )}
                  {obs.notes && (
                    <div className="text-xs text-slate-400 mt-1 italic leading-tight">
                      "{obs.notes}"
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
