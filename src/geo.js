export function hav(lat1, lon1, lat2, lon2) {
  const R = 6371000, p1 = lat1*Math.PI/180, p2 = lat2*Math.PI/180;
  const dp = (lat2-lat1)*Math.PI/180, dl = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function totalDist(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += hav(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]);
  return d;
}

export function calcClimb(pts) {
  let up = 0, dn = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][2] == null || pts[i-1][2] == null) continue;
    const de = pts[i][2] - pts[i-1][2];
    if (de > 0) up += de; else dn -= de;
  }
  return { up: Math.round(up), dn: Math.round(dn) };
}

export function buildDists(pts) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[d.length-1] + hav(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]));
  return d;
}
