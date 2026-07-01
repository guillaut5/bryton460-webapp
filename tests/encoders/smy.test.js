import { test, expect } from 'vitest'
import { encodeSmy } from '../../src/encoders/smy.js'

const pts = [
  [43.625812, 3.905949, 31],
  [43.700000, 3.950000, 45],
  [43.774512, 3.885329, 38],
]

test('taille fixe 68 octets', () => {
  expect(encodeSmy(pts, []).byteLength).toBe(68)
})

test('version = 1', () => {
  const v = new DataView(encodeSmy(pts, []))
  expect(v.getUint16(0, true)).toBe(1)
})

test('nb_points correct', () => {
  const v = new DataView(encodeSmy(pts, []))
  expect(v.getUint16(2, true)).toBe(3)
})

test('D- toujours 0', () => {
  const v = new DataView(encodeSmy(pts, []))
  expect(v.getInt32(64, true)).toBe(0)
})

test('lat_max encodée en offset 4', () => {
  const v = new DataView(encodeSmy(pts, []))
  expect(v.getInt32(4, true) / 1e6).toBeCloseTo(43.774512, 4)
})

test('lat_min encodée en offset 8', () => {
  const v = new DataView(encodeSmy(pts, []))
  expect(v.getInt32(8, true) / 1e6).toBeCloseTo(43.625812, 4)
})

test('D+ reflète la montée réelle', () => {
  const ptsClimb = [[0,0,100],[0,0,200]]
  const v = new DataView(encodeSmy(ptsClimb, []))
  expect(v.getInt32(60, true)).toBe(100)
})
