import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, AlertCircle, Droplets, ArrowDown, ArrowUp, Upload } from 'lucide-react';
import { useWaterLevelStore } from '../store/waterLevelStore';
import { parseExcelData } from '../utils/excelParser';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAppStore } from '../store/appStore';
import { SETTLEMENTS } from '../utils/riverData';

export default function DatabaseViewer({ isOpen, onClose, isPage = false }: { isOpen: boolean, onClose: () => void, isPage?: boolean }) {
  const { stations } = useWaterLevelStore();
  const { setSelectedSettlement } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'diff' | 'level'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [activeTab, setActiveTab] = useState<'levels' | 'docs'>('levels');
  const [selectedDbYear, setSelectedDbYear] = useState<number>(new Date().getFullYear());
  const [docsList, setDocsList] = useState<{name: string, url: string, year: number}[]>([]);

  React.useEffect(() => {
    fetch('/docs_list.json').then(r => r.json()).then(setDocsList).catch(() => {});
  }, []);

  if (!isOpen && !isPage) return null;

  // Get current levels
  const dateStr = new Date().toISOString().substring(0, 10);
  
  const mappedStations = stations.map(stn => {
    // Find latest available level if today's is missing
    const levelsArr = Object.entries(stn.levels).sort((a,b) => b[0].localeCompare(a[0]));
    const latestLevel = levelsArr.length > 0 ? levelsArr[0][1] : null;
    const diffToCrit = stn.criticalLevel && latestLevel !== null ? stn.criticalLevel - latestLevel : null;
    
    return {
      ...stn,
      latestLevel,
      diffToCrit
    };
  });

  const filtered = mappedStations.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.river.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let result = 0;
    if (sortField === 'name') result = a.name.localeCompare(b.name);
    else if (sortField === 'level') result = (a.latestLevel || 0) - (b.latestLevel || 0);
    else if (sortField === 'diff') {
      const diffA = a.diffToCrit === null ? 9999 : a.diffToCrit;
      const diffB = b.diffToCrit === null ? 9999 : b.diffToCrit;
      result = diffA - diffB;
    }
    return sortAsc ? result : -result;
  });

  const getStatusColor = (diff: number | null) => {
    if (diff === null) return 'bg-slate-100 text-slate-500';
    if (diff < 0) return 'bg-red-100 text-red-700 font-bold border-red-200';
    if (diff < 100) return 'bg-orange-100 text-orange-700 font-bold border-orange-200';
    if (diff < 300) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  const handleRowClick = (stn: any) => {
    if (isPage) return; // Don't redirect back to map if we are on the dedicated page
    const existingSettlement = SETTLEMENTS.find(s => s.name === stn.name) || {
      id: stn.id, name: stn.name, coords: stn.coords || [129.7, 62.0]
    };
    setSelectedSettlement(existingSettlement);
    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const newStations = await parseExcelData(buffer, selectedDbYear);
      if (newStations.length > 0) {
        useWaterLevelStore.getState().setStations(newStations);
        alert(`Успешно загружено ${newStations.length} гидропостов.`);
      }
    } catch(err) {
      console.error(err);
      alert("Ошибка при чтении Excel файла");
    } finally {
      e.target.value = ''; // reset
    }
  };

  // Extract dates ONLY for selected year
  const allDates = React.useMemo(() => {
    const dates = new Set<string>();
    stations.forEach(stn => Object.keys(stn.levels).forEach(d => {
      if (d.startsWith(selectedDbYear.toString())) dates.add(d);
    }));
    return Array.from(dates).sort();
  }, [stations, selectedDbYear]);

  const content = (
    <>
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50/80 backdrop-blur shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-md">
            <DatabaseIcon />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">База данных гидропостов</h2>
            <div className="flex space-x-2 mt-1">
              <button onClick={() => setActiveTab('levels')} className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${activeTab === 'levels' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}>Уровни воды</button>
              <button onClick={() => setActiveTab('docs')} className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${activeTab === 'docs' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}>Сводки (Пояснилки)</button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Year selector integrated directly */}
          <select 
             value={selectedDbYear} 
             onChange={(e) => setSelectedDbYear(Number(e.target.value))}
             className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 font-medium hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm transition-all"
          >
             <option value={2026}>2026 год</option>
             <option value={2025}>2025 год</option>
          </select>

          <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors shadow-sm">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Импорт Excel</span>
            <input type="file" accept=".xls,.xlsx" className="hidden" title="Drop file here" onChange={handleFileUpload}/>
          </label>

          {!isPage && (
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {activeTab === 'levels' && (
      <>
      <div className="p-3 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-3 shrink-0">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Поиск по гидропосту или реке..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
        </div>
        <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 p-1 flex-wrap gap-1">
          <button 
            onClick={() => { setSortField('name'); setSortAsc(!sortAsc); }}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${sortField === 'name' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Название {sortField === 'name' && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
          <button 
            onClick={() => { setSortField('level'); setSortAsc(!sortAsc); }}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${sortField === 'level' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Уровень {sortField === 'level' && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
          <button 
            onClick={() => { setSortField('diff'); setSortAsc(!sortAsc); }}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${sortField === 'diff' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Опасность {sortField === 'diff' && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-slate-50/50 p-2 sm:p-4 flex flex-col min-h-0">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto w-full h-full relative isolate">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 font-semibold sticky left-0 z-20 bg-slate-50 border-r border-slate-200 min-w-[200px]">Гидропост</th>
                <th className="py-3 px-4 font-semibold sticky left-[200px] z-20 bg-slate-50 border-r border-slate-200 min-w-[120px]">Река</th>
                {isPage ? (
                  allDates.map(date => (
                    <th key={date} className="py-3 px-3 font-semibold text-center border-r border-slate-100 last:border-0 min-w-[80px]">
                      {format(new Date(date), 'd MMM', { locale: ru })}
                    </th>
                  ))
                ) : (
                  <>
                    <th className="py-3 px-4 font-semibold text-right">Текущий уровень</th>
                    <th className="py-3 px-4 font-semibold text-right">Критический</th>
                    <th className="py-3 px-4 font-semibold text-right">Статус</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map(stn => (
                <tr 
                  key={stn.id} 
                  onClick={() => handleRowClick(stn)}
                  className="hover:bg-blue-50/50 cursor-pointer group transition-colors"
                >
                  <td className="py-3 px-4 sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 border-r border-slate-200">
                    <div className="font-bold text-slate-800 transition-colors">{stn.name}</div>
                    <div className="text-[10px] text-slate-400">Индекс: {stn.index || 'Н/Д'} <span className="ml-2 text-red-500 bg-red-50 px-1 rounded">{stn.criticalLevel ? `Крит: ${stn.criticalLevel}` : ''}</span></div>
                  </td>
                  <td className="py-3 px-4 sticky left-[200px] z-10 bg-white group-hover:bg-blue-50/50 border-r border-slate-200">
                    <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs font-semibold">{stn.river}</span>
                  </td>
                  
                  {isPage ? (
                    allDates.map(date => {
                       const v = stn.levels[date];
                       const isDanger = stn.criticalLevel && v && v >= stn.criticalLevel;
                       return (
                         <td key={date} className={`py-3 px-3 text-center border-r border-slate-100 last:border-0 ${isDanger ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-600'}`}>
                           {v !== undefined ? v : <span className="text-slate-300">-</span>}
                         </td>
                       );
                    })
                  ) : (
                    <>
                      <td className="py-3 px-4 text-right">
                        <span className="font-bold text-slate-700 text-base">{stn.latestLevel !== null ? stn.latestLevel : '?'}</span>
                        <span className="text-xs text-slate-400 ml-1">см</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-semibold text-slate-500">{stn.criticalLevel !== null ? stn.criticalLevel : '—'}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${getStatusColor(stn.diffToCrit)}`}>
                          {stn.diffToCrit !== null && stn.diffToCrit < 0 && <AlertCircle className="w-3.5 h-3.5" />}
                          {stn.diffToCrit !== null ? 
                            (stn.diffToCrit < 0 ? `Превышен на ${Math.abs(stn.diffToCrit)} см` : `До выхода ${stn.diffToCrit} см`) 
                            : 'Нет данных'}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={isPage ? allDates.length + 2 : 5} className="py-12 text-center text-slate-500">
                    <Droplets className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    Ничего не найдено по запросу "{searchQuery}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeTab === 'docs' && (
        <div className="flex-1 overflow-auto bg-slate-50/50 p-4 flex flex-col gap-3">
           <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-sm text-slate-700">
             <h3 className="font-bold text-lg mb-4 text-slate-800 flex items-center gap-2"><svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Пояснительные записки ({selectedDbYear})</h3>
             {docsList.filter(d => d.year === selectedDbYear).length === 0 ? (
               <div className="text-slate-500 text-center py-8">Документы не найдены</div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                 {docsList.filter(d => d.year === selectedDbYear).map((doc, idx) => (
                   <a key={idx} href={doc.url} download={doc.name + '.docx'} className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all bg-slate-50/50 hover:bg-white group">
                     <div className="flex-shrink-0 mt-1"><svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg></div>
                     <div className="flex-1 min-w-0">
                       <div className="text-sm font-semibold text-slate-800 break-words leading-tight flex flex-col">{doc.name}</div>
                     </div>
                   </a>
                 ))}
               </div>
             )}
           </div>
        </div>
      )}
    </>
  );

  if (isPage) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-8 pointer-events-none">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col relative z-10 pointer-events-auto h-full max-h-[85vh]"
          >
            {content}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function DatabaseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 5.5C21 7.433 16.9706 9 12 9C7.02944 9 3 7.433 3 5.5C3 3.567 7.02944 2 12 2C16.9706 2 21 3.567 21 5.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 12C21 13.933 16.9706 15.5 12 15.5C7.02944 15.5 3 13.933 3 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 18.5C21 20.433 16.9706 22 12 22C7.02944 22 3 20.433 3 18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 5.5V18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 5.5V18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
