import * as XLSX from 'xlsx';

/**
 * Generate and download a sample Excel template for ice observation data.
 * Columns: Date, Location, UpperLng, UpperLat, LowerLng, LowerLat, Notes
 */
export function downloadIceObservationTemplate() {
  const headers = ['Date', 'Location', 'UpperLng', 'UpperLat', 'LowerLng', 'LowerLat', 'Notes'];
  
  const sampleData = [
    {
      Date: '2026-05-10',
      Location: 'Покровск - Якутск',
      UpperLng: 129.13,
      UpperLat: 61.48,
      LowerLng: 129.73,
      LowerLat: 62.03,
      Notes: 'Густой ледоход'
    },
    {
      Date: '2026-05-11',
      Location: 'Якутск - Кангалассы',
      UpperLng: 129.73,
      UpperLat: 62.03,
      LowerLng: 129.98,
      LowerLat: 62.33,
      Notes: 'Редкий ледоход'
    },
    {
      Date: '2026-05-12',
      Location: 'Кангалассы - Намцы',
      UpperLng: 129.98,
      UpperLat: 62.33,
      LowerLng: 129.70,
      LowerLat: 62.70,
      Notes: 'Чистая вода'
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });

  // Set column widths for readability
  ws['!cols'] = [
    { wch: 14 },  // Date
    { wch: 25 },  // Location
    { wch: 12 },  // UpperLng
    { wch: 12 },  // UpperLat
    { wch: 12 },  // LowerLng
    { wch: 12 },  // LowerLat
    { wch: 25 },  // Notes
  ];

  // Add instruction sheet
  const instrData = [
    ['Инструкция по заполнению шаблона «Ледоход»'],
    [''],
    ['Поле', 'Описание', 'Формат', 'Пример'],
    ['Date', 'Дата наблюдения', 'ГГГГ-ММ-ДД', '2026-05-10'],
    ['Location', 'Участок (верхний – нижний пункт)', 'Текст', 'Покровск - Якутск'],
    ['UpperLng', 'Долгота верхней кромки ледохода', 'Число (десятичные градусы)', '129.13'],
    ['UpperLat', 'Широта верхней кромки ледохода', 'Число (десятичные градусы)', '61.48'],
    ['LowerLng', 'Долгота нижней кромки ледохода', 'Число (десятичные градусы)', '129.73'],
    ['LowerLat', 'Широта нижней кромки ледохода', 'Число (десятичные градусы)', '62.03'],
    ['Notes', 'Примечания (тип явления)', 'Текст (необязат.)', 'Густой ледоход'],
    [''],
    ['Возможные значения поля Notes:'],
    ['  • Густой ледоход'],
    ['  • Редкий ледоход'],
    ['  • Подвижки'],
    ['  • Закраины / Разводья'],
    ['  • Чистая вода'],
    ['  • Вода на льду'],
    ['  • Ледостав'],
    ['  • Навалы льда'],
    [''],
    ['Координаты можно указать вручную или скопировать из карты.'],
    ['Верхняя кромка (UpperLng/UpperLat) — это край свободной воды (голова ледохода).'],
    ['Нижняя кромка (LowerLng/LowerLat) — граница ледяного покрова.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr['!cols'] = [{ wch: 18 }, { wch: 40 }, { wch: 30 }, { wch: 25 }];

  XLSX.utils.book_append_sheet(wb, wsInstr, 'Инструкция');
  XLSX.utils.book_append_sheet(wb, ws, 'Данные ледохода');

  XLSX.writeFile(wb, 'Шаблон_ледоход.xlsx');
}

/**
 * Generate and download a sample Excel template for water level data.
 * Mimics the structure expected by the DatabaseViewer parser.
 */
export function downloadWaterLevelTemplate() {
  const wb = XLSX.utils.book_new();

  // --- Main data sheet ---
  // Row 0: header title
  // Row 1: headers (columns A-K are meta, then L+ are dates)
  // Row 2+: data rows

  const today = new Date();
  const year = today.getFullYear();
  
  // Generate 10 sample dates across current month
  const sampleDates: string[] = [];
  for (let d = 1; d <= 10; d++) {
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(d).padStart(2, '0');
    sampleDates.push(`${day}.${m}`);
  }

  const headerRow1 = [
    'Сводка об уровнях воды (в сантиметрах) на гидрологических постах (пример)'
  ];

  const headerRow2 = [
    '№ п/п',     // col 0 (A)
    'Река',       // col 1 (B)
    'Пункт',      // col 2 (C)
    '',           // col 3 (D)
    '',           // col 4 (E)
    '',           // col 5 (F)
    'Крит. уровень', // col 6 (G)
    '',           // col 7 (H)
    '',           // col 8 (I)
    '',           // col 9 (J)
    '',           // col 10 (K)
    ...sampleDates   // col 11+ (L+)
  ];

  const sampleRows = [
    [1, 'Лена', 'Усть-Кут',     '', '', '', 1025, '', '', '', '', 320, 335, 350, 365, 380, 400, 420, 440, 460, 480],
    [2, 'Лена', 'Киренск',      '', '', '', 900,  '', '', '', '', 280, 290, 305, 320, 335, 350, 365, 380, 395, 410],
    [3, 'Лена', 'Ленск',        '', '', '', 1195, '', '', '', '', 510, 525, 540, 560, 580, 610, 640, 670, 700, 730],
    [4, 'Лена', 'Олёкминск',    '', '', '', 930,  '', '', '', '', 400, 410, 425, 440, 455, 470, 485, 500, 515, 530],
    [5, 'Лена', 'Покровск',     '', '', '', 835,  '', '', '', '', 350, 360, 375, 390, 405, 420, 435, 450, 465, 480],
    [6, 'Лена', 'Якутск',       '', '', '', 790,  '', '', '', '', 380, 395, 410, 425, 440, 455, 470, 485, 500, 515],
    [7, 'Лена', 'Сангар',       '', '', '', 1213, '', '', '', '', 430, 445, 460, 475, 490, 505, 520, 540, 560, 580],
    [8, 'Лена', 'Жиганск',      '', '', '', 1340, '', '', '', '', 250, 260, 275, 290, 310, 330, 350, 370, 390, 410],
  ];

  const sheetData = [headerRow1, headerRow2, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set col widths
  ws['!cols'] = [
    { wch: 8 },   // № п/п
    { wch: 10 },  // Река
    { wch: 16 },  // Пункт
    { wch: 6 }, { wch: 6 }, { wch: 6 },
    { wch: 14 },  // Крит. уровень
    { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
    ...sampleDates.map(() => ({ wch: 8 })),
  ];

  // --- Instruction sheet ---
  const instrData = [
    ['Инструкция по заполнению шаблона «Уровни воды»'],
    [''],
    ['Структура файла:'],
    ['  • Строка 1 — заголовок (необязательно)'],
    ['  • Строка 2 — шапка таблицы с названиями столбцов'],
    ['  • Строки 3+ — данные по каждому гидропосту'],
    [''],
    ['Важные столбцы:'],
    ['Столбец', 'Описание', 'Пример'],
    ['A (№ п/п)', 'Порядковый номер гидропоста', '1'],
    ['B (Река)', 'Название реки', 'Лена'],
    ['C (Пункт)', 'Название гидропоста (населенного пункта)', 'Якутск'],
    ['G (Крит. уровень)', 'Критический уровень воды в см', '790'],
    ['L+ (Даты)', 'Уровни воды в формате ДД.ММ (каждая дата — отдельный столбец)', '01.05 → значение 380'],
    [''],
    ['ВАЖНО:'],
    ['  • Даты в строке 2 начинаются с столбца L (12-й столбец).'],
    ['  • Формат дат: ДД.ММ (например 01.05, 15.06) или числовой формат Excel.'],
    ['  • Значения уровней — целые числа в сантиметрах.'],
    ['  • Критический уровень (столбец G) — должен быть числом.'],
    ['  • Название пункта (столбец C) должно совпадать с известными постами'],
    ['    для корректного отображения на карте.'],
    [''],
    ['Известные гидропосты (автоматически привязываются к координатам):'],
    ['  Усть-Кут, Киренск, Витим, Пеледуй, Крестовский, Ленск, Нюя,'],
    ['  Мача, Олёкминск, Саныяхтат, Синск, Покровск, Табага, Якутск,'],
    ['  Кангалассы, Намцы, Сангар, Жиганск, Джарджан, Кюсюр, Тикси'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr['!cols'] = [{ wch: 22 }, { wch: 50 }, { wch: 25 }];

  XLSX.utils.book_append_sheet(wb, wsInstr, 'Инструкция');
  XLSX.utils.book_append_sheet(wb, ws, 'Уровни воды');

  XLSX.writeFile(wb, 'Шаблон_уровни_воды.xlsx');
}
