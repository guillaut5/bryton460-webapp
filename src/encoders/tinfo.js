export function encodeTinfo(climbs) {
  if (!climbs || !climbs.length) return new ArrayBuffer(0);
  const buf = new ArrayBuffer(climbs.length * 2 * 44), v = new DataView(buf);
  for (let i = 0; i < climbs.length; i++) {
    v.setUint32(i*88,    (0x00BE << 16) | (climbs[i].startPt & 0xFFFF), true);
    v.setUint32(i*88+44, (0x00BF << 16) | (climbs[i].endPt   & 0xFFFF), true);
  }
  return buf;
}
