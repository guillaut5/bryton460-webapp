// ════════════════════════════════════════════════════════════════
// .tinfo — index des montées (track info)
//
// Rôle sur le device : lu une fois au chargement pour construire la liste
// des montées à afficher sur le profil. Utilisé pour :
//   1. Colorier les segments de montée sur le profil altimétrique
//   2. Afficher "montée X : +Ym sur Zkm" à l'approche
//   3. Déclencher l'écran "profil de montée" quand ptIdx courant ≥ startPt
//
// Stocker seulement les ptIdx (2 octets utiles par record sur 44) permet
// de retrouver lat/lon/ele dans le .track par accès direct O(1) :
//   offset = ptIdx × 16
// ════════════════════════════════════════════════════════════════

// Format .tinfo — N montées × 2 records × 44 octets = N × 88 octets, Little Endian.
// Chaque montée génère une paire : record "début" puis record "fin".
// Structure d'un record (44 octets) :
//   +0  uint32  (flag << 16) | ptIdx
//               flag 0x00BE = début de montée
//               flag 0x00BF = fin de montée
//               ptIdx = index du point dans le .track, encodé sur les bits 0–15
//   +4  40×     zéros (padding)
export function encodeTinfo(climbs) {
  if (!climbs || !climbs.length) return new ArrayBuffer(0);
  const buf = new ArrayBuffer(climbs.length * 2 * 44), v = new DataView(buf);
  for (let i = 0; i < climbs.length; i++) {
    v.setUint32(i*88,    (0x00BE << 16) | (climbs[i].startPt & 0xFFFF), true);
    v.setUint32(i*88+44, (0x00BF << 16) | (climbs[i].endPt   & 0xFFFF), true);
  }
  return buf;
}
