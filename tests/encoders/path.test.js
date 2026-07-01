import { test, expect } from 'vitest'
import { encodeSortPath } from '../../src/encoders/path.js'

// Montpellier — tous dans la même tuile z=13 (tx=4184, ty=2990)
const ptsSameTile = [
  [43.625812, 3.905949, 31],
  [43.626204, 3.903624, 32],
  [43.627000, 3.901000, 33],
]

test('taille multiple de 16', () => {
  expect(encodeSortPath(ptsSameTile).byteLength % 16).toBe(0)
})

test('un seul segment si même tuile', () => {
  expect(encodeSortPath(ptsSameTile).byteLength).toBe(16)
})

test('start=0 pour le premier segment', () => {
  const v = new DataView(encodeSortPath(ptsSameTile))
  expect(v.getUint32(0, true)).toBe(0)
})

test('end=n-1 pour segment unique', () => {
  const v = new DataView(encodeSortPath(ptsSameTile))
  expect(v.getUint32(4, true)).toBe(ptsSameTile.length - 1)
})

test('tile z=13 Montpellier = tx=4184 ty=2990', () => {
  const v = new DataView(encodeSortPath(ptsSameTile))
  const tileId = v.getUint32(8, true)
  expect(tileId & 0xFFFF).toBe(4184)         // tx
  expect((tileId >> 16) & 0xFFFF).toBe(2990) // ty
})

test('dernier uint32 = 0', () => {
  const v = new DataView(encodeSortPath(ptsSameTile))
  expect(v.getUint32(12, true)).toBe(0)
})

test('deux tuiles → deux segments avec overlap', () => {
  // Forcer un changement de tuile en prenant des points très éloignés
  const pts = [
    [43.625812, 3.905949, 0],  // tuile A
    [48.850000, 2.350000, 0],  // tuile B (Paris)
  ]
  const v = new DataView(encodeSortPath(pts))
  expect(v.byteLength).toBe(32) // 2 segments
  // end du seg0 = start du seg1 (overlap)
  const endSeg0 = v.getUint32(4, true)
  const startSeg1 = v.getUint32(16, true)
  expect(endSeg0).toBe(startSeg1)
})
