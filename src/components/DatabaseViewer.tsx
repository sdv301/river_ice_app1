import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, AlertCircle, Droplets, ArrowDown, ArrowUp, Upload, Download, Cloud, Loader2, RefreshCw, CheckCircle2, FileDown, ExternalLink } from 'lucide-react';
import { useWaterLevelStore } from '../store/waterLevelStore';
import { parseExcelData } from '../utils/excelParser';
import { downloadWaterLevelTemplate } from '../utils/excelTemplates';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAppStore } from '../store/appStore';
import { SETTLEMENTS } from '../utils/riverData';
import { publicAssetUrl } from '../config/runtimeConfig';
import Tooltip from './Tooltip';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export default function DatabaseViewer({ isOpen, onClose, isPage = false }: { isOpen: boolean, onClose: () => void, isPage?: boolean }) {
  const { stations, isSyncing, lastSyncTime, syncError, fetchFromYandexDisk } = useWaterLevelStore();
  const { setSelectedSettlement } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'diff' | 'level'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [activeTab, setActiveTab] = useState<'levels' | 'docs'>('levels');
  const [selectedDbYear, setSelectedDbYear] = useState<number>(new Date().getFullYear());
  const [docsList, setDocsList] = useState<{name: string, url: string, year: number}[]>([]);
  const [syncBanner, setSyncBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [onlyProblematic, setOnlyProblematic] = useState(false);

  const handleSyncFromYandex = async () => {
    setSyncBanner(null);
    const result = await fetchFromYandexDisk({ year: selectedDbYear });
    if (result.errors.length > 0 && result.fileCount === 0) {
      setSyncBanner({ kind: 'error', text: result.errors.join('; ') });
    } else if (result.fileCount === 0) {
      setSyncBanner({ kind: 'error', text: `На Яндекс.Диске нет файлов с уровнями воды за ${selectedDbYear} год.` });
    } else {
      setSyncBanner({
        kind: 'success',
        text: `Синхронизировано ${result.fileCount} файл(ов), новых записей: ${result.newDateCount}.`,
      });
    }
    window.setTimeout(() => setSyncBanner(null), 6000);
  };

  React.useEffect(() => {
    fetch(publicAssetUrl('docs_list.json')).then(r => r.json()).then(setDocsList).catch(() => {});
  }, []);

  if (!isOpen && !isPage) return null;

  const selectedYearPrefix = `${selectedDbYear}-`;
  const yearDates = React.useMemo(() => {
    const dates = new Set<string>();
    stations.forEach(stn => Object.keys(stn.levels).forEach(d => {
      if (d.startsWith(selectedYearPrefix)) dates.add(d);
    }));
    return Array.from(dates).sort();
  }, [stations, selectedYearPrefix]);

  React.useEffect(() => {
    if (yearDates.length === 0) {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const minDate = yearDates[0];
    const maxDate = yearDates[yearDates.length - 1];
    setDateFrom((prev) => (prev && prev >= minDate && prev <= maxDate ? prev : minDate));
    setDateTo((prev) => (prev && prev >= minDate && prev <= maxDate ? prev : maxDate));
  }, [yearDates]);

  const visibleDates = React.useMemo(() => {
    if (yearDates.length === 0) return [];
    if (!dateFrom && !dateTo) return yearDates;
    const from = dateFrom || yearDates[0];
    const to = dateTo || yearDates[yearDates.length - 1];
    return yearDates.filter((d) => d >= from && d <= to);
  }, [yearDates, dateFrom, dateTo]);

  const mappedStations = stations.map(stn => {
    const levelsArr = visibleDates
      .map((date) => [date, stn.levels[date]] as const)
      .filter(([, level]) => level !== undefined)
      .sort((a, b) => b[0].localeCompare(a[0]));
    const latestLevel = levelsArr.length > 0 ? levelsArr[0][1] : null;
    const diffToCrit = stn.criticalLevel && latestLevel !== null ? stn.criticalLevel - latestLevel : null;

    return {
      ...stn,
      hasSelectedYearData: levelsArr.length > 0,
      latestLevel,
      diffToCrit
    };
  });

  const filtered = mappedStations
    .filter(s => s.hasSelectedYearData)
    .filter(s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.river.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((s) => (onlyProblematic ? s.diffToCrit !== null && s.diffToCrit <= 500 : true));

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

  // Cm remaining to the critical level:
  //   ≤ 0   → red (exceeded)
  //   ≤ 250 → red (danger)
  //   ≤ 500 → yellow (warning)
  //   > 500 → green (normal)
  const getStatusColor = (stn: any) => {
    if (stn.latestLevel === null || stn.criticalLevel === null) return 'bg-slate-100 text-slate-500';
    const ratio = stn.latestLevel / stn.criticalLevel;
    if (ratio >= 0.7) return 'bg-red-100 text-red-700 font-bold border-red-200';
    if (ratio >= 0.5) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  const handleRowClick = (stn: any) => {
    if (isPage) {
      const params = new URLSearchParams();
      params.set('settlement', stn.name);
      params.set('year', String(selectedDbYear));
      window.location.href = `/?${params.toString()}`;
      return;
    }
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
        // Merge the new stations into the existing dataset so historical
        // levels (e.g. previous year) are preserved. The merge also persists
        // the upload to localStorage so it survives a page reload.
        useWaterLevelStore.getState().mergeStations(newStations);
        const newDates = new Set<string>();
        newStations.forEach(s => Object.keys(s.levels).forEach(d => newDates.add(d)));
        alert(`Успешно загружено ${newStations.length} гидропостов за ${selectedDbYear} год (${newDates.size} дат).`);
      } else {
        alert('В файле не найдено корректных данных. Проверьте структуру шаблона.');
      }
    } catch(err) {
      console.error(err);
      alert("Ошибка при чтении Excel файла");
    } finally {
      e.target.value = ''; // reset
    }
  };

  const exportReportExcel = () => {
    if (sorted.length === 0) {
      alert('Нет данных для экспорта по текущим фильтрам.');
      return;
    }
    const rows = sorted.map((stn) => {
      const row: Record<string, string | number> = {
        'Гидропост': stn.name,
        'Река': stn.river,
        'Критический уровень, см': stn.criticalLevel ?? '',
        'Текущий уровень, см': stn.latestLevel ?? '',
        'До критического, см': stn.diffToCrit ?? '',
      };
      allDates.forEach((d) => {
        const headerName = d.length > 10 ? format(new Date(d), 'dd.MM.yyyy HH:mm') : format(new Date(d), 'dd.MM.yyyy');
        row[headerName] = stn.levels[d] ?? '';
      });
      return row;
    });

    const reportDate = dateTo || allDates[allDates.length - 1] || `${selectedDbYear}-01-01`;
    const reportDateObj = new Date(`${reportDate}T00:00:00`);
    const dateLabel = format(reportDateObj, 'dd.MM.yy', { locale: ru });
    const baseName = `Пояснительная записка Для НАС на 07.00(мск) ${dateLabel}`;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Отчет_${selectedDbYear}`);
    XLSX.writeFile(wb, `${baseName}.xlsx`);
  };

  const exportReportPdf = async () => {
    if (sorted.length === 0) {
      alert('Нет данных для экспорта по текущим фильтрам.');
      return;
    }
    const esc = (v: unknown) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const from = dateFrom || `${selectedDbYear}-01-01`;
    const to = dateTo || `${selectedDbYear}-12-31`;
    const reportDate = dateTo || allDates[allDates.length - 1] || `${selectedDbYear}-01-01`;
    const reportDateObj = new Date(`${reportDate}T00:00:00`);
    const dateLabel = format(reportDateObj, 'dd.MM.yy', { locale: ru });
    const baseName = `Пояснительная записка Для НАС на 07.00(мск) ${dateLabel}`;
    const withCritical = sorted.filter((s) => s.criticalLevel !== null && s.latestLevel !== null);
    const danger = withCritical.filter((s) => s.latestLevel !== null && s.criticalLevel !== null && (s.latestLevel / s.criticalLevel) >= 0.7);
    const warning = withCritical.filter((s) => {
      if (s.latestLevel === null || s.criticalLevel === null) return false;
      const ratio = s.latestLevel / s.criticalLevel;
      return ratio >= 0.5 && ratio < 0.7;
    });
    const normal = withCritical.filter((s) => s.latestLevel !== null && s.criticalLevel !== null && (s.latestLevel / s.criticalLevel) < 0.5);
    const exceeded = withCritical.filter((s) => s.latestLevel !== null && s.criticalLevel !== null && s.latestLevel >= s.criticalLevel);
    const noCritical = sorted.filter((s) => s.criticalLevel === null);

    const topRisk = [...withCritical]
      .filter((s) => s.diffToCrit !== null)
      .sort((a, b) => (a.diffToCrit as number) - (b.diffToCrit as number))
      .slice(0, 7);

    const topRiskLines = topRisk.length > 0
      ? topRisk.map((s, idx) => {
          const diff = s.diffToCrit as number;
          const state = diff < 0
            ? `превышение на ${Math.abs(diff)} см`
            : `до критического уровня ${diff} см`;
          return `<li>${idx + 1}. ${esc(s.river)} — ${esc(s.name)}: уровень ${esc(s.latestLevel)} см, ${state} (критический ${esc(s.criticalLevel)} см).</li>`;
        }).join('')
      : '<li>На выбранный период данные по постам с критическими отметками отсутствуют.</li>';

    const trendLines = sorted.slice(0, 5).map((s) => {
      if (allDates.length < 2) return null;
      const lastDate = allDates[allDates.length - 1];
      const prevDate = allDates[allDates.length - 2];
      const cur = s.levels[lastDate];
      const prev = s.levels[prevDate];
      if (cur === undefined || prev === undefined) return null;
      const delta = cur - prev;
      const trend = delta > 0 ? `рост на ${delta} см` : delta < 0 ? `снижение на ${Math.abs(delta)} см` : 'без изменений';
      return `<li>${esc(s.river)} — ${esc(s.name)}: ${trend} (за ${esc(prevDate)} → ${esc(lastDate)}).</li>`;
    }).filter(Boolean).join('');
    const reportHtml = `
      <div id="report-root" style="font-family:'Times New Roman',serif;padding:18px;color:#0f172a;background:white;line-height:1.35;width:794px;">
        <h1 style="margin:0 0 8px;font-size:20px;">${baseName}</h1>
        <p style="margin:0 0 12px;font-size:14px;color:#334155;">По состоянию на 07.00(мск) ${esc(dateLabel)}.</p>
        <p style="margin:0 0 10px;font-size:15px;">В период с <b>${esc(from)}</b> по <b>${esc(to)}</b> рассмотрены уровни воды по <b>${sorted.length}</b> гидропостам бассейна р. Лена.${onlyProblematic ? ' В отчете включены только посты с уровнем повышенного внимания (до критического ≤ 500 см).' : ''}</p>

        <div style="font-size:15px;font-weight:700;margin:14px 0 6px;text-transform:uppercase;">1. Оценка обстановки</div>
        <p style="margin:0 0 10px;font-size:15px;">По постам с установленной критической отметкой (${withCritical.length} постов): в зоне критической угрозы (до 250 см) — <b>${danger.length}</b>, в зоне повышенного внимания (251–500 см) — <b>${warning.length}</b>, в норме (>500 см) — <b>${normal.length}</b>. Фактов превышения критического уровня: <b>${exceeded.length}</b>.</p>
        <p style="margin:0 0 10px;font-size:15px;">Постов без установленной критической отметки: <b>${noCritical.length}</b>.</p>

        <div style="font-size:15px;font-weight:700;margin:14px 0 6px;text-transform:uppercase;">2. Наиболее напряженные участки</div>
        <ol style="margin:0 0 10px 22px;padding:0;font-size:15px;">${topRiskLines.replace(/<li>/g, '<li style="margin:0 0 6px;">')}</ol>

        <div style="font-size:15px;font-weight:700;margin:14px 0 6px;text-transform:uppercase;">3. Динамика за последние сутки</div>
        ${trendLines ? `<ul style="margin:0 0 10px 20px;padding:0;font-size:15px;">${trendLines.replace(/<li>/g, '<li style="margin:0 0 6px;">')}</ul>` : '<p style="margin:0 0 10px;font-size:15px;">Недостаточно данных для оценки суточной динамики в выбранном периоде.</p>'}

        <div style="font-size:15px;font-weight:700;margin:14px 0 6px;text-transform:uppercase;">4. Вывод</div>
        <p style="margin:0 0 10px;font-size:15px;">Гидрологическая обстановка по рассматриваемым постам находится под контролем дежурных служб. Рекомендуется продолжить мониторинг уровней воды и оперативно обновлять сведения при поступлении новых данных.</p>

        <p style="font-size:13px;color:#475569;margin-top:8px;">Примечание: текст сформирован автоматически на основе данных базы гидропостов за выбранный период.</p>
      </div>
    `;

    const temp = document.createElement('div');
    temp.style.position = 'fixed';
    temp.style.left = '-100000px';
    temp.style.top = '0';
    temp.style.width = '794px';
    temp.innerHTML = reportHtml;
    document.body.appendChild(temp);

    try {
      const canvas = await html2canvas(temp, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * usableWidth) / canvas.width;

      let rendered = 0;
      let pageIndex = 0;
      while (rendered < imgHeight - 0.1) {
        if (pageIndex > 0) pdf.addPage();
        const remaining = imgHeight - rendered;
        const drawHeight = Math.min(pageHeight - margin * 2, remaining);
        pdf.addImage(
          imgData,
          'PNG',
          margin,
          margin - rendered,
          usableWidth,
          imgHeight,
          undefined,
          'FAST',
        );
        rendered += drawHeight;
        pageIndex++;
      }

      pdf.save(`${baseName}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Не удалось сформировать PDF. Попробуйте снова.');
    } finally {
      document.body.removeChild(temp);
    }
  };

  const allDates = visibleDates;

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
          <Tooltip text="Выберите год для просмотра данных" position="bottom">
            <select 
               value={selectedDbYear} 
               onChange={(e) => setSelectedDbYear(Number(e.target.value))}
               className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 font-medium hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm transition-all"
            >
               <option value={2026}>2026 год</option>
               <option value={2025}>2025 год</option>
            </select>
          </Tooltip>

          <Tooltip
            text={`Подтянуть свежие уровни воды с Яндекс.Диска за ${selectedDbYear} год`}
            position="bottom"
          >
            <button
              onClick={handleSyncFromYandex}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-colors border ${
                isSyncing
                  ? 'bg-amber-100 border-amber-200 text-amber-700 cursor-wait'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{isSyncing ? 'Синхронизация...' : 'Я.Диск'}</span>
              <Cloud className="w-3 h-3 opacity-70" />
            </button>
          </Tooltip>

          <Tooltip text="Загрузить данные уровней воды из Excel-файла" position="bottom">
            <label className="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors shadow-sm">
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Импорт Excel</span>
              <input type="file" accept=".xls,.xlsx" className="hidden" title="Drop file here" onChange={handleFileUpload}/>
            </label>
          </Tooltip>

          <Tooltip text="Скачать Excel-шаблон с примером заполнения данных уровней воды" position="bottom">
            <button
              onClick={downloadWaterLevelTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Шаблон</span>
            </button>
          </Tooltip>

          <Tooltip text="Экспорт отчета в Excel по текущим фильтрам" position="bottom">
            <button
              onClick={exportReportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors shadow-sm"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </Tooltip>

          <Tooltip text="Печать/сохранение отчета в PDF" position="bottom">
            <button
              onClick={exportReportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold rounded-lg hover:bg-violet-100 transition-colors shadow-sm"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </Tooltip>

          {!isPage && (
            <Tooltip text="Закрыть окно базы данных" position="left">
              <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {(syncBanner || (lastSyncTime && !isSyncing)) && (
        <div
          className={`px-4 py-2 text-xs flex items-center gap-2 border-b ${
            syncBanner?.kind === 'error' || (!syncBanner && syncError)
              ? 'bg-red-50 border-red-100 text-red-700'
              : 'bg-emerald-50 border-emerald-100 text-emerald-700'
          }`}
        >
          {syncBanner?.kind === 'error' || (!syncBanner && syncError) ? (
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="font-semibold">
            {syncBanner
              ? syncBanner.text
              : syncError
                ? `Ошибка синхронизации: ${syncError}`
                : `База синхронизирована с Яндекс.Диском (${new Date(lastSyncTime!).toLocaleString('ru-RU')})`}
          </span>
        </div>
      )}

      {activeTab === 'levels' && (
      <>
      <div className="p-3 border-b border-slate-100 bg-white flex flex-col gap-3 shrink-0">
        <div className="flex flex-col sm:flex-row gap-3">
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
            <Tooltip text="Сортировать по названию гидропоста" position="bottom">
              <button
                onClick={() => { setSortField('name'); setSortAsc(!sortAsc); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${sortField === 'name' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                Название {sortField === 'name' && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
            </Tooltip>
            <Tooltip text="Сортировать по текущему уровню воды" position="bottom">
              <button
                onClick={() => { setSortField('level'); setSortAsc(!sortAsc); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${sortField === 'level' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                Уровень {sortField === 'level' && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
            </Tooltip>
            <Tooltip text="Сортировать по степени опасности (расстояние до критического уровня)" position="bottom">
              <button
                onClick={() => { setSortField('diff'); setSortAsc(!sortAsc); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${sortField === 'diff' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                Опасность {sortField === 'diff' && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-semibold">Период:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-md bg-white"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-md bg-white"
            />
            <button
              onClick={() => {
                if (yearDates.length === 0) return;
                setDateFrom(yearDates[Math.max(0, yearDates.length - 2)] || yearDates[0]);
                setDateTo(yearDates[yearDates.length - 1]);
              }}
              className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              2 дня
            </button>
            <button
              onClick={() => {
                if (yearDates.length === 0) return;
                setDateFrom(yearDates[0]);
                setDateTo(yearDates[yearDates.length - 1]);
              }}
              className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              Весь год
            </button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={onlyProblematic}
              onChange={(e) => setOnlyProblematic(e.target.checked)}
              className="rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            Только проблемные (до критического ≤ 500 см)
          </label>
          <div className="text-[11px] text-slate-500 md:ml-auto">
            Показано постов: <b>{sorted.length}</b>, дат: <b>{allDates.length}</b>
          </div>
        </div>
        {isPage && (
          <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2 py-1 inline-flex items-center gap-1 w-fit">
            <ExternalLink className="w-3 h-3" />
            Клик по строке открывает карту и центрирует выбранный населенный пункт.
          </div>
        )}
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
                      {format(new Date(date), date.length > 10 ? 'd MMM HH:mm' : 'd MMM', { locale: ru })}
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
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${getStatusColor(stn)}`}>
                          {stn.latestLevel !== null && stn.criticalLevel !== null && stn.latestLevel >= stn.criticalLevel && <AlertCircle className="w-3.5 h-3.5" />}
                          {stn.latestLevel !== null && stn.criticalLevel !== null ? 
                            (stn.latestLevel >= stn.criticalLevel ? `Превышен на ${stn.latestLevel - stn.criticalLevel} см` : `До выхода ${stn.criticalLevel - stn.latestLevel} см`) 
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
                   <Tooltip key={idx} text="Нажмите для скачивания пояснительной записки (.docx)" position="top" className="w-full">
                    <a href={doc.url} download={doc.name + '.docx'} className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all bg-slate-50/50 hover:bg-white group w-full">
                      <div className="flex-shrink-0 mt-1"><svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 break-words leading-tight flex flex-col">{doc.name}</div>
                      </div>
                    </a>
                   </Tooltip>
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
