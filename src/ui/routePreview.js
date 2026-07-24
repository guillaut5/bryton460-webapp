import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Aperçu carte du tracé (fond OSM + tracé + départ/arrivée), avec zoom/pan.
// Seule fonctionnalité de l'appli qui nécessite le réseau pour son rendu complet (les tuiles
// OSM sont chargées à la volée, pas embarquées dans le fichier) — comme OSRM/l'élévation,
// c'est une amélioration optionnelle : sans réseau, la carte reste grise mais le tracé
// (vectoriel, dessiné localement) et les marqueurs restent visibles.
let map = null, routeLayer = null

export function drawRoutePreview(pts) {
  const container = document.getElementById('routePreviewMap')
  if (!pts || pts.length < 2) { if (routeLayer) { routeLayer.remove(); routeLayer = null }; return }

  const latlngs = pts.map(p => [p[0], p[1]])

  if (!map) {
    map = L.map(container, { attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
  }

  if (routeLayer) routeLayer.remove()
  routeLayer = L.layerGroup([
    L.polyline(latlngs, { color: '#00d4aa', weight: 3 }),
    L.circleMarker(latlngs[0], { radius: 5, color: '#0f1117', weight: 1.5, fillColor: '#e8eaf0', fillOpacity: 1 }),
    L.circleMarker(latlngs[latlngs.length-1], { radius: 5, color: '#0f1117', weight: 1.5, fillColor: '#ff6b35', fillOpacity: 1 }),
  ]).addTo(map)

  map.fitBounds(L.latLngBounds(latlngs), { padding: [12, 12] })
}
