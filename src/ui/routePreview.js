// Aperçu 2D léger du tracé (forme vue du dessus), en SVG pur — pas de tuiles/carte externe,
// cohérent avec le reste de l'appli (fichier unique, utilisable hors-ligne).
// Longitude corrigée par cos(latitude) pour ne pas déformer la forme réelle du parcours.
export function drawRoutePreview(pts) {
  const svg = document.getElementById('routePreviewSvg')
  if (!pts || pts.length < 2) { svg.innerHTML = ''; return }

  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1])
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons)
  const cosLat = Math.cos((latMin + latMax) / 2 * Math.PI / 180)

  const spanX = Math.max((lonMax - lonMin) * cosLat, 1e-9)
  const spanY = Math.max(latMax - latMin, 1e-9)
  const scale = 100 / Math.max(spanX, spanY) // le plus grand côté = 100 unités, l'autre au prorata
  const PAD = 6, R = 1.8

  const xOf = lon => (lon - lonMin) * cosLat * scale + PAD
  const yOf = lat => (latMax - lat) * scale + PAD // nord en haut

  let path = ''
  for (let i = 0; i < pts.length; i++) {
    path += (path ? 'L' : 'M') + xOf(pts[i][1]).toFixed(2) + ',' + yOf(pts[i][0]).toFixed(2)
  }
  const sx = xOf(pts[0][1]), sy = yOf(pts[0][0])
  const ex = xOf(pts[pts.length-1][1]), ey = yOf(pts[pts.length-1][0])

  const vbW = spanX * scale + PAD * 2, vbH = spanY * scale + PAD * 2
  svg.setAttribute('viewBox', `0 0 ${vbW.toFixed(2)} ${vbH.toFixed(2)}`)
  svg.innerHTML = `
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="${R}" fill="var(--accent2)"/>
    <circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="${R}" fill="var(--text)" stroke="var(--bg)" stroke-width="0.8"/>`
}
