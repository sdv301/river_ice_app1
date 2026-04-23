import fs from 'fs';
import https from 'https';

const query = `[out:json][timeout:900];
area["name"="Республика Саха (Якутия)"]->.a;
(
  relation["admin_level"="6"](area.a);
);
out geom;`;

const url = 'https://overpass-api.de/api/interpreter';
const postData = 'data=' + encodeURIComponent(query);

const req = https.request(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
    }
}, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
        fs.writeFileSync('districts_raw.json', data);
        console.log('Saved districts. Size:', data.length);
    });
});

req.on('error', e => console.error(e));
req.write(postData);
req.end();
