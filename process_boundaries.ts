import fs from 'fs';
import { multiPolygon, polygon, featureCollection, simplify } from '@turf/turf';

function buildGeometry(relation: any) {
    // Collect all ways
    let ways: any[] = [];
    for (const member of relation.members) {
        if (member.type === 'way' && member.geometry && member.role !== 'admin_centre' && member.role !== 'label') {
            const coords = member.geometry.map((g: any) => [parseFloat(g.lon.toFixed(4)), parseFloat(g.lat.toFixed(4))]);
            ways.push(coords);
        }
    }
    
    // We will just return these ways as a MultiLineString since we just want to draw boundaries.
    // Stitching into proper polygons is complex (though turf.polygonize exists),
    // but just rendering the lines is fine for a boundary map! 
    return {
        type: 'MultiLineString',
        coordinates: ways
    };
}

try {
    const sakhaRaw = JSON.parse(fs.readFileSync('sakha_raw.json', 'utf8'));
    const distRaw = JSON.parse(fs.readFileSync('districts_raw.json', 'utf8'));
    
    const features = [];
    
    // Add Sakha border
    if (sakhaRaw.elements) {
        const sakhaRel = sakhaRaw.elements.find((e: any) => e.type === 'relation');
        if (sakhaRel) {
            const geom = buildGeometry(sakhaRel);
            features.push({
                type: 'Feature',
                properties: { name: 'Республика Саха (Якутия)', type: 'region' },
                geometry: geom
            });
        }
    }
    
    // Add districts
    if (distRaw.elements) {
        for (const el of distRaw.elements) {
            if (el.type === 'relation') {
                const geom = buildGeometry(el);
                features.push({
                    type: 'Feature',
                    properties: { name: el.tags?.name || 'Улус', type: 'district' },
                    geometry: geom
                });
            }
        }
    }
    
    const fc: any = featureCollection(features);
    
    // Simplify! Tolerance in degrees. 0.01 is roughly 1km. That'll compress a lot.
    const simplified = simplify(fc, { tolerance: 0.02, highQuality: false, mutate: true });
    
    fs.writeFileSync('src/utils/yakutia_boundaries.json', JSON.stringify(simplified));
    console.log('Saved yakutia_boundaries.json', fs.statSync('src/utils/yakutia_boundaries.json').size, 'bytes');

} catch(e) {
    console.error(e);
}
