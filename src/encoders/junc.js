// ════════════════════════════════════════════════════════════════
// list.junc / list2.junc — intersections et virages
//
// Rôle sur le device : navigation turn-by-turn. Quand ptIdx courant
// dépasse le ptIdx d'une intersection, le device affiche une flèche
// directionnelle et émet un bip.
//
// Le bearing (uint8 0–255) est précalculé côté PC : le device fait un
// simple lookup dans une table de 8 ou 16 icônes de flèche. Pas de
// atan2 ni de division sur le device.
//
// list.junc et list2.junc sont identiques — la duplication est probablement
// un vestige de firmware (cache primaire/secondaire, ou compatibilité
// entre deux versions du firmware).
//
// Sentinel FF×12 en fin de fichier : marque la fin de liste sans stocker
// le nombre de records (pas de header dans ce format).
// ════════════════════════════════════════════════════════════════

// Interroge Overpass API pour trouver les intersections OSM le long de la trace.
// Retourne [{lat, lon}] — noeuds référencés par 2+ ways highway dans un rayon de 25m.
// Échantillonne la trace à ~300 points pour limiter la taille de la requête Overpass.
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

// Format list.junc — N × 12 octets + sentinel FF×12, Little Endian.
// Chaque record décrit une intersection que la route traverse.
//   +0  int32   lat × 1e6
//   +4  int32   lon × 1e6
//   +8  uint16  ptIdx (point de trace le plus proche), encodé en 2 × uint8 LE
//   +10 uint8   flag : 1 = virage, 0 = tout droit
//   +11 uint8   bearing × (256/360) — 0=Nord, 64=Est, 128=Sud, 192=Ouest
//               Le device fait un lookup de flèche sur cet octet, pas de trigonométrie.
//
// Si junctions=null (pas d'appel Overpass), fallback : détection par changement d'angle ≥25°
// sur une fenêtre de 50m, espacés d'au moins 100m pour éviter les doublons.
export function encodeJunc(junctions, pts, dists) {
  const n = pts.length;

  // Azimut de la trace au point i, calculé sur une fenêtre de 50m (formule forward azimuth).
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

  // Recherche du point de trace le plus proche par distance Manhattan (rapide, suffisant).
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
