import React, { Suspense, lazy, useEffect, useState } from 'react';
import { X, Info, Droplets, TrendingUp, TrendingDown, Minus, MapPin, Activity, Video, ExternalLink, Radio } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useIceStore } from '../store/iceStore';
import { useWaterLevelStore } from '../store/waterLevelStore';
import UITooltip from './Tooltip';

export { CAMERA_MAP } from '../config/cameraMap';
import { CAMERA_MAP } from '../config/cameraMap';

const SECTION_LABELS: Record<string, string> = {
  lena: 'р. Лена',
  aldan: 'р. Алдан',
  indi: 'р. Индигирка',
  kolyma: 'р. Колыма',
  main: 'Онлайн-трансляция',
};

const SECTION_COLORS: Record<string, string> = {
  lena:   'from-blue-600 to-blue-700',
  aldan:  'from-teal-600 to-teal-700',
  indi:   'from-violet-600 to-violet-700',
  kolyma: 'from-cyan-600 to-cyan-700',
  main:   'from-slate-600 to-slate-700',
};

const WaterLevelChart = lazy(() => import('./WaterLevelChart'));


interface Props {
  settlement: any;
  onClose: () => void;
  currentDate: string;
}

export default function SettlementInfoPanel({ settlement, onClose, currentDate }: Props) {
  const { getSectionSpeeds } = useIceStore();
  const { getStationHistory, getStation } = useWaterLevelStore();
  const sectionSpeeds = getSectionSpeeds();
  const [showFrame, setShowFrame] = useState(false);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => setChartReady(true));
    return () => {
      cancelAnimationFrame(rafId);
      setChartReady(false);
    };
  }, [settlement.name]);

  const camera = CAMERA_MAP[settlement.name] ?? null;
  const [activeCamIdx, setActiveCamIdx] = useState(0);
  const activeCam = camera?.items[activeCamIdx] ?? (camera?.items[0]);

  const ysiaUrl = `https://ysia.ru/ice-drift-live/${
    camera ? `#${camera.section}` : ''
  }`;

  const history = getStationHistory(settlement.name, currentDate, 10);
  const stnMeta = getStation(settlement.name);
  
  const chartData = history.map(h => ({
     name: format(new Date(h.date), 'dd.MM'),
     level: h.level
  }));

  const currentLevel = history.length > 0 ? history[history.length - 1].level : 0;
  const prevLevel = history.length > 1 ? history[history.length - 2].level : currentLevel;
  const diff = currentLevel - prevLevel;

  // См до критической отметки (оценка риска):
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
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
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

      {/* Онлайн-камера блок */}
      <div className={`px-6 pt-5 pb-2 border-b border-slate-100 bg-gradient-to-r ${
        camera ? SECTION_COLORS[camera.section] : 'from-slate-700 to-slate-800'
      } text-white`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {camera ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500 rounded-full text-xs font-black uppercase tracking-wide animate-pulse">
                  <Radio className="w-3 h-3" />
                  LIVE
                </span>
                {camera.items.length > 1 && (
                  <div className="flex bg-white/10 rounded-lg p-0.5 border border-white/20">
                    {camera.items.map((it, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setActiveCamIdx(idx); setShowFrame(true); }}
                        className={`px-2 py-1 rounded-md text-[10px] font-black transition-all ${
                          activeCamIdx === idx && showFrame ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        {it.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Video className="w-5 h-5 opacity-60" />
            )}
            <div>
              <div className="font-black text-base leading-tight">
                {camera ? `Онлайн-камера — ${activeCam?.label ?? settlement.name}` : 'Онлайн-трансляция ледохода'}
              </div>
              {camera && (
                <div className="text-xs opacity-70 font-bold mt-0.5">
                  {SECTION_LABELS[camera.section]} — Мониторинг АрктикТелеком
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {camera && activeCam?.embedUrl && (
              <button
                onClick={() => setShowFrame(f => !f)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all border ${
                  showFrame
                    ? 'bg-white text-slate-800 border-white/80 shadow-inner'
                    : 'bg-white/20 hover:bg-white/30 border-white/30 text-white'
                }`}
              >
                <Video className="w-4 h-4" />
                {showFrame ? 'Скрыть плеер' : 'Смотреть здесь'}
              </button>
            )}
            <a
              href={ysiaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black bg-white/20 hover:bg-white/30 border border-white/30 text-white transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              ЯСИА
            </a>
            {activeCam?.embedUrl && (
              <a
                href={activeCam.pageUrl ?? activeCam.embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black bg-red-500 hover:bg-red-400 border border-red-400 text-white transition-all shadow-lg"
              >
                <Radio className="w-4 h-4" />
                Прямой эфир
              </a>
            )}
          </div>
        </div>

        {activeCam?.ysiaOnly && (
          <p className="mt-3 mb-1 text-xs text-white/80 font-medium px-1">
            Прямая камера АрктикТелеком для этого пункта недоступна — смотрите трансляцию на ЯСИА.
          </p>
        )}

        {/* Inline iframe viewer */}
        {showFrame && camera && activeCam?.embedUrl && (
          <div className="mt-4 mb-1 rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-black relative">
            <div className="absolute top-2 right-2 z-10 flex gap-2">
               <div className="bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white uppercase tracking-widest border border-white/10">
                 {activeCam.label}
               </div>
               <button
                 onClick={() => setShowFrame(false)}
                 className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition"
               >
                 <X className="w-4 h-4" />
               </button>
            </div>
            <iframe
              key={activeCam.embedUrl}
              src={activeCam.embedUrl}
              title={`Онлайн-камера: ${settlement.name} - ${activeCam.label}`}
              className="w-full"
              style={{ height: 400, border: 'none' }}
              allow="autoplay; encrypted-media"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
            <div className="px-4 py-2 bg-black/80 text-white/60 text-xs font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-3 h-3" />
                Трансляция предоставлена АО «АрктикТелеком»
              </div>
              <a href={activeCam.pageUrl ?? activeCam.embedUrl} target="_blank" rel="noopener noreferrer" className="underline text-white/80 hover:text-white">
                Открыть на сайте источника &rarr;
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8 min-w-0">
          
          {/* Left Column: Stats */}
          <div className="space-y-8 min-w-0">
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
          <div className="space-y-8 min-w-0">
            <section>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" /> График уровней (10 дней)
              </h3>
              <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-inner bg-slate-50/10 w-full min-w-0">
                {chartReady ? (
                  <Suspense
                    fallback={
                      <div
                        className="flex items-center justify-center text-sm font-medium text-slate-400"
                        style={{ height: 240 }}
                      >
                        Загрузка графика…
                      </div>
                    }
                  >
                    <WaterLevelChart data={chartData} />
                  </Suspense>
                ) : (
                  <div style={{ height: 240 }} aria-hidden />
                )}
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
