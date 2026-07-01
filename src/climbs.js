export function detectClimbs(pts, dists) {
  const n = pts.length;
  if (!pts.some(p => p[2] != null)) return [];

  const raw = pts.map(p => p[2] ?? 0);
  const SMOOTH = 200;
  const es = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i; j >= 0 && dists[i]-dists[j] <= SMOOTH; j--) { sum += raw[j]; cnt++; }
    for (let j = i+1; j < n && dists[j]-dists[i] <= SMOOTH; j++) { sum += raw[j]; cnt++; }
    es[i] = cnt ? sum/cnt : raw[i];
  }

  const MIN_LEN = 500, MIN_GAIN = 25, MIN_GRADE = 0.022;
  const all = [];
  let i = 0;
  while (i < n-2) {
    if (es[i+1] <= es[i]) { i++; continue; }
    const si = i;
    let peak = es[i], pi = i, j = i+1;
    while (j < n) {
      if (es[j] > peak) { peak = es[j]; pi = j; }
      const drop = Math.max(40, (peak-es[si]) * 0.30);
      if (peak - es[j] >= drop) break;
      j++;
    }
    const gain = es[pi] - es[si];
    const len = dists[pi] - dists[si];
    if (len < 10) { i = pi+1; continue; }
    const grade = gain / len;
    if (gain >= MIN_GAIN && len >= MIN_LEN && grade >= MIN_GRADE) {
      all.push({ start: dists[si], length: len, gain, grade, startPt: si, endPt: pi });
    }
    i = pi+1;
  }
  all.sort((a, b) => (b.grade*b.gain) - (a.grade*a.gain));
  return all.slice(0, 5).sort((a, b) => a.start - b.start);
}
