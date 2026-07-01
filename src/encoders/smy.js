import { calcClimb, totalDist } from '../geo.js'

export function encodeSmy(pts, climbs) {
  const buf = new ArrayBuffer(68), v = new DataView(buf);
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
  const { up } = calcClimb(pts);
  v.setUint16(0, 1, true);
  v.setUint16(2, pts.length, true);
  v.setInt32(4,  Math.round(Math.max(...lats)*1e6), true);
  v.setInt32(8,  Math.round(Math.min(...lats)*1e6), true);
  v.setInt32(12, Math.round(Math.max(...lons)*1e6), true);
  v.setInt32(16, Math.round(Math.min(...lons)*1e6), true);
  v.setInt32(20, Math.round(totalDist(pts)), true);
  v.setInt32(60, up, true);
  return buf;
}
