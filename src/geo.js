// Haversine : distance en mètres entre deux points GPS.
// Précision ~0.3% sur des distances cyclistes (1–200 km), suffisant pour l'encodage Bryton.
// p1/p2 = latitudes en radians ; dp/dl = delta lat/lon en radians.
// a = carré du demi-chord (intermédiaire haversine) ; atan2 → angle central → × R.
export function hav(lat1, lon1, lat2, lon2) {
  const R = 6371000, p1 = lat1*Math.PI/180, p2 = lat2*Math.PI/180;
  const dp = (lat2-lat1)*Math.PI/180, dl = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Distance totale de la trace en mètres (somme des segments consécutifs).
export function totalDist(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += hav(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]);
  return d;
}

// D+ et D- cumulés. Les points sans élévation (null) sont sautés sans interpolation
// pour ne pas inventer du dénivelé sur des GPX sans altitude.
export function calcClimb(pts) {
  let up = 0, dn = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][2] == null || pts[i-1][2] == null) continue;
    const de = pts[i][2] - pts[i-1][2];
    if (de > 0) up += de; else dn -= de;
  }
  return { up: Math.round(up), dn: Math.round(dn) };
}

// Distances cumulées depuis le départ, un nombre par point (dists[0] = 0).
// Précalculé une fois pour éviter de recalculer haversine à chaque lookup de ptIdx.
export function buildDists(pts) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[d.length-1] + hav(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]));
  return d;
}

// Détecte les points où la trace GPS change vraiment de direction (virages réels),
// par changement de bearing ≥ threshold sur une fenêtre de `window` mètres.
// Utilisé en fallback pour list.junc (pas d'intersections OSM) et pour ancrer
// l'échantillonnage OSRM sur les vrais virages plutôt qu'un intervalle de distance
// aveugle — dans un lotissement (rues courtes et rapprochées), un point tous les 200m
// peut manquer un virage et laisser OSRM reconstituer un chemin plausible mais faux.
export function detectTurnIdxs(pts, dists, { threshold = 25, window = 50, minSpacing = 100 } = {}) {
  const n = pts.length;
  function bearingAt(i) {
    let a = i; while (a > 0 && dists[i]-dists[a] < window) a--;
    let b = i; while (b < n-1 && dists[b]-dists[i] < window) b++;
    const phi1 = pts[a][0]*Math.PI/180, phi2 = pts[b][0]*Math.PI/180;
    const dl = (pts[b][1]-pts[a][1])*Math.PI/180;
    const x = Math.sin(dl)*Math.cos(phi2);
    const y = Math.cos(phi1)*Math.sin(phi2) - Math.sin(phi1)*Math.cos(phi2)*Math.cos(dl);
    return (Math.atan2(x, y)*180/Math.PI + 360) % 360;
  }
  const turns = [];
  let lastDist = -Infinity;
  for (let i = 10; i < n-10; i++) {
    if (dists[i]-lastDist < minSpacing) continue;
    const hB = bearingAt(Math.max(0, i-5)), hA = bearingAt(Math.min(n-1, i+5));
    if (Math.abs(((hA-hB+180)%360)-180) >= threshold) {
      turns.push({ ptIdx: i, bear: hA });
      lastDist = dists[i];
    }
  }
  return turns;
}
