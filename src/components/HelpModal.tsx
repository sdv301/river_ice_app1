import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Map as MapIcon, Database, Calendar, Upload, ShieldAlert, MousePointer2, Info } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const steps = [
    {
      icon: <MapIcon className="w-5 h-5 text-blue-600" />,
      title: "Интерактивная карта",
      text: "Перемещайтесь по карте Якутии. Используйте переключатель в углу для выбора спутниковых снимков или речных бассейнов."
    },
    {
      icon: <Calendar className="w-5 h-5 text-indigo-600" />,
      title: "Выбор года",
      text: "Переключайтесь между текущим 2026 годом и архивом 2025 года в верхней части панели для анализа динамики."
    },
    {
      icon: <Database className="w-5 h-5 text-emerald-600" />,
      title: "База данных",
      text: "Кнопка 'База данных' открывает полный список гидропостов с графиками уровней воды и документами."
    },
    {
      icon: <Upload className="w-5 h-5 text-orange-600" />,
      title: "Импорт данных",
      text: "В режиме администратора можно загружать Excel-файлы. Используйте кнопки 'Шаблон', чтобы скачать пример правильного заполнения."
    },
    {
      icon: <ShieldAlert className="w-5 h-5 text-red-600" />,
      title: "Заторы и опасности",
      text: "Красные маркеры на карте указывают на заторы. Гидропосты подсвечиваются красным при достижении критических уровней."
    }
  ];

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 30 }}
          className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-white/20"
        >
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-4">
              <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-200">
                <MousePointer2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Инструкция</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Как пользоваться картой мониторинга</p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full text-slate-400 transition-all active:scale-90">
              <X className="w-8 h-8" />
            </button>
          </div>

          <div className="p-8 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-5 p-6 rounded-3xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all duration-300">
                  <div className="shrink-0">
                    <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-50 text-blue-600 group-hover:scale-110 transition-transform">
                      {step.icon}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg mb-2">{step.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed font-medium">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-6 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[2rem] text-white shadow-xl shadow-blue-100">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-2 rounded-full">
                  <Info className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-bold leading-relaxed">
                  Кликните по любому населенному пункту на карте, чтобы открыть детальную статистику по уровню воды и маршруту ледохода.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button
              onClick={onClose}
              className="px-10 py-4 bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-700 transition-all shadow-xl shadow-slate-200 active:scale-95 text-lg"
            >
              Понятно
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
