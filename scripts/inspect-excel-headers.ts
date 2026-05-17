import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseSheetRows, parseIceRows } from '../src/utils/yandexDisk.ts';

const dir = path.resolve('internal-data');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx') && f.includes('карту') && !f.includes('гидролог'));

for (const fileName of files.slice(0, 3)) {
  const buf = fs.readFileSync(path.join(dir, fileName));
  const wb = XLSX.read(buf);
  console.log('\n====', fileName, 'sheets:', wb.SheetNames.join(', '));
  for (const sn of wb.SheetNames.slice(0, 2)) {
    const rows = parseSheetRows(wb.Sheets[sn]);
    console.log(' sheet:', sn, 'parsed rows:', rows.length);
    if (rows[0]) console.log(' keys:', Object.keys(rows[0]).join(' | '));
    for (let i = 0; i < Math.min(4, rows.length); i++) {
      console.log(' row', i, JSON.stringify(rows[i]));
    }
    const parsed = parseIceRows(rows, fileName);
    console.log(' parseIceRows obs:', parsed.length, parsed.map((o) => o.locationName));
  }
}
