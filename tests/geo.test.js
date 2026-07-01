import { describe, test, expect } from 'vitest'
import { hav, totalDist, calcClimb, buildDists } from '../src/geo.js'

describe('hav', () => {
  test('même point → 0', () => {
    expect(hav(43.6, 3.9, 43.6, 3.9)).toBe(0)
  })
  test('Montpellier → Paris ≈ 596km', () => {
    expect(hav(43.6, 3.9, 48.85, 2.35)).toBeCloseTo(596000, -4)
  })
  test('symétrique', () => {
    expect(hav(43.6, 3.9, 44.0, 4.2)).toBeCloseTo(hav(44.0, 4.2, 43.6, 3.9), 0)
  })
})

describe('calcClimb', () => {
  test('montée pure', () => {
    const pts = [[0,0,100],[0,0,200],[0,0,250]]
    expect(calcClimb(pts)).toEqual({ up: 150, dn: 0 })
  })
  test('descente pure', () => {
    const pts = [[0,0,300],[0,0,100]]
    expect(calcClimb(pts)).toEqual({ up: 0, dn: 200 })
  })
  test('points sans élévation ignorés', () => {
    const pts = [[0,0,null],[0,0,100],[0,0,200]]
    expect(calcClimb(pts).up).toBe(100)
  })
  test('D- toujours positif', () => {
    const pts = [[0,0,500],[0,0,100],[0,0,300]]
    expect(calcClimb(pts).dn).toBe(400)
    expect(calcClimb(pts).up).toBe(200)
  })
})

describe('buildDists', () => {
  test('commence à 0', () => {
    const pts = [[43.6,3.9,0],[43.7,3.9,0]]
    expect(buildDists(pts)[0]).toBe(0)
  })
  test('longueur = n points', () => {
    const pts = [[43.6,3.9,0],[43.7,3.9,0],[43.8,3.9,0]]
    expect(buildDists(pts).length).toBe(3)
  })
  test('distances strictement croissantes', () => {
    const pts = [[43.6,3.9,0],[43.7,3.9,0],[43.8,3.9,0]]
    const d = buildDists(pts)
    expect(d[1]).toBeGreaterThan(0)
    expect(d[2]).toBeGreaterThan(d[1])
  })
  test('cohérent avec totalDist', () => {
    const pts = [[43.6,3.9,0],[43.7,3.9,0],[43.8,3.9,0]]
    const d = buildDists(pts)
    expect(d[d.length-1]).toBeCloseTo(totalDist(pts), 0)
  })
})
