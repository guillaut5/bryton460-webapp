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
//   - échantillon à 200m → ~55 chunks pour 100km (~60s)
//   - déduplication des points < 15m (oscillations GPS)
//   - timestamps à 36s/pt (~20 km/h sur 200m)
//   - radiuses=20m
// ════════════════════════════════════════════════════════════════

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
function toCode(type, modifier, exit) {
  if (type === 'depart')  return 0x01
  if (type === 'arrive')  return 0x21
  if (type === 'roundabout' || type === 'rotary') {
    if (exit === 1) return 0xD2
    if (exit === 2) return 0xD3
    return 0xD4
  }
  if (type === 'fork' || type === 'end of road') return 0x06
  const m = modifier || 'straight'
  if (m === 'straight')                            return 0x02
  if (m === 'slight right' || m === 'slight left') return 0x03
  if (m === 'right')                               return 0x0D
  if (m === 'left')                                return 0x0E
  if (m === 'sharp right' || m === 'sharp left')   return 0x05
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
  const idxs    = sampleIdxs(dists, 200)  // 200m → ~55 chunks pour 100km
  const sampled = dedup(idxs.map(i => pts[i]))

  // Chunks avec 1 point de recouvrement pour continuité entre chunks.
  const chunks = []
  for (let i = 0; i < sampled.length; i += CHUNK - 1) {
    chunks.push(sampled.slice(i, i + CHUNK))
    if (i + CHUNK >= sampled.length) break
  }

  const seen = new Set()
  const allSteps = []
  console.log(`[OSRM] ${chunks.length} chunks · ${sampled.length} pts · 200m/pt`)

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

  const result = allSteps
    .map(s => ({
      ptIdx: nearestPt(s.location[0], s.location[1], pts),
      code:  toCode(s.type, s.modifier, s.exit),
      val4:  s.distance,
      name:  s.name,
    }))
    .sort((a, b) => a.ptIdx - b.ptIdx)
  const cnt = code => result.filter(s => s.code === code).length
  const nav = result.filter(s => s.code !== 0x01 && s.code !== 0x21)
  console.log(
    `[OSRM] résultat : ${result.length} steps bruts → ${nav.length} virages encodés\n` +
    `        ↻ droite ${cnt(0x0D)}  ↺ gauche ${cnt(0x0E)}  → tout droit ${cnt(0x02)}  ` +
    `± léger ${cnt(0x03)}  ⟳ rond-pt ${cnt(0xD2)+cnt(0xD3)+cnt(0xD4)}  ` +
    `[départ ${cnt(0x01)}  arrivée ${cnt(0x21)}  autre ${nav.length - cnt(0x02)-cnt(0x03)-cnt(0x0D)-cnt(0x0E)-cnt(0x05)-cnt(0x06)-cnt(0xD2)-cnt(0xD3)-cnt(0xD4)}]`
  )
  return result
}
