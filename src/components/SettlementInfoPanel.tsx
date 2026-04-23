import React from 'react';
import { ArrowLeft, Info, Droplets, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Props {
  settlement: any;
  onClose: () => void;
  currentDate: string;
}

export default function SettlementInfoPanel({ settlement, onClose, currentDate }: Props) {
  // Generate some semi-random but consistent mock data for water levels based on the settlement ID and date
  const hash = settlement.name.length + new Date(currentDate).getDate();
  const currentLevel = 250 + (hash * 7 % 300); // 250 to 550 cm
  const prevLevel = 250 + ((hash - 1) * 7 % 300);
  const diff = currentLevel - prevLevel;

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
            <div className="text-xs text-slate-500">
              На {format(new Date(currentDate), 'd MMMM yyyy', { locale: ru })}
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
      </div>
    </div>
  );
}
