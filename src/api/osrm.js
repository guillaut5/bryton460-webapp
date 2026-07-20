// ════════════════════════════════════════════════════════════════
// OSRM Map Matching — snap GPX sur le réseau routier OSM
//
// Utilise /match (pas /route) : suit la trace GPS réelle, pas le
// plus court chemin entre waypoints. Sans ça, OSRM recalcule son
// propre itinéraire → instructions incorrectes (droit≠droit, etc.)
//
// Limites observées sur le serveur public (router.project-osrm.org) :
//   - max ~10 coords par requête /match ("Too many trace coordinates" à 30)
//   - max radius ~25m par point ("Radius search size too large" à 50m)
// Paramètres actuels :
//   - échantillon à 200m + ancrage sur les virages détectés dans le GPS brut → ~55-65
//     chunks pour 100km
//   - déduplication des points < 15m (oscillations GPS)
//   - timestamps à 36s/pt (~20 km/h sur 200m)
//   - radiuses=20m
//
// Un point tous les 200m suffit sur une longue ligne droite, mais dans un lotissement
// (rues de 30-150m) OSRM n'a pas assez de repères entre deux points et peut recoller un
// chemin plausible mais faux à travers une rue voisine. On ajoute donc les points où la
// trace GPS change vraiment de direction (detectTurnIdxs, geo.js) comme points d'ancrage
// supplémentaires — même logique que le fallback de list.junc.
// ════════════════════════════════════════════════════════════════

import { detectTurnIdxs } from '../geo.js'

const OSRM    = 'https://router.project-osrm.org/match/v1/driving'
const CHUNK   = 10    // /match serveur public : ~10 pts max (30 → "Too many trace coordinates")
const RATE_MS = 1100  // délai entre requêtes (bonne pratique serveur public)

// Indices des points échantillonnés à ~interval mètres d'intervalle.
function sampleIdxs(dists, interval) {
  const out = [0]
  let next = interval
  for (let i = 1; i < dists.length; i++) {
    if (dists[i] >= next) { out.push(i); next = dists[i] + interval }
  }
  if (out[out.length-1] !== dists.length-1) out.push(dists.length-1)
  return out
}

// Supprime les points consécutifs < 15m (oscillations GPS qui causaient le 400).
// 0.00015° ≈ 15m en latitude.
function dedup(pts) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length-1], q = pts[i]
    if (Math.abs(q[0]-p[0]) + Math.abs(q[1]-p[1]) > 0.00015) out.push(q)
  }
  return out
}

// ptIdx le plus proche d'une position [lon, lat] — Manhattan, O(n).
function nearestPt(lon, lat, pts) {
  let best = 0, bestD = Infinity
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(pts[i][0]-lat) + Math.abs(pts[i][1]-lon)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

// Manœuvre OSRM → code byte Bryton.
// Table (angle en degrés, 0=tout droit, 180=demi-tour) :
//   0x02 tout droit  0x03 léger gauche  0x04 léger droite
//   0x0D gauche      0x0E droite
//   0x06 serré gauche (-135°)           0x05 serré droite (+135°)
//   0x07 demi-tour   0xD2/D3/D4 rond-point sortie 1/2/3+
function toCode(type, modifier, exit) {
  if (type === 'depart')  return 0x01
  if (type === 'arrive')  return 0x21
  if (type === 'roundabout' || type === 'rotary') {
    if (exit === 1) return 0xD2
    if (exit === 2) return 0xD3
    return 0xD4
  }
  const m = modifier || 'straight'
  if (m === 'straight')                            return 0x02
  if (m === 'slight right') return 0x04  // confirmé voiceTrip off=0
  if (m === 'slight left')  return 0x03  // symétrique de 0x04
  if (m === 'right')        return 0x0E  // confirmé empirique + voiceTrip
  if (m === 'left')         return 0x0D  // confirmé empirique
  if (m === 'sharp right')  return 0x05
  if (m === 'sharp left')   return 0x06
  if (m === 'uturn')                               return 0x07
  return 0x02
}

async function fetchChunk(chunkPts) {
  const coords  = chunkPts.map(p => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';')
  // 36s entre points (~200m à 20 km/h). Requis par OSRM match.
  const t0      = Math.floor(Date.now() / 1000)
  const ts      = chunkPts.map((_, i) => t0 + i * 36).join(';')
  const radii   = chunkPts.map(() => '20').join(';')  // 50 → "Radius search size too large"
  const url     = `${OSRM}/${coords}?steps=true&overview=false&annotations=false&timestamps=${ts}&radiuses=${radii}&tidy=true`

  const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`OSRM ${resp.status}: ${body.slice(0, 300)}`)
  }
  const data = await resp.json()
  if (data.code !== 'Ok' || !data.matchings?.length) return []

  const steps = []
  for (const matching of data.matchings) {
    for (const leg of matching.legs) {
      for (const step of leg.steps) {
        const m = step.maneuver
        steps.push({
          location: m.location,
          type:     m.type,
          modifier: m.modifier || null,
          exit:     m.exit    || null,
          name:     step.name || '',
          distance: Math.round(step.distance),
        })
      }
    }
  }
  return steps
}

// Retourne [{ptIdx, code, val4, name}] trié par ptIdx.
// onProgress(done, total) appelé après chaque chunk.
export async function matchRoute(pts, dists, onProgress) {
  // Intervalle adaptatif : toujours au moins 30 points (pour les courtes traces),
  // max 200m (pour les longues traces ~100km → ~55 chunks).
  const totalDist = dists[dists.length-1] || 1
  const interval  = Math.min(200, Math.max(20, totalDist / 30))
  const idxs      = sampleIdxs(dists, interval)
  const turnIdxs  = detectTurnIdxs(pts, dists).map(t => t.ptIdx)
  const merged    = [...new Set([...idxs, ...turnIdxs])].sort((a, b) => a - b)
  const sampled   = dedup(merged.map(i => pts[i]))

  // Chunks avec 1 point de recouvrement pour continuité entre chunks.
  const chunks = []
  for (let i = 0; i < sampled.length; i += CHUNK - 1) {
    chunks.push(sampled.slice(i, i + CHUNK))
    if (i + CHUNK >= sampled.length) break
  }

  const seen = new Set()
  const allSteps = []
  console.log(`[OSRM] ${chunks.length} chunks · ${sampled.length} pts · ~${Math.round(interval)}m/pt (dist=${Math.round(totalDist)}m)`)

  for (let c = 0; c < chunks.length; c++) {
    if (onProgress) onProgress(c + 1, chunks.length)
    try {
      const steps = await fetchChunk(chunks[c])
      let added = 0
      for (const s of steps) {
        const key = `${s.location[0].toFixed(5)},${s.location[1].toFixed(5)},${s.type}`
        if (!seen.has(key)) { seen.add(key); allSteps.push(s); added++ }
      }
      console.log(`[OSRM] ✓ chunk ${c+1}/${chunks.length} — ${steps.length} steps (+${added} nouveaux)`)
    } catch (e) {
      const reason = e.message.includes('NoSegment') ? 'hors réseau routier' : e.message.slice(0, 60)
      console.warn(`[OSRM] ✗ chunk ${c+1}/${chunks.length} — ${reason}`)
    }
    if (c < chunks.length - 1) await new Promise(r => setTimeout(r, RATE_MS))
  }

  // depart/arrive de chaque leg OSRM sont du bruit (encodeTinfoNav génère les siens).
  const result = allSteps
    .filter(s => s.type !== 'depart' && s.type !== 'arrive')
    .map(s => ({
      ptIdx: nearestPt(s.location[0], s.location[1], pts),
      code:  toCode(s.type, s.modifier, s.exit),
      val4:  s.distance,
      name:  s.name,
      _osrm: `${s.type}/${s.modifier || '—'}`,
    }))
    .sort((a, b) => a.ptIdx - b.ptIdx)
  // Table de débogage : OSRM type+modifier → code Bryton encodé → à comparer avec l'appareil
  console.table(result.map(s => ({
    ptIdx: s.ptIdx,
    osrm:  s._osrm,
    code:  `0x${s.code.toString(16).padStart(2,'0').toUpperCase()}`,
    dist:  s.val4 + 'm',
    rue:   s.name || '—',
  })))

  const cnt = code => result.filter(s => s.code === code).length
  const rpt = cnt(0xD2)+cnt(0xD3)+cnt(0xD4)
  console.log(
    `[OSRM] résultat : ${result.length} virages` +
    ` — ↻ droite ${cnt(0x0E)}  ↺ gauche ${cnt(0x0D)}  → tout droit ${cnt(0x02)}` +
    (cnt(0x03)+cnt(0x04) ? `  ± léger ${cnt(0x03)+cnt(0x04)}` : '') +
    (rpt       ? `  ⟳ rond-pt ${rpt}` : '') +
    (cnt(0x06) ? `  ⑂ bifurc. ${cnt(0x06)}` : '')
  )
  return result
}
