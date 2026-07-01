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
