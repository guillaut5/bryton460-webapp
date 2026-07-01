// ════════════════════════════════════════════════════════════════
// sort1.path — index spatial par tuile OSM zoom 13
//
// Rôle sur le device : filtre grossier pour la détection "sur le trajet".
// Sans ce fichier, comparer la position GPS aux ~15 000 points du .track
// à chaque seconde serait trop lent pour un CPU ARM basse fréquence.
//
// Fonctionnement supposé :
//   1. GPS → calcule la tuile z=13 courante (même formule Mercator)
//   2. Cherche dans sort1.path le segment dont tile_id correspond
//   3. Charge uniquement les ~500 points de ce segment depuis le .track
//      (accès direct : offset = start_ptIdx × 16)
//   4. Compare la position GPS à ces ~500 points → "sur le trajet" ou non
//
// Zoom 13 = tuiles ~4.8km × 4.8km à la latitude de la France.
// Assez petit pour que ~500 points tiennent en RAM, assez grand pour que
// la route reste dans la même tuile pendant ~1 min de roulage.
// ════════════════════════════════════════════════════════════════

// Format sort1.path — N segments × 16 octets, Little Endian.
// Découpe la trace par tuile OSM zoom 13 : le Bryton charge uniquement les points
// de la tuile courante (~500 pts) plutôt que toute la trace (~15 000 pts).
// Les segments se chevauchent d'un point : end[i] == start[i+1] - 1.
//
// Structure d'un record (16 octets) :
//   +0  uint32  start_ptIdx
//   +4  uint32  end_ptIdx
//   +8  uint32  tile_id = (ty_z13 << 16) | tx_z13
//   +12 uint32  0
//
// Formule tuile Mercator zoom z=13 (N = 2^13 = 8192 tuiles par axe) :
//   tx = floor((lon + 180) / 360 × N)
//   ty = floor((1 − ln(tan(lat) + 1/cos(lat)) / π) / 2 × N)
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
