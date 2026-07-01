export function parseGPX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('GPX invalide');

  const nodes = [
    ...doc.getElementsByTagName('trkpt'),
    ...doc.getElementsByTagName('rtept'),
  ];
  if (!nodes.length) throw new Error('Aucun point trkpt/rtept');

  function getEle(node) {
    const en = node.getElementsByTagName('ele')[0];
    if (en) { const v = parseFloat(en.textContent); if (isFinite(v)) return v; }
    return null;
  }

  const pts = Array.from(nodes).map(n => {
    const lat = parseFloat(n.getAttribute('lat')), lon = parseFloat(n.getAttribute('lon'));
    return [lat, lon, getEle(n)];
  }).filter(p => isFinite(p[0]) && isFinite(p[1]));
  if (!pts.length) throw new Error('Coordonnées invalides');

  function getTagText(tag) {
    const el = doc.getElementsByTagName(tag)[0];
    return el ? el.textContent.trim() : null;
  }

  return { pts, gpxName: getTagText('name') };
}
