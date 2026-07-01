// ════════════════════════════════════════════════════════════════
// .smy — résumé de route (summary)
//
// Rôle sur le device : premier fichier lu, avant même d'ouvrir le .track.
// Utilisé pour :
//   1. Afficher la liste des routes sauvegardées (nom, distance, D+)
//   2. Centrer la carte sur la bounding box avant que la trace soit chargée
//   3. Vérifier rapidement si la route est dans la zone GPS courante
//
// 68 octets fixes = lecture instantanée sans parsing ni allocation.
// La bounding box évite de charger le .track juste pour savoir où est la route.
// ════════════════════════════════════════════════════════════════

import { calcClimb, totalDist } from '../geo.js'

// Format .smy — 68 octets fixes, Little Endian :
//   +0  uint16  version = 1
//   +2  uint16  nb_points
//   +4  int32   lat_max × 1e6
//   +8  int32   lat_min × 1e6
//   +12 int32   lon_max × 1e6
//   +16 int32   lon_min × 1e6
//   +20 int32   distance totale (m)
//   +24 int32   inconnu — laissé à 0 (= 1 638 732 dans l'officiel, rôle non déterminé)
//   +28 32×     zéros
//   +60 int32   D+ (m)
//   +64 int32   D- — toujours 0 dans les fichiers officiels Bryton
export function encodeSmy(pts, climbs) {
  const buf = new ArrayBuffer(68), v = new DataView(buf);
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
  const { up } = calcClimb(pts);
  v.setUint16(0, 1, true);
  v.setUint16(2, pts.length, true);
  v.setInt32(4,  Math.round(Math.max(...lats)*1e6), true);
  v.setInt32(8,  Math.round(Math.min(...lats)*1e6), true);
  v.setInt32(12, Math.round(Math.max(...lons)*1e6), true);
  v.setInt32(16, Math.round(Math.min(...lons)*1e6), true);
  v.setInt32(20, Math.round(totalDist(pts)), true);
  v.setInt32(60, up, true);
  // D- à +64 non écrit → reste 0, conforme à l'officiel
  return buf;
}
