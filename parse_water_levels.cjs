const XLSX = require('xlsx');
const fs = require('fs');

const files = ['Уровни воды в мае 2025.xls', 'Уровни воды в июне 2025.xls'];

// For stations that don't have explicit coords in riverData.ts, we'll try to guess
// or just leave them null
const knownCoords = {
  'Усть-Кут': [105.76, 56.80],
  'Киренск': [108.11, 57.77],
  'Витим': [112.584, 59.449],
  'Пеледуй': [112.761, 59.612],
  'Крестовский': [113.208, 59.744],
  'Ленск': [114.928, 60.709],
  'Нюя': [116.228, 60.527],
  'Мача': [117.632, 59.901],
  'Олёкминск': [120.42, 60.37],
  'Саныяхтат': [124.9, 60.85], 
  'Синск': [125.30, 61.10],
  'Покровск': [129.13, 61.48],
  'Табага': [129.58, 61.85],
  'Якутск': [129.73, 62.03],
  'Кангалассы': [129.98, 62.33],
  'Намцы': [129.70, 62.70],
  'Сангар': [127.47, 63.92],
  'Сангары': [127.47, 63.92],
  'Жиганск': [123.39, 66.76],
  'Джарджан': [124.22, 68.74],
  'Кюсюр': [127.87, 70.68],
  'Тикси': [128.86, 71.63],
  'Змеиново': [107.82, 57.73],
  'Дарьино': [108.40, 58.11],
  'Визирный': [109.18, 58.42],
  'Солянка': [120.65, 60.35],
  'Хатынг-Тумул': [121.25, 60.40],
  'Хабарова': [126.85, 72.10]
};

const stationsMap = new Map();

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    continue;
  }
  
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]]; // usually the main sheet
  const range = XLSX.utils.decode_range(ws['!ref']);
  
  // Extract dates from row 1
  const dateMap = {}; // colIndex -> 'YYYY-MM-DD'
  for(let c = 11; c <= range.e.c; c++){
    const cell = ws[XLSX.utils.encode_cell({r:1,c})];
    if(cell) {
      let v = cell.v;
      if(typeof v === 'number' && v > 40000) {
        const d = new Date((v - 25569) * 86400000);
        d.setFullYear(2025);
        dateMap[c] = d.toISOString().substr(0,10);
      } else if(typeof v === 'string' && v.trim().match(/^\d{2}\.\d{2}$/)) {
        dateMap[c] = '2025-' + v.trim().split('.').reverse().join('-');
      }
    }
  }

  // Iterate over station rows (starts at row 2)
  for(let r = 2; r <= range.e.r; r++){
    const idxCell = ws[XLSX.utils.encode_cell({r,c:0})];
    const riverCell = ws[XLSX.utils.encode_cell({r,c:1})];
    const stnCell = ws[XLSX.utils.encode_cell({r,c:2})];
    
    if(!stnCell || !stnCell.v) continue;
    
    const index = idxCell ? idxCell.v : null;
    const river = riverCell ? String(riverCell.v).trim() : '';
    const stationName = String(stnCell.v).trim();
    
    // Check if we already have this station
    let stationKey = `${river}_${stationName}`;
    let station = stationsMap.get(stationKey);
    
    if (!station) {
      const critCell = ws[XLSX.utils.encode_cell({r,c:6})];
      const critLevel = critCell && typeof critCell.v === 'number' ? critCell.v : null;
      
      station = {
        id: stationKey,
        index,
        river,
        name: stationName,
        criticalLevel: critLevel,
        coords: knownCoords[stationName] || null,
        levels: {}
      };
      stationsMap.set(stationKey, station);
    }
    
    // Add levels for this file's dates
    for (const [col, dateStr] of Object.entries(dateMap)) {
      const valCell = ws[XLSX.utils.encode_cell({r,c: parseInt(col)})];
      if (valCell && typeof valCell.v === 'number') {
        station.levels[dateStr] = valCell.v;
      }
    }
  }
}

// 2026 data is intentionally NOT synthesized here — it is fetched live from
// Yandex Disk by the front-end (see src/utils/yandexDisk.ts) and merged on
// top of this baseline. Keep this file responsible for the historical 2025
// archive only.

const db = {
  metadata: {
    source: "Excel data May-June 2025",
    generatedAt: new Date().toISOString()
  },
  stations: Array.from(stationsMap.values())
};

const outPath = 'public/water_levels_db.json';
fs.writeFileSync(outPath, JSON.stringify(db, null, 2));
console.log(`Successfully generated DB with ${db.stations.length} stations. Saved to ${outPath}`);
