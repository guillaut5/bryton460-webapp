export function computeGrades(pts, dists) {
  const n = pts.length, WIN = 200, grades = new Array(n).fill(0);
  if (!pts.some(p => p[2] != null)) return grades;
  for (let i = 0; i < n; i++) {
    if (pts[i][2] == null) continue;
    let a = i, b = i;
    while (a > 0 && dists[i]-dists[a] < WIN/2) a--;
    while (b < n-1 && dists[b]-dists[i] < WIN/2) b++;
    const dDist = dists[b] - dists[a];
    if (dDist < 10 || pts[a][2] == null || pts[b][2] == null) { grades[i] = 0; continue; }
    const g = Math.round((pts[b][2]-pts[a][2]) / dDist * 100);
    grades[i] = Math.max(-127, Math.min(127, g));
  }
  return grades;
}

export function encodeTrack(pts, grades) {
  const buf = new ArrayBuffer(pts.length * 16), v = new DataView(buf);
  for (let i = 0; i < pts.length; i++) {
    v.setInt32(i*16,   Math.round(pts[i][0]*1e6), true);
    v.setInt32(i*16+4, Math.round(pts[i][1]*1e6), true);
    const ele = pts[i][2] != null ? Math.max(0, Math.min(65535, Math.round(pts[i][2]))) : 0;
    v.setUint16(i*16+8, ele, true);
    if (grades) v.setInt8(i*16+10, grades[i]);
  }
  return buf;
}
