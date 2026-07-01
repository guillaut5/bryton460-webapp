export function rdpFn(pts, eps) {
  if (pts.length < 3) return pts;
  let mx = 0, idx = 0;
  const ax = pts[0][0], ay = pts[0][1], bx = pts[pts.length-1][0], by = pts[pts.length-1][1];
  const len = Math.hypot(bx-ax, by-ay);
  for (let i = 1; i < pts.length-1; i++) {
    const px = pts[i][0], py = pts[i][1];
    const dm = (len < 1e-12 ? Math.hypot(px-ax, py-ay) : Math.abs((by-ay)*px - (bx-ax)*py + bx*ay - by*ax) / len) * 111320;
    if (dm > mx) { mx = dm; idx = i; }
  }
  if (mx > eps) {
    const l = rdpFn(pts.slice(0, idx+1), eps), r = rdpFn(pts.slice(idx), eps);
    return [...l.slice(0, -1), ...r];
  }
  return [pts[0], pts[pts.length-1]];
}

export function applySimp(pts, { mode = 'none', rdpEps = 3, step = 2, maxPts = 99999 } = {}) {
  let out = pts;
  if (mode === 'rdp') {
    out = rdpFn(pts, rdpEps);
  } else if (mode === 'uniform') {
    out = pts.filter((_, i) => i % step === 0);
    if (out[out.length-1] !== pts[pts.length-1]) out.push(pts[pts.length-1]);
  }
  if (out.length > maxPts) {
    const s = Math.ceil(out.length / maxPts);
    const sub = out.filter((_, i) => i % s === 0);
    if (sub[sub.length-1] !== out[out.length-1]) sub.push(out[out.length-1]);
    out = sub;
  }
  return out;
}
