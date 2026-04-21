import https from 'https';
import fs from 'fs';

const query = `[out:json][timeout:90];
relation["name:ru"="Лена"]["waterway"="river"];
out geom;`;

const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

console.log('Fetching Lena river data from OSM...');
https.get(url, (res) => {
  let data = '';
  res.on('data', (d) => { data += d; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Got response, elements:', parsed.elements?.length);
      
      const elements = parsed.elements || [];
      const relation = elements.find((e: any) => e.type === 'relation');
      
      if (!relation) {
        console.error('No relation found');
        return;
      }
      
      let allCoords: [number, number][] = [];
      const members = relation.members || [];
      
      // Filter out only ways with a specific role, usually "main_stream" or empty for a river.
      for (const member of members) {
        if (member.type === 'way' && member.geometry) {
           const coords = member.geometry.map((g: any) => [parseFloat(g.lon.toFixed(5)), parseFloat(g.lat.toFixed(5))] as [number, number]);
           // Overpass paths might disconnected or backwards. For a simple approximation we just collect them.
           // However, keeping them as separate features in a MultiLineString is better.
           allCoords.push(coords);
        }
      }

      console.log('Extracted paths:', allCoords.length);
      fs.writeFileSync('lena_river_paths.json', JSON.stringify(allCoords));
      console.log('Saved to lena_river_paths.json');
    } catch(e) {
      console.error('Error parsing:', e);
    }
  });
}).on('error', (e) => {
  console.error(e);
});
