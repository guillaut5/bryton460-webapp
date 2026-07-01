import { test, expect } from 'vitest'
import { computeGrades, encodeTrack } from '../../src/encoders/track.js'
import { buildDists } from '../../src/geo.js'

const pts = [
  [43.625812, 3.905949, 31],
  [43.626204, 3.903624, 32],
  [43.627000, 3.901000, 33],
]
const dists = buildDists(pts)

test('taille = n × 16 octets', () => {
  expect(encodeTrack(pts, [0,0,0]).byteLength).toBe(pts.length * 16)
})

test('lat encodée en int32 LE × 1e6', () => {
  const v = new DataView(encodeTrack(pts, [0,0,0]))
  expect(v.getInt32(0, true)).toBe(Math.round(43.625812 * 1e6))
})

test('lon encodée en int32 LE × 1e6', () => {
  const v = new DataView(encodeTrack(pts, [0,0,0]))
  expect(v.getInt32(4, true)).toBe(Math.round(3.905949 * 1e6))
})

test('élévation en uint16 offset 8', () => {
  const v = new DataView(encodeTrack(pts, [0,0,0]))
  expect(v.getUint16(8, true)).toBe(31)
})

test('pente négative encodée int8 signé', () => {
  const grades = [0, -5, -10]
  const v = new DataView(encodeTrack(pts, grades))
  expect(v.getInt8(1*16+10)).toBe(-5)
  expect(v.getInt8(2*16+10)).toBe(-10)
})

test('pente +127 max', () => {
  const grades = [127, 0, 0]
  const v = new DataView(encodeTrack(pts, grades))
  expect(v.getInt8(0*16+10)).toBe(127)
})

test('bytes 11-15 = zéros', () => {
  const v = new DataView(encodeTrack(pts, [0,0,0]))
  for (let b = 11; b < 16; b++) expect(v.getUint8(b)).toBe(0)
})

test('computeGrades retourne N valeurs', () => {
  expect(computeGrades(pts, dists).length).toBe(pts.length)
})

test('computeGrades sans élévation → tout zéros', () => {
  const ptsNoEle = pts.map(p => [p[0], p[1], null])
  expect(computeGrades(ptsNoEle, dists).every(g => g === 0)).toBe(true)
})
