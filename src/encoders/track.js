// ════════════════════════════════════════════════════════════════
// .track — trace GPS principale
//
// Rôle sur le device : fichier central, chargé entièrement en RAM au démarrage
// de la navigation. Utilisé pour :
//   1. Afficher le tracé sur la carte (lat/lon de chaque point)
//   2. Afficher le profil altimétrique (ele)
//   3. Détecter "sur le trajet" : après filtre tuile (sort1.path), le device
//      compare la position GPS aux points du segment courant
//   4. Afficher la pente en temps réel sur l'écran de données (byte 10)
//
// Le fichier dupli.track est une copie octet-à-octet — rôle exact inconnu,
// le firmware plante sans lui (redondance ou adressage alternatif ?).
// ════════════════════════════════════════════════════════════════

// Pente locale en % pour chaque point, calculée sur une fenêtre glissante de 200m centrée.
// Fenêtre distance (pas nombre de points) pour être stable quelle que soit la densité du GPX.
// Clampé à [-127, 127] pour tenir dans un int8 signé (byte 10 du .track).
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

// Format .track — N × 16 octets, Little Endian :
//   +0  int32   lat × 1 000 000
//   +4  int32   lon × 1 000 000
//   +8  uint16  altitude (m), clampé [0, 65535]
//   +10 int8    pente locale (%), fournie par computeGrades
//   +11 5×      zéros (padding)
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
