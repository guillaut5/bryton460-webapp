const sleep = ms => new Promise(r => setTimeout(r, ms));

// L'API publique open-elevation.com rate-limite/timeout facilement sur des séquences
// de requêtes rapprochées (traces longues = beaucoup de batchs). On retry chaque batch
// avant d'abandonner, plutôt que de laisser le point sans élévation silencieusement.
async function fetchBatch(locations, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      return data.results.map(r => r.elevation);
    } catch (e) {
      console.warn(`Open-Elevation batch failed (tentative ${attempt+1}/${retries+1}):`, e.message);
      if (attempt < retries) await sleep(1000 * 2**attempt);
    }
  }
  return null;
}

// Retourne un tableau d'élévations, un par point, avec `null` pour les points
// dont l'élévation n'a pas pu être récupérée même après retries (à combler par l'appelant).
export async function fetchElevations(pts) {
  const BATCH = 512;
  const result = new Array(pts.length).fill(null);
  for (let start = 0; start < pts.length; start += BATCH) {
    const batch = pts.slice(start, start+BATCH);
    const locations = batch.map(p => ({ latitude: p[0], longitude: p[1] }));
    const eles = await fetchBatch(locations);
    if (eles) eles.forEach((e, i) => { result[start+i] = e; });
    if (start + BATCH < pts.length) await sleep(300);
  }
  return result;
}
