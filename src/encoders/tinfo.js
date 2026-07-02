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

// ── Format B — navigation voice (routes planifiées ou via OSRM) ──────────────
//
// Structure du fichier :
//   rec 0x01  ptIdx=0        → DÉPART
//   rec 0xFA  ptIdx=0        → nom de la rue de départ (val4=0, val8=0)
//   recs nav  ptIdx croissant → virages avec nom de rue
//   rec 0xFA  ptIdx=last     → distance totale en mètres (val4=dist, val8=1)
//   rec 0x21  ptIdx=last     → ARRIVÉE
//   recs 0xBE/0xBF           → marqueurs de montées (même format que les autres records)
//
// Chaque record (44 octets) :
//   +0  uint16  ptIdx
//   +2  uint8   code instruction
//   +3  uint8   0
//   +4  uint32  distance (m)
//   +8  uint32  distance × 200
//   +12 32×     nom de rue UTF-8, null-paddé
//
// navSteps : [{ptIdx, code, val4, name}] — sortie de matchRoute()
// totalDistM : distance totale de la trace en mètres
// climbs : [{startPt, endPt}]
export function encodeTinfoNav(navSteps, totalDistM, climbs) {
  const enc = new TextEncoder()
  const sorted = [...navSteps].sort((a, b) => a.ptIdx - b.ptIdx)
  const lastPtIdx = sorted.length ? sorted[sorted.length-1].ptIdx : 0
  const firstName = sorted.find(s => s.code === 0x01)?.name || sorted[0]?.name || ''
  const lastName  = sorted[sorted.length-1]?.name || ''

  const recs = []
  recs.push({ ptIdx: 0,          code: 0x01, val4: sorted[0]?.val4 || 0, name: '' })
  recs.push({ ptIdx: 0,          code: 0xFA, val4: 0,          val8ov: 0, name: firstName })
  for (const s of sorted) {
    if (s.code === 0x01 || s.code === 0x21) continue
    recs.push(s)
  }
  recs.push({ ptIdx: lastPtIdx,  code: 0xFA, val4: totalDistM, val8ov: 1, name: lastName })
  recs.push({ ptIdx: lastPtIdx,  code: 0x21, val4: 0,          name: '' })
  for (const c of climbs || []) {
    recs.push({ ptIdx: c.startPt & 0xFFFF, code: 0xBE, val4: 0, name: '' })
    recs.push({ ptIdx: c.endPt   & 0xFFFF, code: 0xBF, val4: 0, name: '' })
  }

  const buf = new ArrayBuffer(recs.length * 44), v = new DataView(buf)
  recs.forEach((r, i) => {
    v.setUint16(i*44,   r.ptIdx, true)
    v.setUint8( i*44+2, r.code)
    v.setUint32(i*44+4, r.val4, true)
    // val8ov permet de surcharger le ×200 pour les records spéciaux (0xFA fin)
    v.setUint32(i*44+8, r.val8ov !== undefined ? r.val8ov : r.val4 * 200, true)
    const nb = enc.encode(r.name || '')
    for (let b = 0; b < Math.min(31, nb.length); b++) v.setUint8(i*44+12+b, nb[b])
  })
  return buf
}
