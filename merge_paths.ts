import fs from 'fs';

const data = JSON.parse(fs.readFileSync('lena_river_paths.json', 'utf8'));

// data is [ [ [lon, lat], [lon, lat]... ], ... ]
// Create a distance function
function dist(p1: [number, number], p2: [number, number]) {
  return Math.sqrt(Math.pow(p1[0]-p2[0], 2) + Math.pow(p1[1]-p2[1], 2));
}

let paths: [number, number][][] = [...data];

if (paths.length > 0) {
  let merged: [number, number][] = paths.shift()!;
  
  while (paths.length > 0) {
    let bestDist = Infinity;
    let bestIdx = -1;
    let reverseMerged = false;
    let reversePath = false;
    let appendToFront = false;

    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const startP = p[0];
      const endP = p[p.length - 1];
      const startM = merged[0];
      const endM = merged[merged.length - 1];

      // compare endpoints
      const d1 = dist(endM, startP); // end of merged to start of path
      const d2 = dist(endM, endP);   // end of merged to end of path (need reverse path)
      const d3 = dist(startM, endP); // start of merged to end of path (prepend)
      const d4 = dist(startM, startP); // start of merged to start of path (prepend, reverse path)

      if (d1 < bestDist) { bestDist = d1; bestIdx = i; reversePath = false; appendToFront = false; }
      if (d2 < bestDist) { bestDist = d2; bestIdx = i; reversePath = true; appendToFront = false; }
      if (d3 < bestDist) { bestDist = d3; bestIdx = i; reversePath = false; appendToFront = true; }
      if (d4 < bestDist) { bestDist = d4; bestIdx = i; reversePath = true; appendToFront = true; }
    }

    if (bestDist > 0.05) { // If distance is more than ~5km, maybe it's a disconnected branch. Stop or skip.
        // The Lena river relation from OSM might have tributaries or islands. 
        // Let's just collect the biggest continuous chunk.
        // Actually, we can just skip it for now.
        paths.splice(bestIdx, 1);
        continue;
    }

    const nextPath = paths.splice(bestIdx, 1)[0];
    if (reversePath) {
      nextPath.reverse();
    }
    
    // Remove duplicate connection point if distance is exactly 0
    if (bestDist < 0.0001) {
        if (appendToFront) {
            nextPath.pop();
        } else {
            nextPath.shift();
        }
    }

    if (appendToFront) {
      merged = nextPath.concat(merged);
    } else {
      merged = merged.concat(nextPath);
    }
  }

  // Ensure South -> North
  if (merged[0][1] > merged[merged.length - 1][1]) {
    merged.reverse();
  }

  console.log('Final merged geometry points:', merged.length);
  // Simplify very slightly to improve performance: Keep every ~2 points if distance is very small
  let simplified = [merged[0]];
  for (let i = 1; i < merged.length; i++) {
    if (dist(simplified[simplified.length - 1], merged[i]) > 0.005) { // roughly 500m
      simplified.push(merged[i]);
    }
  }
  // add last point
  simplified.push(merged[merged.length - 1]);
  
  console.log('Simplified points:', simplified.length);
  fs.writeFileSync('src/utils/lena_coords.json', JSON.stringify(simplified));
}
