export async function fetchElevations(pts) {
  const BATCH = 512;
  const result = new Array(pts.length).fill(null);
  for (let start = 0; start < pts.length; start += BATCH) {
    const batch = pts.slice(start, start+BATCH);
    const locations = batch.map(p => ({ latitude: p[0], longitude: p[1] }));
    try {
      const resp = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      data.results.forEach((r, i) => { result[start+i] = r.elevation; });
    } catch (e) {
      console.warn('Open-Elevation batch failed:', e.message);
    }
  }
  return result;
}
