// Ramer–Douglas–Peucker récursif sur des coordonnées [lat, lon].
// Supprime les points dont la distance perpendiculaire à la droite
// (premier → dernier) est inférieure à eps mètres.
// La distance est approximée en multipliant par 111320 m/° (précis
// à ±0.5% aux latitudes européennes, sans appel trigonométrique).
// Cas dégénéré (segment de longueur ~0) : distance euclidienne brute.
export function rdpFn(pts, eps) {
  if (pts.length < 3) return pts;
  let mx = 0, idx = 0;
  const ax = pts[0][0], ay = pts[0][1], bx = pts[pts.length-1][0], by = pts[pts.length-1][1];
  const len = Math.hypot(bx-ax, by-ay);
  for (let i = 1; i < pts.length-1; i++) {
    const px = pts[i][0], py = pts[i][1];
    // distance point → droite AB en mètres (formule aire du triangle / base)
    const dm = (len < 1e-12 ? Math.hypot(px-ax, py-ay) : Math.abs((by-ay)*px - (bx-ax)*py + bx*ay - by*ax) / len) * 111320;
    if (dm > mx) { mx = dm; idx = i; }
  }
  if (mx > eps) {
    // point trop éloigné : diviser et récurser des deux côtés
    const l = rdpFn(pts.slice(0, idx+1), eps), r = rdpFn(pts.slice(idx), eps);
    return [...l.slice(0, -1), ...r]; // évite le doublon au point de jonction
  }
  return [pts[0], pts[pts.length-1]];
}

// Applique la simplification choisie par l'UI puis force le plafond maxPts.
// mode 'rdp'     : RDP avec tolérance rdpEps mètres
// mode 'uniform' : garde 1 point sur step (décimation régulière)
// mode 'none'    : aucune simplification
// Dans tous les cas le dernier point est toujours conservé (cohérence
// avec le .track qui doit finir exactement à la destination).
export function applySimp(pts, { mode = 'none', rdpEps = 3, step = 2, maxPts = 99999 } = {}) {
  let out = pts;
  if (mode === 'rdp') {
    out = rdpFn(pts, rdpEps);
  } else if (mode === 'uniform') {
    out = pts.filter((_, i) => i % step === 0);
    if (out[out.length-1] !== pts[pts.length-1]) out.push(pts[pts.length-1]);
  }
  if (out.length > maxPts) {
    // plafond absolu : décimation uniforme sur le résultat déjà simplifié
    const s = Math.ceil(out.length / maxPts);
    const sub = out.filter((_, i) => i % s === 0);
    if (sub[sub.length-1] !== out[out.length-1]) sub.push(out[out.length-1]);
    out = sub;
  }
  return out;
}
