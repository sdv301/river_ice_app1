/**
 * Generate yakutia_boundaries.json
 * Strategy: Try multiple Overpass mirrors, fallback to Nominatim GeoJSON
 */
const fs = require('fs');
const https = require('https');

function fetchURL(url, postData, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: postData ? 'POST' : 'GET',
      headers: postData ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } : {},
      timeout
    };
    
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (postData) req.write(postData);
    req.end();
  });
}

function buildGeometry(relation) {
  let ways = [];
  for (const member of (relation.members || [])) {
    if (member.type === 'way' && member.geometry && member.role !== 'admin_centre' && member.role !== 'label') {
      const coords = member.geometry.map(g => [
        parseFloat(g.lon.toFixed(3)),
        parseFloat(g.lat.toFixed(3))
      ]);
      // Simplify: keep every Nth point
      const step = Math.max(1, Math.floor(coords.length / 60));
      const simplified = [];
      for (let i = 0; i < coords.length; i += step) simplified.push(coords[i]);
      if (JSON.stringify(simplified[simplified.length - 1]) !== JSON.stringify(coords[coords.length - 1])) {
        simplified.push(coords[coords.length - 1]);
      }
      if (simplified.length >= 2) ways.push(simplified);
    }
  }
  return { type: 'MultiLineString', coordinates: ways };
}

const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchOverpass(query) {
  const postData = `data=${encodeURIComponent(query)}`;
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      console.log(`  Trying ${mirror}...`);
      const raw = await fetchURL(mirror, postData, 180000);
      return JSON.parse(raw);
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
  }
  return null;
}

async function main() {
  const features = [];

  // Step 1: Get Sakha Republic border
  console.log('Step 1: Fetching Sakha Republic border...');
  const sakhaQuery = `[out:json][timeout:120];relation(151234);out geom;`;
  const sakhaData = await fetchOverpass(sakhaQuery);
  
  if (sakhaData?.elements) {
    const sakhaRel = sakhaData.elements.find(e => e.type === 'relation');
    if (sakhaRel) {
      const geom = buildGeometry(sakhaRel);
      features.push({
        type: 'Feature',
        properties: { name: 'Республика Саха (Якутия)', type: 'region' },
        geometry: geom
      });
      console.log(`  OK: Sakha border with ${geom.coordinates.length} ways`);
    }
  } else {
    console.log('  WARN: Could not get Sakha border from Overpass');
  }

  // Step 2: Get districts (uluses)
  console.log('\nStep 2: Fetching district boundaries...');
  const distQuery = `[out:json][timeout:120];
area["name"="Республика Саха (Якутия)"]["admin_level"="4"]->.searchArea;
relation["admin_level"="6"](area.searchArea);
out geom;`;
  
  const distData = await fetchOverpass(distQuery);
  
  if (distData?.elements) {
    for (const el of distData.elements) {
      if (el.type === 'relation') {
        const geom = buildGeometry(el);
        if (geom.coordinates.length > 0) {
          features.push({
            type: 'Feature',
            properties: { name: el.tags?.name || 'Улус', type: 'district' },
            geometry: geom
          });
        }
      }
    }
    console.log(`  OK: ${features.length - 1} districts`);
  } else {
    console.log('  WARN: Could not get districts from Overpass');
  }

  if (features.length === 0) {
    console.error('No features downloaded! Trying Nominatim fallback...');
    // Fallback: get just the Yakutia polygon from Nominatim
    try {
      const url = 'https://nominatim.openstreetmap.org/search?q=Республика+Саха+Якутия&format=geojson&polygon_geojson=1&limit=1';
      console.log('  Fetching from Nominatim...');
      const raw = await fetchURL(url, null, 30000);
      const nominatimData = JSON.parse(raw);
      if (nominatimData.features?.length > 0) {
        const feat = nominatimData.features[0];
        feat.properties = { name: 'Республика Саха (Якутия)', type: 'region' };
        features.push(feat);
        console.log('  OK: Got Yakutia polygon from Nominatim');
      }
    } catch (e) {
      console.error('  Nominatim also failed:', e.message);
    }
  }

  const fc = { type: 'FeatureCollection', features };
  const outPath = 'public/yakutia_boundaries.json';
  fs.writeFileSync(outPath, JSON.stringify(fc));
  const size = fs.statSync(outPath).size;
  console.log(`\nSaved ${outPath} (${(size / 1024).toFixed(0)} KB, ${features.length} features)`);
}

main().catch(console.error);
