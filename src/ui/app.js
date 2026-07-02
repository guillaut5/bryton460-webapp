import JSZip from 'jszip'
import { parseGPX } from '../gpx.js'
import { hav, totalDist, calcClimb, buildDists } from '../geo.js'
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

const $ = id => document.getElementById(id)

// ── État global ──────────────────────────────────────────────────────────────
const state = {
  // Données brutes du GPX chargé (avant simplification)
  parsedPoints: null,   // [lat, lon, ele][] — sortie de parseGPX
  gpxName: null,        // nom du fichier sans extension → nom de la route Bryton

  // Résultat de la dernière conversion (bouton Convertir)
  generatedFiles: null, // Map<filename, ArrayBuffer> prête à zipper
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
    const pts = state.parsedPoints.map((p, i) => [p[0], p[1], eles[i] ?? p[2]])
    const dists = buildDists(pts)
    const climbs = detectClimbs(pts, dists)
    const eles2 = pts.map(p => p[2]).filter(e => e != null)
    const { up, dn } = calcClimb(pts)
    $('s-ele').textContent = `${Math.min(...eles2).toFixed(0)}–${Math.max(...eles2).toFixed(0)} m (SRTM)`
    $('s-ele').className = 'sv'
    $('s-dplus').textContent = `D+ ${up} m  /  D− ${dn} m`
    $('s-dplus').className = 'sv'
    $('s-climbs').textContent = climbs.length ? climbs.length + ' détectée(s)' : 'aucune'
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

// ── Conversion ───────────────────────────────────────────────────────────────
$('convertBtn').addEventListener('click', async () => {
  if (!state.parsedPoints) return
  clearErr()
  $('convertBtn').disabled = true; $('convertBtn').textContent = 'Génération…'

  const name = ($('routeName').value.trim() || 'route').replace(/[^a-zA-Z0-9_\-]/g, '_')
  const pts = applySimp(state.parsedPoints, { mode: state.simpMode, rdpEps: parseFloat($('rdpSlider').value), step: parseInt($('stepSlider').value), maxPts: parseInt($('maxPts').value)||99999 })
  const dists = buildDists(pts)
  const autoClimbs = detectClimbs(pts, dists)
  const climbs = [...autoClimbs, ...state.manualClimbs].sort((a, b) => a.start - b.start)
  const { up, dn } = calcClimb(pts)
  const distKm = (totalDist(pts)/1000).toFixed(2)
  const hasEle = pts.some(p => p[2] != null)

  const grades   = computeGrades(pts, dists)
  const trackBuf = encodeTrack(pts, grades)
  const smyBuf   = encodeSmy(pts, climbs)
  const pathBuf  = encodeSortPath(pts)
  const juncBuf  = encodeJunc(null, pts, dists)

  let tinfoBuf
  if ($('osrmChk').checked) {
    const osrmStatus = $('osrmStatus')
    osrmStatus.textContent = 'OSRM : connexion…'
    try {
      const steps = await matchRoute(pts, dists, (done, total) => {
        osrmStatus.textContent = `OSRM : chunk ${done}/${total}…`
      })
      if (steps.length > 0) {
        tinfoBuf = encodeTinfoNav(steps, Math.round(totalDist(pts)), climbs, pts.length)
        osrmStatus.textContent = `✓ ${steps.length} instructions de navigation`
      } else {
        osrmStatus.textContent = `⚠ OSRM : aucune instruction reçue — fallback montées seules`
        tinfoBuf = encodeTinfo(climbs)
      }
    } catch (e) {
      osrmStatus.textContent = `⚠ OSRM indisponible — fallback montées seules`
      tinfoBuf = encodeTinfo(climbs)
    }
  } else {
    $('osrmStatus').textContent = ''
    tinfoBuf = encodeTinfo(climbs)
  }

  const generatedFiles = {
    [name+'.smy']:   smyBuf,
    [name+'.tinfo']: tinfoBuf,
    [name+'.track']: trackBuf,
    'dupli.track':   trackBuf,
    'list.junc':     juncBuf,
    'list2.junc':    juncBuf,
    'sort1.path':    pathBuf,
  }
  setState({ generatedFiles })

  const zip = new JSZip()
  zip.file(`${name}.smy`, smyBuf)
  zip.file(`${name}.tinfo`, tinfoBuf)
  zip.file(`${name}.track`, trackBuf)
  const dir = zip.folder(name)
  dir.file('dupli.track', trackBuf)
  dir.file('list.junc', juncBuf)
  dir.file('list2.junc', juncBuf)
  dir.file('sort1.path', pathBuf)
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  setState({ zipBlob })

  const fmt = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(2) + ' MB'
  const eleStr = hasEle ? ` · D+ ${up}m D− ${dn}m` : ' · sans élévation'
  $('fileTree').innerHTML = `
<span class="dir">📁 Tracks\\</span>
<br><span class="file">  ├ ${name}.smy</span><span class="fsize">${fmt(smyBuf.byteLength)}</span>
<br><span class="file">  ├ ${name}.tinfo</span><span class="fsize">${fmt(tinfoBuf.byteLength)}${climbs.length ? ' · '+climbs.length+' montées indexées' : ' · vide'}</span>
<br><span class="file">  ├ ${name}.track</span><span class="fsize">${fmt(trackBuf.byteLength)} · ${pts.length.toLocaleString('fr')} pts · ${distKm} km${eleStr}</span>
<br><span class="dir">  └ 📁 ${name}\\</span>
<br><span class="file">        ├ dupli.track</span><span class="fsize">${fmt(trackBuf.byteLength)}</span>
<br><span class="file">        ├ list.junc</span><span class="fsize">${fmt(juncBuf.byteLength)} · ${Math.floor(juncBuf.byteLength/12)} intersections</span>
<br><span class="file">        ├ list2.junc</span><span class="fsize">${fmt(juncBuf.byteLength)}</span>
<br><span class="file">        └ sort1.path</span><span class="fsize">${fmt(pathBuf.byteLength)}</span>`

  if (climbs.length) {
    $('climbList').innerHTML = climbs.map((c, i) => `
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
  if (!state.generatedFiles) return
  const name = ($('routeName').value.trim() || 'route').replace(/[^a-zA-Z0-9_\-]/g, '_')
  const st = $('transferStatus')
  st.className = 'transfer-status'; st.textContent = ''
  $('transferBtn').disabled = true; $('transferBtn').textContent = '⏳ Sélectionner le lecteur Bryton…'
  try {
    const rootDir = await findBrytonDrive()
    if (!rootDir) { $('transferBtn').textContent = '⚡ Copier directement sur le Bryton (USB)'; $('transferBtn').disabled = false; return }
    $('transferBtn').textContent = '⏳ Copie en cours…'
    await writeFilesToDir(rootDir, name, state.generatedFiles)
    st.className = 'transfer-status ok'
    st.textContent = `✓ Route "${name}" copiée dans Tracks\\ — débrancher proprement puis Menu → Itinéraires.`
  } catch (e) {
    st.className = 'transfer-status err'; st.textContent = 'Erreur : ' + e.message
  }
  $('transferBtn').textContent = '⚡ Copier directement sur le Bryton (USB)'; $('transferBtn').disabled = false
})
