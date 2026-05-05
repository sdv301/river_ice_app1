import * as XLSX from 'xlsx';
import type { WaterLevelStation } from '../store/waterLevelStore';

// Use same known coords map as backend script - expanded to include all settlements
const knownCoords: Record<string, [number, number]> = {
  // Upper reaches
  'Усть-Кут': [105.76, 56.80],
  'Осетрово': [105.74, 56.79],
  'Змеиново': [107.82, 57.73],
  'Киренск': [108.11, 57.77],
  'Дарьино': [108.40, 58.11],
  'Визирный': [109.18, 58.42],
  'Алексеевск': [110.42, 58.87],
  // Middle reaches
  'Витим': [112.584, 59.449],
  'Пеледуй': [112.761, 59.612],
  'Крестовский': [113.208, 59.744],
  'Ярославский': [113.919, 60.162],
  'Хамра': [114.152, 60.223],
  'Ленск': [114.928, 60.709],
  'Мурья': [115.307, 60.729],
  'Салдыкель': [115.859, 60.680],
  'Нюя': [116.228, 60.527],
  'Турукта': [116.513, 60.475],
  'Чапаево': [117.097, 60.121],
  'Мача': [117.632, 59.901],
  'Иннях': [118.505, 59.814],
  'Олёкминск': [120.42, 60.37],
  'Олекминск': [120.42, 60.37],
  'Солянка': [120.65, 60.35],
  'Хатынг-Тумул': [121.25, 60.40],
  'Саныяхтат': [124.9, 60.85], 
  'Синск': [125.30, 61.10],
  // Yakutsk area
  'Булгунняхтах': [129.46, 61.73],
  'Мохсоголлох': [129.32, 61.58],
  'Покровск': [129.13, 61.48],
  'Старая Табага': [129.55, 61.85],
  'Табага': [129.58, 61.85],
  'Хатассы': [129.64, 61.96],
  'Якутск': [129.73, 62.03],
  'Тулагино': [129.55, 62.12],
  'Маган': [129.67, 62.08],
  'Жатай': [129.83, 62.15],
  'Графский Берег': [129.80, 62.15],
  'Кангалассы': [129.98, 62.33],
  'Намцы': [129.70, 62.70],
  // Lower reaches
  'Батамай': [128.08, 63.20],
  'Сангар': [127.47, 63.92],
  'Сангары': [127.47, 63.92],
  'Жиганск': [123.39, 66.76],
  'Джарджан': [124.22, 68.74],
  'Кюсюр': [127.87, 70.68],
  'Сиктях': [128.40, 71.15],
  'Хабарова': [126.85, 72.10],
  'Тикси': [128.86, 71.63],
};

export async function parseExcelData(fileContent: ArrayBuffer, year: number): Promise<WaterLevelStation[]> {
  const wb = XLSX.read(fileContent, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  
  const dateMap: Record<number, string> = {};
  for(let c = 11; c <= range.e.c; c++){
    const cell = ws[XLSX.utils.encode_cell({r:1,c})];
    if(cell) {
      let v = cell.v;
      if(typeof v === 'number' && v > 40000) {
        const d = new Date((v - 25569) * 86400000);
        d.setFullYear(year);
        dateMap[c] = d.toISOString().substring(0,10);
      } else if(typeof v === 'string' && v.trim().match(/^\d{2}\.\d{2}$/)) {
        dateMap[c] = `${year}-` + v.trim().split('.').reverse().join('-');
      }
    }
  }

  const stationsMap = new Map<string, WaterLevelStation>();

  for(let r = 2; r <= range.e.r; r++){
    const idxCell = ws[XLSX.utils.encode_cell({r,c:0})];
    const riverCell = ws[XLSX.utils.encode_cell({r,c:1})];
    const stnCell = ws[XLSX.utils.encode_cell({r,c:2})];
    
    if(!stnCell || !stnCell.v) continue;
    
    const index = idxCell ? idxCell.v : null;
    const river = riverCell ? String(riverCell.v).trim() : '';
    const stationName = String(stnCell.v).trim();
    
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
    
    for (const [col, dateStr] of Object.entries(dateMap)) {
      const valCell = ws[XLSX.utils.encode_cell({r,c: parseInt(col)})];
      if (valCell && typeof valCell.v === 'number') {
        station.levels[dateStr] = valCell.v;
      }
    }
  }

  return Array.from(stationsMap.values());
}
