import { test, expect } from 'vitest'
import { encodeTinfo } from '../../src/encoders/tinfo.js'

const climbs = [
  { startPt: 1246, endPt: 1427 },
  { startPt: 2598, endPt: 4286 },
]

test('vide si pas de montées', () => {
  expect(encodeTinfo([]).byteLength).toBe(0)
})

test('taille = n × 2 × 44 octets', () => {
  expect(encodeTinfo(climbs).byteLength).toBe(climbs.length * 88)
})

test('flag 0xBE = début', () => {
  const v = new DataView(encodeTinfo(climbs))
  const val = v.getUint32(0, true)
  expect((val >> 16) & 0xFF).toBe(0xBE)
})

test('flag 0xBF = fin', () => {
  const v = new DataView(encodeTinfo(climbs))
  const val = v.getUint32(44, true)
  expect((val >> 16) & 0xFF).toBe(0xBF)
})

test('ptIdx encodé dans les bits 0-15', () => {
  const v = new DataView(encodeTinfo(climbs))
  expect(v.getUint32(0, true) & 0xFFFF).toBe(1246)
  expect(v.getUint32(44, true) & 0xFFFF).toBe(1427)
})

test('40 octets de zéros après le uint32', () => {
  const v = new DataView(encodeTinfo(climbs))
  for (let b = 4; b < 44; b++) expect(v.getUint8(b)).toBe(0)
})
