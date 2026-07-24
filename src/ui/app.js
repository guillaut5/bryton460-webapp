import JSZip from 'jszip'
import { parseGPX } from '../gpx.js'
import { hav, totalDist, calcClimb, buildDists, densify } from '../geo.js'
import { applySimp } from '../simplify.js'
import { detectClimbs } from '../climbs.js'
import { computeGrades, encodeTrack } from '../encoders/track.js'
import { encodeSmy } from '../encoders/smy.js'
import { encodeTinfo, encodeTinfoNav } from '../encoders/tinfo.js'
import { matchRoute } from '../api/osrm.js'
import { encodeJunc } from '../encoders/junc.js'
import { encodeSortPath } from '../encoders/path.js'
import { fetchElevations } from '../api/elevation.js'
import { supportsFS, findBrytonDrive, writeFilesToDir } from './transfer.js'
import { drawProfile, updateManualClimbList, initProfileInteractions } from './profile.js'
import { drawRoutePreview } from './routePreview.js'

const $ = id => document.getElementById(id)

// __APP_VERSION__ injecté au build par Vite depuis package.json (vite.config.js) —
// seule source de vérité, jamais écrit en dur ailleurs.
$('appVersion').textContent = 'v' + __APP_VERSION__

// Écart max toléré entre deux points consécutifs du .track (m) — au-delà, densify()
// interpole des points intermédiaires. Voir geo.js pour le pourquoi.
const MAX_TRACK_GAP_M = 30

// ── État global ──────────────────────────────────────────────────────────────
const state = {
  // Données brutes du GPX chargé (avant simplification)
  parsedPoints: null,   // [lat, lon, ele][] — sortie de parseGPX
  gpxName: null,        // nom du fichier sans extension → nom de la route Bryton

  // Résultat de la dernière conversion (bouton Convertir)
  generatedFiles: null, // [{name, files: Map<filename, ArrayBuffer>}][] — une entrée par sens de parcours (aller [+ retour])
  zipBlob: null,        // Blob du .zip téléchargeable

  // Points actifs après simplification + distances cumulées
  pts: null,            // [lat, lon, ele][] — envoyés aux encodeurs
  dists: null,          // distances cumulées en mètres, dists[0]=0

  // Mode de simplification sélectionné dans l'UI
  simpMode: 'none',     // 'none' | 'rdp' | 'step' | 'max'

  // Montées manuelles dessinées sur le profil
  manualClimbs: [],     // {startPt, endPt, start, length, gain, grade}[]

  // État de l'interaction "ajouter une montée" sur le SVG
  addingClimb: false,   // true = mode dessin actif (curseur crosshair)
  climbStartPt: null,   // ptIdx du premier clic (en attente du mouseup)
  editHandle: null,     // {idx, edge:'s'|'e'} — handle de drag en cours
}
const getState = () => state
const setState = patch => Object.assign(state, patch)

// ── Simplification UI ────────────────────────────────────────────────────────
function updatePreview() {
  if (!state.parsedPoints) { $('previewLabel').textContent = '— points encodés'; return }
  const out = applySimp(state.parsedPoints, { mode: state.simpMode, rdpEps: parseFloat($('rdpSlider').value), step: parseInt($('stepSlider').value), maxPts: parseInt($('maxPts').value)||99999 })
  const pct = Math.round(out.length/state.parsedPoints.length*100)
  $('previewFill').style.width = pct + '%'
  $('previewLabel').textContent = `${state.parsedPoints.length.toLocaleString('fr')} pts → ${out.length.toLocaleString('fr')} encodés (${pct}%)`
}

document.querySelectorAll('.tgl').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tgl').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    setState({ simpMode: btn.dataset.mode })
    document.querySelectorAll('.simp-detail').forEach(d => d.classList.remove('visible'))
    if (state.simpMode !== 'none') $('detail-' + state.simpMode).classList.add('visible')
    updatePreview()
  })
})
$('rdpSlider').addEventListener('input', () => { $('rdpVal').textContent = $('rdpSlider').value + ' m'; updatePreview() })
$('stepSlider').addEventListener('input', () => { $('stepVal').textContent = '1/' + $('stepSlider').value; updatePreview() })
$('maxPts').addEventListener('input', updatePreview)

// ── Drag & drop ──────────────────────────────────────────────────────────────
const dragToggle = on => $('dropZone').classList.toggle('drag-over', on)
$('dropZone').addEventListener('dragover', e => { e.preventDefault(); dragToggle(true) })
$('dropZone').addEventListener('dragleave', () => dragToggle(false))
$('dropZone').addEventListener('drop', e => { e.preventDefault(); dragToggle(false); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]) })
$('fileInput').addEventListener('change', () => { if ($('fileInput').files[0]) loadFile($('fileInput').files[0]) })

// ── Erreur ───────────────────────────────────────────────────────────────────
const showErr = m => { $('errBox').textContent = m; $('errBox').classList.add('visible') }
const clearErr = () => $('errBox').classList.remove('visible')

// ── Chargement GPX ───────────────────────────────────────────────────────────
function loadFile(file) {
  clearErr()
  $('stats').classList.remove('visible')
  $('profileCard').classList.remove('visible')
  $('routePreviewCard').classList.remove('visible')
  $('manualClimbList').innerHTML = ''
  $('profileHint').textContent = ''
  $('addClimbBtn').textContent = '＋ Montée'
  $('profileSvg').classList.remove('adding')
  setState({ parsedPoints: null, manualClimbs: [], addingClimb: false, climbStartPt: null, pts: null, dists: null })
  $('convertBtn').disabled = true

  if (!file.name.toLowerCase().endsWith('.gpx')) { showErr('Fichier .gpx requis'); return }
  const r = new FileReader()
  r.onload = e => {
    try {
      const { pts, gpxName } = parseGPX(e.target.result)
      setState({ parsedPoints: pts, gpxName })
      const dists = buildDists(pts)
      const hasEle = pts.some(p => p[2] != null)
      const climbs = detectClimbs(pts, dists)

      $('s-name').textContent = file.name
      $('s-pts').textContent = pts.length.toLocaleString('fr')
      $('s-dist').textContent = (totalDist(pts)/1000).toFixed(2) + ' km'
      $('routePreviewCard').classList.add('visible')
      drawRoutePreview(pts)
      if (hasEle) {
        const eles = pts.filter(p => p[2] != null).map(p => p[2])
        const { up, dn } = calcClimb(pts)
        $('s-ele').textContent = `${Math.min(...eles).toFixed(0)}–${Math.max(...eles).toFixed(0)} m`
        $('s-ele').className = 'sv'
        $('s-dplus').textContent = `D+ ${up} m  /  D− ${dn} m`
        $('s-dplus').className = 'sv'
        $('s-climbs').textContent = climbs.length ? climbs.length + ' détectée(s)' : 'aucune (D+ < 100m et pente < 3%)'
        $('fetchEleBtn').style.display = 'none'
        setState({ pts, dists })
        drawProfile(pts, dists, [], null, null, null)
        $('profileCard').classList.add('visible')
      } else {
        $('s-ele').textContent = 'absent — '; $('s-ele').className = 'sv warn'
        $('s-dplus').textContent = '—'; $('s-dplus').className = 'sv warn'
        $('s-climbs').textContent = '—'
        $('fetchEleBtn').style.display = 'inline-block'
      }
      if (!$('routeName').value) {
        $('routeName').value = file.name.replace(/\.gpx$/i, '_mytool').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40)
      }
      $('stats').classList.add('visible')
      $('convertBtn').disabled = false
      updatePreview()
    } catch (err) { showErr(err.message) }
  }
  r.readAsText(file)
}

// ── Fetch élévation SRTM ─────────────────────────────────────────────────────
$('fetchEleBtn').addEventListener('click', async () => {
  const btn = $('fetchEleBtn')
  btn.disabled = true; btn.textContent = '⏳ Téléchargement…'
  try {
    const eles = await fetchElevations(state.parsedPoints)
    if (!eles.filter(e => e != null).length) throw new Error('API indisponible')
    // Points sans élévation même après retries : on tient la dernière altitude connue
    // constante plutôt que de laisser un trou (0m plat → fausses alertes "hors itinéraire"
    // sur le device, qui compare la position GPS en 3D aux points du .track).
    let lastKnown = null, missing = 0
    const filled = eles.map(e => {
      if (e != null) { lastKnown = e; return e }
      missing++
      return lastKnown // reste null si aucune valeur connue avant (comblé au 2e passage ci-dessous)
    })
    if (filled[0] == null) {
      const firstKnown = filled.find(e => e != null)
      for (let i = 0; i < filled.length && filled[i] == null; i++) filled[i] = firstKnown
    }
    const pts = state.parsedPoints.map((p, i) => [p[0], p[1], filled[i] ?? p[2]])
    const dists = buildDists(pts)
    const climbs = detectClimbs(pts, dists)
    const eles2 = pts.map(p => p[2]).filter(e => e != null)
    const { up, dn } = calcClimb(pts)
    $('s-ele').textContent = `${Math.min(...eles2).toFixed(0)}–${Math.max(...eles2).toFixed(0)} m (SRTM)`
    $('s-ele').className = 'sv'
    $('s-dplus').textContent = `D+ ${up} m  /  D− ${dn} m`
    $('s-dplus').className = 'sv'
    $('s-climbs').textContent = climbs.length ? climbs.length + ' détectée(s)' : 'aucune'
    if (missing) {
      const pct = Math.round(missing / eles.length * 100)
      showErr(`⚠ Élévation manquante sur ${missing} points (${pct}%) — comblée avec la dernière altitude connue (constante). D+/D− et le profil sont approximatifs sur ces sections.`)
    }
    setState({ parsedPoints: pts, pts, dists })
    drawProfile(pts, dists, state.manualClimbs, null, null, null)
    $('profileCard').classList.add('visible')
    btn.style.display = 'none'
  } catch (e) {
    btn.disabled = false; btn.textContent = '⬇ Récupérer élévation SRTM'
    $('s-ele').textContent = 'Erreur API : ' + e.message; $('s-ele').className = 'sv warn'
  }
})

// ── Profil interactions ──────────────────────────────────────────────────────
initProfileInteractions(getState, setState)

// Construit tous les fichiers d'une route (un sens de parcours) à partir de pts/montées.
// Réutilisé pour le sens aller et, si demandé, le sens inverse (voir reverseChk).
async function buildRouteFiles(pts, manualClimbs, useOsrm, osrmStatusEl) {
  const dists = buildDists(pts)
  const autoClimbs = detectClimbs(pts, dists)
  const climbs = [...autoClimbs, ...manualClimbs].sort((a, b) => a.start - b.start)
  const { up, dn } = calcClimb(pts)
  const distKm = (totalDist(pts)/1000).toFixed(2)
  const hasEle = pts.some(p => p[2] != null)

  const grades   = computeGrades(pts, dists)
  const trackBuf = encodeTrack(pts, grades)
  const smyBuf   = encodeSmy(pts, climbs)
  const pathBuf  = encodeSortPath(pts)
  const juncBuf  = encodeJunc(null, pts, dists)

  let tinfoBuf, tinfoLabel
  if (useOsrm) {
    if (osrmStatusEl) osrmStatusEl.textContent = 'OSRM : connexion…'
    try {
      const steps = await matchRoute(pts, dists, (done, total) => {
        if (osrmStatusEl) osrmStatusEl.textContent = `OSRM : chunk ${done}/${total}…`
      })
      if (steps.length > 0) {
        tinfoBuf  = encodeTinfoNav(steps, Math.round(totalDist(pts)), climbs, pts.length)
        const cnt = c => steps.filter(s => s.code === c).length
        const rpt = cnt(0xD2)+cnt(0xD3)+cnt(0xD4)
        tinfoLabel = `${steps.length} virages nav`
        if (climbs.length) tinfoLabel += ` · ${climbs.length} montées`
        if (osrmStatusEl) osrmStatusEl.textContent =
          `✓ ${steps.length} virages — ` +
          `↻ droite ${cnt(0x0E)}  ↺ gauche ${cnt(0x0D)}  → tout droit ${cnt(0x02)}` +
          (cnt(0x03)+cnt(0x04) ? `  ± léger ${cnt(0x03)+cnt(0x04)}` : '') +
          (rpt       ? `  ⟳ rond-pt ${rpt}` : '')
      } else {
        if (osrmStatusEl) osrmStatusEl.textContent = `⚠ OSRM : aucune instruction — fallback montées seules`
        tinfoBuf  = encodeTinfo(climbs)
        tinfoLabel = climbs.length ? climbs.length + ' montées indexées' : 'vide'
      }
    } catch (e) {
      if (osrmStatusEl) osrmStatusEl.textContent = `⚠ OSRM indisponible — fallback montées seules`
      tinfoBuf  = encodeTinfo(climbs)
      tinfoLabel = climbs.length ? climbs.length + ' montées indexées' : 'vide'
    }
  } else {
    if (osrmStatusEl) osrmStatusEl.textContent = ''
    tinfoBuf  = encodeTinfo(climbs)
    tinfoLabel = climbs.length ? climbs.length + ' montées indexées' : 'vide'
  }

  return { trackBuf, smyBuf, pathBuf, juncBuf, tinfoBuf, tinfoLabel, climbs, up, dn, distKm, hasEle, nPts: pts.length }
}

// Inverse l'ordre des points et remappe les montées manuelles (startPt/endPt) en conséquence.
// Tout le reste (pente, D+/D-, virages OSRM, jonctions, montées auto) est recalculé de zéro
// par buildRouteFiles sur la trace inversée — pas un simple flip d'octets, voir discussion.
function reverseRoute(pts, manualClimbs) {
  const n = pts.length
  return {
    pts: pts.slice().reverse(),
    manualClimbs: manualClimbs.map(c => ({ ...c, startPt: n-1-c.endPt, endPt: n-1-c.startPt })),
  }
}

function addRouteToZip(zip, name, r) {
  zip.file(`${name}.smy`, r.smyBuf)
  zip.file(`${name}.tinfo`, r.tinfoBuf)
  zip.file(`${name}.track`, r.trackBuf)
  const dir = zip.folder(name)
  dir.file('dupli.track', r.trackBuf)
  dir.file('list.junc', r.juncBuf)
  dir.file('list2.junc', r.juncBuf)
  dir.file('sort1.path', r.pathBuf)
}

function fileTreeHtml(name, r) {
  const fmt = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(2) + ' MB'
  const eleStr = r.hasEle ? ` · D+ ${r.up}m D− ${r.dn}m` : ' · sans élévation'
  return `
<span class="dir">📁 Tracks\\</span>
<br><span class="file">  ├ ${name}.smy</span><span class="fsize">${fmt(r.smyBuf.byteLength)}</span>
<br><span class="file">  ├ ${name}.tinfo</span><span class="fsize">${fmt(r.tinfoBuf.byteLength)} · ${r.tinfoLabel}</span>
<br><span class="file">  ├ ${name}.track</span><span class="fsize">${fmt(r.trackBuf.byteLength)} · ${r.nPts.toLocaleString('fr')} pts · ${r.distKm} km${eleStr}</span>
<br><span class="dir">  └ 📁 ${name}\\</span>
<br><span class="file">        ├ dupli.track</span><span class="fsize">${fmt(r.trackBuf.byteLength)}</span>
<br><span class="file">        ├ list.junc</span><span class="fsize">${fmt(r.juncBuf.byteLength)} · ${Math.floor(r.juncBuf.byteLength/12)} intersections</span>
<br><span class="file">        ├ list2.junc</span><span class="fsize">${fmt(r.juncBuf.byteLength)}</span>
<br><span class="file">        └ sort1.path</span><span class="fsize">${fmt(r.pathBuf.byteLength)}</span>`
}

// ── Conversion ───────────────────────────────────────────────────────────────
$('convertBtn').addEventListener('click', async () => {
  if (!state.parsedPoints) return
  clearErr()
  $('convertBtn').disabled = true; $('convertBtn').textContent = 'Génération…'

  const name = ($('routeName').value.trim() || 'route').replace(/[^a-zA-Z0-9_\-]/g, '_')
  const simplified = applySimp(state.parsedPoints, { mode: state.simpMode, rdpEps: parseFloat($('rdpSlider').value), step: parseInt($('stepSlider').value), maxPts: parseInt($('maxPts').value)||99999 })
  const pts = densify(simplified, MAX_TRACK_GAP_M)
  const useOsrm = $('osrmChk').checked

  const fwd = await buildRouteFiles(pts, state.manualClimbs, useOsrm, $('osrmStatus'))

  const zip = new JSZip()
  addRouteToZip(zip, name, fwd)
  const routes = [{ name, files: {
    [name+'.smy']: fwd.smyBuf, [name+'.tinfo']: fwd.tinfoBuf, [name+'.track']: fwd.trackBuf,
    'dupli.track': fwd.trackBuf, 'list.junc': fwd.juncBuf, 'list2.junc': fwd.juncBuf, 'sort1.path': fwd.pathBuf,
  }}]
  let fileTree = fileTreeHtml(name, fwd)

  if ($('reverseChk').checked) {
    const revName = name + '_reverse'
    const { pts: revPts, manualClimbs: revManualClimbs } = reverseRoute(pts, state.manualClimbs)
    const rev = await buildRouteFiles(revPts, revManualClimbs, useOsrm, $('osrmStatus'))
    addRouteToZip(zip, revName, rev)
    routes.push({ name: revName, files: {
      [revName+'.smy']: rev.smyBuf, [revName+'.tinfo']: rev.tinfoBuf, [revName+'.track']: rev.trackBuf,
      'dupli.track': rev.trackBuf, 'list.junc': rev.juncBuf, 'list2.junc': rev.juncBuf, 'sort1.path': rev.pathBuf,
    }})
    fileTree += '<br><br>' + fileTreeHtml(revName, rev)
  }

  setState({ generatedFiles: routes })

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  setState({ zipBlob })

  $('fileTree').innerHTML = fileTree

  if (fwd.climbs.length) {
    $('climbList').innerHTML = fwd.climbs.map((c, i) => `
      <div class="climb-item">
        <span>#${i+1}</span><strong>${(c.start/1000).toFixed(1)} km</strong>
        <span>${(c.length/1000).toFixed(1)} km</span><strong>D+ ${c.gain.toFixed(0)} m</strong>
        <span>${(c.grade*100).toFixed(1)}%</span>
      </div>`).join('')
    $('climbSummary').style.display = 'block'
  } else {
    $('climbSummary').style.display = 'none'
  }

  $('transferBtn').disabled = !supportsFS
  if (!supportsFS) $('transferNote').textContent = 'Transfert direct non disponible (requiert Chrome/Edge récent).'
  $('outputCard').classList.add('visible')
  $('outputCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  $('convertBtn').textContent = 'Convertir'
  $('convertBtn').disabled = false
})

// ── Téléchargement ───────────────────────────────────────────────────────────
$('dlBtn').addEventListener('click', () => {
  if (!state.zipBlob) return
  const name = ($('routeName').value.trim() || 'route').replace(/[^a-zA-Z0-9_\-]/g, '_')
  const url = URL.createObjectURL(state.zipBlob)
  const a = document.createElement('a'); a.href = url; a.download = name + '_bryton.zip'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
})

// ── Transfert USB ────────────────────────────────────────────────────────────
$('transferBtn').addEventListener('click', async () => {
  if (!state.generatedFiles?.length) return
  const st = $('transferStatus')
  st.className = 'transfer-status'; st.textContent = ''
  $('transferBtn').disabled = true; $('transferBtn').textContent = '⏳ Sélectionner le lecteur Bryton…'
  try {
    const rootDir = await findBrytonDrive()
    if (!rootDir) { $('transferBtn').textContent = '⚡ Copier directement sur le Bryton (USB)'; $('transferBtn').disabled = false; return }
    for (const { name, files } of state.generatedFiles) {
      $('transferBtn').textContent = `⏳ Copie de "${name}"…`
      await writeFilesToDir(rootDir, name, files)
    }
    st.className = 'transfer-status ok'
    const names = state.generatedFiles.map(r => `"${r.name}"`).join(' et ')
    st.textContent = `✓ Route${state.generatedFiles.length > 1 ? 's' : ''} ${names} copiée${state.generatedFiles.length > 1 ? 's' : ''} dans Tracks\\ — débrancher proprement puis Menu → Itinéraires.`
  } catch (e) {
    st.className = 'transfer-status err'; st.textContent = 'Erreur : ' + e.message
  }
  $('transferBtn').textContent = '⚡ Copier directement sur le Bryton (USB)'; $('transferBtn').disabled = false
})
