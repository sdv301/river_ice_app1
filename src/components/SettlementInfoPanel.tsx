import React from 'react';
import { X, Info, Droplets, TrendingUp, TrendingDown, Minus, MapPin, Activity } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useIceStore } from '../store/iceStore';
import { useWaterLevelStore } from '../store/waterLevelStore';
import UITooltip from './Tooltip';

interface Props {
  settlement: any;
  onClose: () => void;
  currentDate: string;
}

export default function SettlementInfoPanel({ settlement, onClose, currentDate }: Props) {
  const { getSectionSpeeds } = useIceStore();
  const { getStationHistory, getStation } = useWaterLevelStore();
  const sectionSpeeds = getSectionSpeeds();

  const history = getStationHistory(settlement.name, currentDate, 10);
  const stnMeta = getStation(settlement.name);
  
  const chartData = history.map(h => ({
     name: format(new Date(h.date), 'dd.MM'),
     level: h.level
  }));

  const currentLevel = history.length > 0 ? history[history.length - 1].level : 0;
  const prevLevel = history.length > 1 ? history[history.length - 2].level : currentLevel;
  const diff = currentLevel - prevLevel;

  // Cm remaining to the critical level (риск):
  //   ≤ 0   → red (exceeded)
  //   ≤ 250 → red (danger)
  //   ≤ 500 → yellow (warning)
  //   > 500 → green (normal)
  const remainingToCritical = stnMeta?.criticalLevel ? stnMeta.criticalLevel - currentLevel : null;
  const ratio = stnMeta?.criticalLevel ? currentLevel / stnMeta.criticalLevel : null;
  const remainingTone = ratio === null
    ? { panel: 'bg-slate-50 border-slate-100', icon: 'bg-slate-100 text-slate-500', title: 'text-slate-700', body: 'text-slate-700', value: 'text-slate-800', label: 'нет данных' }
    : ratio >= 1
      ? { panel: 'bg-red-50 border-red-200', icon: 'bg-red-100 text-red-600', title: 'text-red-900', body: 'text-red-800', value: 'text-red-700', label: 'критический уровень превышен (ОЯ)' }
    : ratio >= 0.7
        ? { panel: 'bg-red-50 border-red-200', icon: 'bg-red-100 text-red-600', title: 'text-red-900', body: 'text-red-800', value: 'text-red-700', label: 'критическая угроза (ОЯ)' }
        : ratio >= 0.5
          ? { panel: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-600', title: 'text-amber-900', body: 'text-amber-800', value: 'text-amber-700', label: 'повышенное внимание (НЯ)' }
          : { panel: 'bg-green-50 border-green-200', icon: 'bg-green-100 text-green-600', title: 'text-green-900', body: 'text-green-800', value: 'text-green-700', label: 'норма' };

  return (
    <div className="w-full bg-white flex flex-col h-full overflow-hidden">
      {/* Dynamic Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <MapPin className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">
              {settlement.name}
            </h2>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              Актуальные данные на {format(new Date(currentDate), 'd MMMM yyyy', { locale: ru })}
            </div>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="p-2.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-all active:scale-90"
        >
          <X className="w-7 h-7" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
          
          {/* Left Column: Stats */}
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Droplets className="w-4 h-4" /> Текущее состояние
              </h3>
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-8 text-white shadow-xl shadow-blue-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                  <Activity className="w-32 h-32" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-blue-100 font-bold mb-2">
                    Уровень воды сегодня
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black">{currentLevel}</span>
                    <span className="text-2xl font-bold opacity-60 text-blue-100">см</span>
                  </div>
                  <div className={`inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-full font-black text-sm ${diff > 0 ? 'bg-red-500/20 text-red-100' : 'bg-green-500/20 text-green-100'}`}>
                    {diff > 0 ? <TrendingUp className="w-4 h-4" /> : diff < 0 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    {diff > 0 ? 'Подъём' : diff < 0 ? 'Спад' : 'Без изменений'} на {Math.abs(diff)} см
                  </div>
                </div>
              </div>
            </section>

            {stnMeta?.criticalLevel && (
              <section className={`border rounded-3xl p-6 flex gap-4 ${remainingTone.panel}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${remainingTone.icon}`}>
                  <Info className="w-6 h-6" />
                </div>
                <div>
                  <h4 className={`font-bold text-lg mb-1 ${remainingTone.title}`}>
                    Критическая отметка — {remainingTone.label}
                  </h4>
                  <p className={`leading-relaxed ${remainingTone.body}`}>
                    Для данного пункта отметка ОЯ составляет <b className={remainingTone.title}>{stnMeta.criticalLevel} см</b>.
                    {remainingToCritical !== null && remainingToCritical >= 0 && (
                      <> До критического уровня осталось <b className={remainingTone.value}>{remainingToCritical} см</b>.</>
                    )}
                    {remainingToCritical !== null && remainingToCritical < 0 && (
                      <> Уровень превышен на <b className={remainingTone.value}>{Math.abs(remainingToCritical)} см</b>.</>
                    )}
                  </p>
                </div>
              </section>
            )}

            <section className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ранее</div>
                <div className="text-xl font-bold text-slate-800">{prevLevel} см</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">за сутки до</div>
              </div>
              {settlement.distanceToMouth && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">До устья</div>
                  <div className="text-xl font-bold text-slate-800">{settlement.distanceToMouth} км</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">р. Лена</div>
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Chart & Logistics */}
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" /> График уровней (10 дней)
              </h3>
              <div className="bg-white border border-slate-100 rounded-3xl p-6 h-64 shadow-inner bg-slate-50/10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                      dy={10}
                    />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 800, fontSize: '12px' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="level" 
                      stroke="#3b82f6" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorLevel)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                Маршрут ледохода
              </h3>
              <div className="space-y-4">
                {sectionSpeeds.length > 0 ? sectionSpeeds.map((section: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors rounded-2xl border border-dashed border-slate-200">
                    <div>
                      <div className="text-sm font-black text-slate-800">{section.startLoc} &rarr; {section.endLoc}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">
                        {format(new Date(section.startDate), 'd MMM')} – {format(new Date(section.endDate), 'd MMM yyyy', { locale: ru })}
                      </div>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 text-right">
                      <div className="text-blue-600 font-black text-sm">{section.speed.toFixed(1)}</div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">км/сутки</div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 italic">
                    Данные о скорости на участке отсутствуют
                  </div>
                )}
              </div>
            </section>
          </div>

        </div>
      </div>
      
      <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
        <button 
          onClick={onClose}
          className="px-8 py-3 bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-700 transition-all shadow-xl shadow-slate-200 active:scale-95"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
