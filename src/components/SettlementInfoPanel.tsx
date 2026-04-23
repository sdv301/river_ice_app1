import React from 'react';
import { ArrowLeft, Info, Droplets, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { generateWaterLevelHistory } from '../utils/mockDataService';
import { ResponsiveContainer, LineChart, Line, XAxis, Tooltip } from 'recharts';
import { useIceStore } from '../store/iceStore';

interface Props {
  settlement: any;
  onClose: () => void;
  currentDate: string;
}

export default function SettlementInfoPanel({ settlement, onClose, currentDate }: Props) {
  const { getSectionSpeeds } = useIceStore();
  const sectionSpeeds = getSectionSpeeds();

  const history = generateWaterLevelHistory(settlement.name, currentDate, 7);
  const currentLevel = history[history.length - 1].level;
  const prevLevel = history[history.length - 2].level;
  const diff = currentLevel - prevLevel;
  
  // Format for Recharts
  const chartData = history.map(h => ({
     name: format(new Date(h.date), 'dd.MM'),
     level: h.level
  }));

  return (
    <div className="w-full bg-white flex flex-col h-full z-20 overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
        <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          {settlement.name}
        </h2>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Уровень воды</h3>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-end justify-between mb-1">
              <span className="text-3xl font-bold text-blue-700">{currentLevel} <span className="text-lg font-medium text-blue-500">см</span></span>
              <div className={`flex items-center gap-1 text-sm font-bold ${diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-500' : 'text-slate-500'}`}>
                {diff > 0 ? <TrendingUp className="w-4 h-4" /> : diff < 0 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                {diff > 0 ? '+' : ''}{diff} см
              </div>
            </div>
            <div className="text-xs text-slate-500 mb-4">
              На {format(new Date(currentDate), 'd MMMM yyyy', { locale: ru })}
            </div>
            
            {/* Recharts Sparkline */}
            <div className="h-24 w-full mt-2 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="name" hide={true} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '10px', padding: '4px 8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ color: '#1d4ed8', fontWeight: 'bold' }}
                    labelStyle={{ color: '#64748b', marginBottom: '2px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="level" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={{ r: 3, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, fill: '#1d4ed8' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-[9px] text-blue-400 font-medium px-2 mt-1">
              <span>{chartData[0].name}</span>
              <span>7 дней</span>
              <span>{chartData[chartData.length - 1].name}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">За предыдущие сутки</h3>
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-lg p-3">
             <span className="text-sm font-medium text-slate-700">{format(subDays(new Date(currentDate), 1), 'd MMMM', { locale: ru })}</span>
             <span className="text-slate-900 font-bold">{prevLevel} см</span>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-800 flex gap-2">
          <Info className="w-5 h-5 shrink-0 text-amber-600" />
          <p>
            Исторический максимум для этого населенного пункта: <b>{currentLevel + 124} см</b>. До критической отметки остается {124} см.
          </p>
        </div>

        {settlement.distanceToMouth && (
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Расстояние до устья р. Лена</span>
            <span className="text-lg font-bold text-slate-800">{settlement.distanceToMouth} <span className="text-sm font-medium text-slate-500">км</span></span>
          </div>
        )}

        <div>
           <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-4">Маршрут и скорость прохождения</h3>
           <div className="relative pl-4 border-l-2 border-slate-200 mt-2 ml-2 space-y-4">
              {sectionSpeeds.map((section: any, i: number) => (
                 <div key={i} className="relative">
                    <div className="absolute -left-[21px] top-1.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow"></div>
                    <div className="text-sm font-bold text-slate-800">{section.startLoc} &rarr; {section.endLoc}</div>
                    <div className="text-xs text-slate-500">{format(new Date(section.startDate), 'd MMM')} &ndash; {format(new Date(section.endDate), 'd MMM yyyy', { locale: ru })}</div>
                    <div className="text-xs font-medium text-blue-600 bg-blue-50 inline-block px-1.5 py-0.5 rounded mt-1 border border-blue-100">{section.speed.toFixed(1)} км/сут</div>
                 </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}
