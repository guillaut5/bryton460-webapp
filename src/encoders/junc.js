export async function fetchOSMJunctions(pts) {
  const n = pts.length;
  const step = Math.max(1, Math.ceil(n / 300));
  const sampled = [];
  for (let i = 0; i < n; i += step) sampled.push(pts[i]);
  if (sampled[sampled.length-1] !== pts[n-1]) sampled.push(pts[n-1]);

  const coords = sampled.map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(',');
  const query =
`[out:json][timeout:60];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|road|living_street)$"](around:25,${coords});
)->.ways;
node(w.ways)->.allnodes;
.ways out body;
.allnodes out skel;`;

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error('Overpass HTTP ' + resp.status);
  const data = await resp.json();

  const nodePos = {}, nodeWays = {};
  for (const el of data.elements) {
    if (el.type === 'node') nodePos[el.id] = [el.lat, el.lon];
    if (el.type === 'way' && el.nodes) for (const id of el.nodes) nodeWays[id] = (nodeWays[id] || 0) + 1;
  }
  return Object.keys(nodeWays)
    .filter(id => nodeWays[id] >= 2 && nodePos[id])
    .map(id => ({ lat: nodePos[id][0], lon: nodePos[id][1] }));
}

export function encodeJunc(junctions, pts, dists) {
  const n = pts.length;

  function bearingAt(i) {
    const WM = 50;
    let a = i; while (a > 0 && dists[i]-dists[a] < WM) a--;
    let b = i; while (b < n-1 && dists[b]-dists[i] < WM) b++;
    const phi1 = pts[a][0]*Math.PI/180, phi2 = pts[b][0]*Math.PI/180;
    const dl = (pts[b][1]-pts[a][1])*Math.PI/180;
    const x = Math.sin(dl)*Math.cos(phi2);
    const y = Math.cos(phi1)*Math.sin(phi2) - Math.sin(phi1)*Math.cos(phi2)*Math.cos(dl);
    return (Math.atan2(x, y)*180/Math.PI + 360) % 360;
  }

  if (!junctions) {
    const turns = [];
    let lastDist = -999;
    for (let i = 10; i < n-10; i++) {
      if (dists[i]-lastDist < 100) continue;
      const hB = bearingAt(Math.max(0, i-5)), hA = bearingAt(Math.min(n-1, i+5));
      if (Math.abs(((hA-hB+180)%360)-180) >= 25) {
        turns.push({ lat: pts[i][0], lon: pts[i][1], _ptIdx: i, _bear: hA });
        lastDist = dists[i];
      }
    }
    junctions = turns;
  }

  function nearestPt(lat, lon) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(pts[i][0]-lat) + Math.abs(pts[i][1]-lon);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  const recs = junctions.map(j => {
    const ptIdx = j._ptIdx ?? nearestPt(j.lat, j.lon);
    return { lat: j.lat, lon: j.lon, ptIdx, bear: j._bear ?? bearingAt(ptIdx) };
  });
  recs.sort((a, b) => a.ptIdx - b.ptIdx);
  const deduped = [];
  let lastPt = -1;
  for (const r of recs) { if (r.ptIdx !== lastPt) { deduped.push(r); lastPt = r.ptIdx; } }

  const buf = new ArrayBuffer(deduped.length * 12), v = new DataView(buf);
  for (let i = 0; i < deduped.length; i++) {
    const r = deduped[i];
    v.setInt32(i*12,   Math.round(r.lat*1e6), true);
    v.setInt32(i*12+4, Math.round(r.lon*1e6), true);
    v.setUint8(i*12+8,  r.ptIdx & 0xFF);
    v.setUint8(i*12+9, (r.ptIdx >> 8) & 0xFF);
    v.setUint8(i*12+10, 1);
    v.setUint8(i*12+11, Math.round(r.bear/360*256) & 0xFF);
  }
  return buf;
}
