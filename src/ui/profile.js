import { detectClimbs } from '../climbs.js'
import { calcClimb } from '../geo.js'

export function drawProfile(pts, dists, manualClimbs, dragS, dragE, climbStartPt) {
  const svg = document.getElementById('profileSvg')
  const W = 1000, H = 110, PX = 10, PY = 10
  const eles = pts.map(p => p[2]).filter(e => e != null)
  if (!eles.length) { svg.innerHTML = ''; return }
  const eMin = Math.min(...eles), eRange = Math.max(...eles) - eMin || 1
  const tDist = dists[dists.length-1]
  const xOf = d => (d/tDist)*(W-PX*2)+PX
  const yOf = e => H-PY-((e-eMin)/eRange)*(H-PY*2)

  let path = ''
  for (let i = 0; i < pts.length; i++) {
    if (pts[i][2] == null) continue
    path += (path ? 'L' : 'M') + xOf(dists[i]).toFixed(1) + ',' + yOf(pts[i][2]).toFixed(1)
  }
  const lastX = xOf(tDist).toFixed(1)
  path += ` L${lastX},${H-PY} L${PX},${H-PY} Z`

  const autoClimbs = detectClimbs(pts, dists)
  const bands = autoClimbs.map(c => {
    const x1 = xOf(dists[c.startPt]), x2 = xOf(dists[c.endPt]), xm = ((x1+x2)/2).toFixed(1)
    return `<rect x="${x1.toFixed(1)}" y="${PY}" width="${(x2-x1).toFixed(1)}" height="${H-PY*2}" fill="rgba(0,212,170,.18)" stroke="var(--accent)" stroke-width="1"/>
            <text x="${xm}" y="${PY-2}" text-anchor="middle" font-size="14" fill="var(--accent)">${(c.grade*100).toFixed(1)}%</text>`
  }).join('')

  const HANDLE = 6
  const mBands = manualClimbs.map((c, i) => {
    const x1 = xOf(dists[c.startPt]), x2 = xOf(dists[c.endPt]), xm = ((x1+x2)/2).toFixed(1)
    return `<rect x="${x1.toFixed(1)}" y="${PY}" width="${(x2-x1).toFixed(1)}" height="${H-PY*2}" fill="rgba(255,107,53,.22)" stroke="var(--accent2)" stroke-width="1.5"/>
            <text x="${xm}" y="${PY-2}" text-anchor="middle" font-size="14" fill="var(--accent2)">${(c.grade*100).toFixed(1)}% M${i+1}</text>
            <rect class="drag-handle" data-idx="${i}" data-edge="s" x="${(x1-HANDLE/2).toFixed(1)}" y="${PY}" width="${HANDLE}" height="${H-PY*2}" fill="var(--accent2)" opacity=".5" style="cursor:ew-resize"/>
            <rect class="drag-handle" data-idx="${i}" data-edge="e" x="${(x2-HANDLE/2).toFixed(1)}" y="${PY}" width="${HANDLE}" height="${H-PY*2}" fill="var(--accent2)" opacity=".5" style="cursor:ew-resize"/>`
  }).join('')

  const drag = (dragS != null && dragE != null)
    ? `<rect x="${xOf(dists[dragS]).toFixed(1)}" y="${PY}" width="${(xOf(dists[dragE])-xOf(dists[dragS])).toFixed(1)}" height="${H-PY*2}" fill="rgba(255,107,53,.35)" stroke="var(--accent2)" stroke-width="1.5"/>`
    : (climbStartPt != null
      ? `<line x1="${xOf(dists[climbStartPt]).toFixed(1)}" y1="${PY}" x2="${xOf(dists[climbStartPt]).toFixed(1)}" y2="${H-PY}" stroke="white" stroke-width="1.5" stroke-dasharray="4,3"/>`
      : '')

  svg.innerHTML = `${bands}${mBands}<path d="${path}" fill="rgba(0,212,170,.12)" stroke="var(--accent)" stroke-width="1.5"/>${drag}`
}

export function updateManualClimbList(manualClimbs, dists, onRemove) {
  const div = document.getElementById('manualClimbList')
  if (!manualClimbs.length) { div.innerHTML = ''; return }
  div.innerHTML = manualClimbs.map((c, i) => `
    <div class="manual-climb-row">
      <span style="color:var(--accent2)">M${i+1}</span>
      <span style="color:var(--muted);margin:0 6px;">${(dists[c.startPt]/1000).toFixed(1)}→${(dists[c.endPt]/1000).toFixed(1)}km</span>
      <span style="color:var(--text)">+${Math.round(c.gain)}m</span>
      <span style="color:var(--accent2);margin:0 6px;font-weight:600;">${(c.grade*100).toFixed(1)}%</span>
      <span style="color:var(--muted)">${(c.length/1000).toFixed(1)}km</span>
      <button onclick="(${onRemove})(${i})">✕</button>
    </div>`).join('')
}

export function ptIdxAtClientX(clientX, dists) {
  const rect = document.getElementById('profileSvg').getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX-rect.left)/rect.width))
  const d = ratio * dists[dists.length-1]
  let best = 0
  for (let i = 1; i < dists.length; i++)
    if (Math.abs(dists[i]-d) < Math.abs(dists[best]-d)) best = i
  return best
}

export function initProfileInteractions(getState, setState) {
  const svg = document.getElementById('profileSvg')
  const addBtn = document.getElementById('addClimbBtn')

  addBtn.addEventListener('click', () => {
    const { pts, dists } = getState()
    if (!pts || !dists) return
    const adding = !getState().addingClimb
    setState({ addingClimb: adding, climbStartPt: null })
    addBtn.textContent = adding ? '✕ Annuler' : '＋ Montée'
    svg.classList.toggle('adding', adding)
    document.getElementById('profileHint').textContent = adding ? 'Clic 1 = début de montée' : ''
    const s = getState()
    drawProfile(s.pts, s.dists, s.manualClimbs, null, null, null)
  })

  svg.addEventListener('mousedown', e => {
    const s = getState()
    if (s.addingClimb) {
      e.preventDefault()
      setState({ climbStartPt: ptIdxAtClientX(e.clientX, s.dists) })
      document.getElementById('profileHint').textContent = 'Glisser jusqu\'à la fin de la montée…'
      drawProfile(s.pts, s.dists, s.manualClimbs, null, null, getState().climbStartPt)
      return
    }
    const h = e.target.closest('.drag-handle')
    if (!h) return
    e.preventDefault()
    setState({ editHandle: { idx: +h.dataset.idx, edge: h.dataset.edge } })
  })

  svg.addEventListener('mousemove', e => {
    const s = getState()
    if (s.addingClimb && s.climbStartPt != null) {
      const cur = ptIdxAtClientX(e.clientX, s.dists)
      drawProfile(s.pts, s.dists, s.manualClimbs, Math.min(s.climbStartPt, cur), Math.max(s.climbStartPt, cur), null)
      return
    }
    if (s.editHandle) {
      const pt = ptIdxAtClientX(e.clientX, s.dists)
      const climbs = [...s.manualClimbs]
      const c = { ...climbs[s.editHandle.idx] }
      if (s.editHandle.edge === 's') c.startPt = Math.min(pt, c.endPt-10)
      else                           c.endPt   = Math.max(pt, c.startPt+10)
      c.start  = s.dists[c.startPt]
      c.length = s.dists[c.endPt] - s.dists[c.startPt]
      c.gain   = Math.max(0, calcClimb(s.pts.slice(c.startPt, c.endPt+1)).up)
      c.grade  = c.gain / Math.max(1, c.length)
      climbs[s.editHandle.idx] = c
      setState({ manualClimbs: climbs })
      drawProfile(s.pts, s.dists, climbs, null, null, null)
    }
  })

  svg.addEventListener('mouseup', e => {
    const s = getState()
    if (s.addingClimb && s.climbStartPt != null) {
      const en = ptIdxAtClientX(e.clientX, s.dists)
      const start = Math.min(s.climbStartPt, en), end = Math.max(s.climbStartPt, en)
      if (end > start) {
        const gain = Math.max(0, calcClimb(s.pts.slice(start, end+1)).up)
        const length = s.dists[end] - s.dists[start]
        const climbs = [...s.manualClimbs, { startPt: start, endPt: end, start: s.dists[start], length, gain, grade: gain/Math.max(1, length) }]
        setState({ manualClimbs: climbs, addingClimb: false, climbStartPt: null })
        document.getElementById('addClimbBtn').textContent = '＋ Montée'
        svg.classList.remove('adding')
        document.getElementById('profileHint').textContent = ''
        const ns = getState()
        updateManualClimbList(ns.manualClimbs, ns.dists, i => {
          const c2 = [...getState().manualClimbs]; c2.splice(i, 1)
          setState({ manualClimbs: c2 })
          const s2 = getState()
          drawProfile(s2.pts, s2.dists, s2.manualClimbs, null, null, null)
          updateManualClimbList(s2.manualClimbs, s2.dists, () => {})
        })
        drawProfile(ns.pts, ns.dists, ns.manualClimbs, null, null, null)
      } else {
        setState({ addingClimb: false, climbStartPt: null })
        const ns = getState()
        drawProfile(ns.pts, ns.dists, ns.manualClimbs, null, null, null)
      }
      return
    }
    if (s.editHandle) {
      setState({ editHandle: null })
      const ns = getState()
      updateManualClimbList(ns.manualClimbs, ns.dists, () => {})
    }
  })
}
