import React, { useState, useEffect } from 'react';
import { format, min, max, differenceInDays, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar, MapPin, Plus, Play, Pause, Info, ShieldAlert, CheckCircle2, ShieldUser, XCircle, Crosshair } from 'lucide-react';
import type { IceObservation, IceJam, PickMode } from '../types';

interface SidebarProps {
  observations: IceObservation[];
  currentDate: string;
  setCurrentDate: (date: string) => void;
  addObservation: (obs: Omit<IceObservation, 'id'>) => void;
  jams: IceJam[];
  addJam: (jam: Omit<IceJam, 'id' | 'status'>) => void;
  resolveJam: (id: string) => void;
  removeJam: (id: string) => void;
  draftJamCoords: [number, number] | null;
  setDraftJamCoords: (coords: [number, number] | null) => void;
  isAdmin: boolean;
  setIsAdmin: (val: boolean) => void;
  pickMode: PickMode;
  setPickMode: (mode: PickMode) => void;
  draftUpper: [number, number] | null;
  draftLower: [number, number] | null;
  setDraftUpper: (coords: [number, number] | null) => void;
  setDraftLower: (coords: [number, number] | null) => void;
}

export default function Sidebar({
  observations, currentDate, setCurrentDate, addObservation,
  jams, addJam, resolveJam, removeJam, draftJamCoords, setDraftJamCoords, isAdmin, setIsAdmin,
  pickMode, setPickMode, draftUpper, draftLower, setDraftUpper, setDraftLower
}: SidebarProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Controls for adding observation
  const [showAddObs, setShowAddObs] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [locName, setLocName] = useState('');
  
  // Quick actual update mode
  const [showActualMode, setShowActualMode] = useState(false);

  // Controls for adding jam
  const [showAddJam, setShowAddJam] = useState(false);
  const [jamSeverity, setJamSeverity] = useState<'low'|'medium'|'high'>('medium');
  const [jamDesc, setJamDesc] = useState('');

  useEffect(() => {
    if (draftJamCoords) {
      setShowAddJam(true);
      setPickMode('none');
    }
  }, [draftJamCoords, setPickMode]);

  const minDate = observations.length > 0 ? min(observations.map(o => new Date(o.date))) : new Date();
  const maxDate = observations.length > 0 ? max(observations.map(o => new Date(o.date))) : new Date();
  const totalDays = differenceInDays(maxDate, minDate);
  
  const currentDays = differenceInDays(new Date(currentDate), minDate);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const daysToAdd = parseInt(e.target.value, 10);
    const newCurrent = addDays(minDate, daysToAdd);
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
        if (curDateObj >= maxDate) {
          setIsPlaying(false);
          setCurrentDate(minDate.toISOString()); // Reset
        } else {
          setCurrentDate(addDays(curDateObj, 1).toISOString());
        }
      }, 500); // 0.5s per day
    }
    return () => window.clearInterval(interval);
  }, [isPlaying, currentDate, maxDate, minDate, setCurrentDate]);

  return (
    <div className="w-96 bg-white border-l border-slate-200 h-full flex flex-col shadow-xl z-10">
      <div className="p-6 border-b border-slate-100">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Ледоход</h1>
        <p className="text-sm text-slate-500 mt-1">Мониторинг реки Лена, Якутия</p>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <div className="mb-4 flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
             <ShieldUser className={`w-5 h-5 ${isAdmin ? 'text-purple-600' : 'text-slate-400'}`} />
             <span className={`text-sm font-semibold ${isAdmin ? 'text-purple-700' : 'text-slate-500'}`}>Режим админа</span>
          </div>
          <button 
            onClick={() => setIsAdmin(!isAdmin)}
            className={`w-11 h-6 rounded-full transition-colors relative ${isAdmin ? 'bg-purple-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${isAdmin ? 'translate-x-5' : 'translate-x-0'}`}></span>
          </button>
        </div>

        {isAdmin && (
          <div className="mb-6">
            <button 
              onClick={() => {
                setShowActualMode(true);
                setShowAddObs(true);
              }}
              className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg shadow hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              <Crosshair className="w-4 h-4" />
              Загрузить актуальные данные
            </button>
            {showActualMode && (
              <p className="text-xs text-slate-500 mt-2 text-center">
                Укажите текущее положение кромок на карте
              </p>
            )}
          </div>
        )}

        <div className="mb-8">
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
          
          <div className="mt-6 flex gap-2 w-full justify-between items-center text-xs">
            <div className="flex flex-col items-center gap-1">
              <span className="w-3 h-3 bg-blue-600 rounded-full inline-block"></span>
              <span className="text-slate-600 text-[10px] uppercase font-semibold">Чистая вода</span>
            </div>
            <div className="flex flex-col items-center gap-1 shadow-sm">
              <span className="w-3 h-3 bg-blue-300 rounded-full inline-block"></span>
              <span className="text-slate-600 text-[10px] uppercase font-semibold">Ледоход</span>
            </div>
            <div className="flex flex-col items-center gap-1 shadow-sm">
              <span className="w-3 h-3 bg-slate-100 border border-slate-300 rounded-full inline-block"></span>
              <span className="text-slate-600 text-[10px] uppercase font-semibold">Ледостав</span>
            </div>
          </div>
        </div>

        <div className="mb-4">
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

        <div className="mb-8">
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

              <div className="space-y-3">
                <div className="p-3 bg-white border border-slate-200 rounded text-center">
                   <button 
                     type="button" 
                     onClick={() => setPickMode(pickMode === 'upper' ? 'none' : 'upper')}
                     className={`w-full py-1.5 text-xs rounded transition-colors ${pickMode === 'upper' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} font-medium`}
                   >
                     {draftUpper ? 'Изменить верхнюю кромку' : 'Указать верхнюю кромку'}
                   </button>
                   {draftUpper && (
                     <div className="mt-1.5 text-[10px] text-slate-500 font-mono">
                        Lat: {draftUpper[1].toFixed(4)}, Lng: {draftUpper[0].toFixed(4)}
                     </div>
                   )}
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded text-center">
                   <button 
                     type="button" 
                     onClick={() => setPickMode(pickMode === 'lower' ? 'none' : 'lower')}
                     className={`w-full py-1.5 text-xs rounded transition-colors ${pickMode === 'lower' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} font-medium`}
                   >
                     {draftLower ? 'Изменить нижнюю кромку' : 'Указать нижнюю кромку'}
                   </button>
                   {draftLower && (
                     <div className="mt-1.5 text-[10px] text-slate-500 font-mono">
                        Lat: {draftLower[1].toFixed(4)}, Lng: {draftLower[0].toFixed(4)}
                     </div>
                   )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Локация (опц.)</label>
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
            {observations.map((obs) => (
              <div key={obs.id} className="p-3 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 transition cursor-pointer" onClick={() => setCurrentDate(obs.date)}>
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
