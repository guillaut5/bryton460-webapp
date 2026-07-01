export function encodeSortPath(pts) {
  const Z = 13, N = 1 << Z;
  function tileOf(lat, lon) {
    const tx = Math.floor((lon+180)/360*N);
    const lr = lat*Math.PI/180;
    const ty = Math.floor((1 - Math.log(Math.tan(lr) + 1/Math.cos(lr))/Math.PI)/2*N);
    return { tx: Math.max(0, Math.min(N-1, tx)), ty: Math.max(0, Math.min(N-1, ty)) };
  }
  const segs = [];
  let s = 0, { tx: cx, ty: cy } = tileOf(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const { tx, ty } = tileOf(pts[i][0], pts[i][1]);
    if (tx !== cx || ty !== cy) {
      segs.push({ s, e: i, tx: cx, ty: cy });
      s = i; cx = tx; cy = ty;
    }
  }
  segs.push({ s, e: pts.length-1, tx: cx, ty: cy });
  const buf = new ArrayBuffer(segs.length * 16), v = new DataView(buf);
  segs.forEach(({ s, e, tx, ty }, i) => {
    v.setUint32(i*16,    s,  true);
    v.setUint32(i*16+4,  e,  true);
    v.setUint32(i*16+8,  (ty << 16) | tx, true);
    v.setUint32(i*16+12, 0,  true);
  });
  return buf;
}
