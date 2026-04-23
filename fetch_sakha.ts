import fs from 'fs';
import https from 'https';

const query = `[out:json][timeout:300];
relation["admin_level"="4"]["name"="Республика Саха (Якутия)"];
out geom;`;

const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

console.log('Fetching Sakha...');
https.get(url, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    fs.writeFileSync('sakha_raw.json', data);
    console.log('Saved raw data. Size:', data.length);
  });
}).on('error', e => console.error(e));
