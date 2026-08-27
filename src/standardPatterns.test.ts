import { describe, expect, it } from 'vitest'
import type { Point } from './editorModel'
import { PATTERN_CATEGORY_BY_ID, STANDARD_PATTERNS } from './standardPatterns'

const EXPECTED_NAMES = {
  'nine-patch': 'Девять лоскутов',
  'four-patch': 'Четыре лоскута',
  'log-cabin': 'Бревенчатая изба',
  'rail-fence': 'Рельсы',
  'flying-geese': 'Летящие гуси',
  'ohio-star': 'Звезда Огайо',
  'sawtooth-star': 'Зубчатая звезда',
  'churn-dash': 'Маслобойка',
  'bow-tie': 'Галстук-бабочка',
  'friendship-star': 'Звезда дружбы',
  'bear-paw': 'Медвежья лапа',
  basket: 'Корзина',
  'shoo-fly': 'Муха',
  'jacobs-ladder': 'Лестница Иакова',
  'maple-leaf': 'Кленовый лист',
  'courthouse-steps': 'Ступени суда',
  'dutchmans-puzzle': 'Загадка голландца',
  'card-trick': 'Карточный фокус',
  'snails-trail': 'След улитки',
  'storm-at-sea': 'Шторм на море',
  'dresden-plate': 'Дрезденская тарелка',
  'grandmothers-flower-garden': 'Бабушкин цветник',
} as const

const EPSILON = 1e-9

function polygonArea(points: readonly Point[]): number {
  const doubledArea = points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length]
    return sum + x * nextY - nextX * y
  }, 0)
  return Math.abs(doubledArea) / 2
}

function hasInteriorOverlap(first: readonly Point[], second: readonly Point[]): boolean {
  const axes = [first, second].flatMap((points) => points.map(([x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length]
    return [-(nextY - y), nextX - x] as const
  }))

  return axes.every(([axisX, axisY]) => {
    const project = (points: readonly Point[]) => points.map(([x, y]) => x * axisX + y * axisY)
    const firstProjection = project(first)
    const secondProjection = project(second)
    const overlap = Math.min(Math.max(...firstProjection), Math.max(...secondProjection))
      - Math.max(Math.min(...firstProjection), Math.min(...secondProjection))
    return overlap > EPSILON
  })
}

describe('standard quilt blocks', () => {
  it('contains the complete named set with stable unique ids', () => {
    expect(STANDARD_PATTERNS.length).toBeGreaterThanOrEqual(22)
    expect(new Set(STANDARD_PATTERNS.map(({ id }) => id)).size).toBe(STANDARD_PATTERNS.length)
    expect(new Set(STANDARD_PATTERNS.map(({ name }) => name)).size).toBe(STANDARD_PATTERNS.length)

    const namesById = Object.fromEntries(STANDARD_PATTERNS.map(({ id, name }) => [id, name]))
    expect(namesById).toMatchObject(EXPECTED_NAMES)
  })

  it('keeps the canonical visible-piece counts for corrected traditional blocks', () => {
    const expectedCounts = {
      'four-patch': 2,
      'flying-geese': 2,
      'bear-paw': 21,
      basket: 9,
      'shoo-fly': 5,
      'jacobs-ladder': 14,
      'maple-leaf': 11,
      'courthouse-steps': 17,
      'dutchmans-puzzle': 8,
      'card-trick': 16,
      'snails-trail': 20,
      'storm-at-sea': 10,
      'dresden-plate': 36,
      'grandmothers-flower-garden': 21,
    } as const

    const actualCounts = Object.fromEntries(
      STANDARD_PATTERNS
        .filter(({ id }) => id in expectedCounts)
        .map(({ id, shapes }) => [id, shapes.length]),
    )

    expect(actualCounts).toEqual(expectedCounts)
  })

  it('uses valid normalized rectangle and triangle geometry', () => {
    for (const pattern of STANDARD_PATTERNS) {
      expect(pattern.background, `${pattern.id}: background`).toBeGreaterThanOrEqual(0)
      expect(pattern.background, `${pattern.id}: background`).toBeLessThanOrEqual(3)
      expect(Number.isInteger(pattern.background), `${pattern.id}: background`).toBe(true)
      expect(pattern.shapes.length, `${pattern.id}: visible pieces`).toBeGreaterThan(0)

      const usedColors = new Set([pattern.background])
      let visibleArea = 0

      for (const [shapeIndex, shape] of pattern.shapes.entries()) {
        const label = `${pattern.id}: shape ${shapeIndex}`
        expect([3, 4], `${label}: triangle or rectangle`).toContain(shape.points.length)
        expect(Number.isInteger(shape.color), `${label}: integer color`).toBe(true)
        expect(shape.color, `${label}: color`).toBeGreaterThanOrEqual(0)
        expect(shape.color, `${label}: color`).toBeLessThanOrEqual(3)
        expect(shape.color, `${label}: visible against background`).not.toBe(pattern.background)
        usedColors.add(shape.color)

        expect(new Set(shape.points.map(([x, y]) => `${x},${y}`)).size, `${label}: distinct vertices`)
          .toBe(shape.points.length)
        for (const [x, y] of shape.points) {
          expect(Number.isFinite(x), `${label}: finite x`).toBe(true)
          expect(Number.isFinite(y), `${label}: finite y`).toBe(true)
          expect(x, `${label}: x lower bound`).toBeGreaterThanOrEqual(0)
          expect(x, `${label}: x upper bound`).toBeLessThanOrEqual(1)
          expect(y, `${label}: y lower bound`).toBeGreaterThanOrEqual(0)
          expect(y, `${label}: y upper bound`).toBeLessThanOrEqual(1)
        }

        const area = polygonArea(shape.points)
        expect(area, `${label}: non-zero area`).toBeGreaterThan(EPSILON)
        visibleArea += area

        if (shape.points.length === 4) {
          expect(new Set(shape.points.map(([x]) => x)).size, `${label}: rectangle x coordinates`).toBe(2)
          expect(new Set(shape.points.map(([, y]) => y)).size, `${label}: rectangle y coordinates`).toBe(2)
        }
      }

      expect(usedColors.size, `${pattern.id}: palette tags`).toBeGreaterThanOrEqual(2)
      expect(usedColors.size, `${pattern.id}: palette tags`).toBeLessThanOrEqual(4)
      expect(visibleArea, `${pattern.id}: visible area`).toBeLessThanOrEqual(1 + EPSILON)
    }
  })

  it('does not overlap visible pieces and keeps every preview distinct', () => {
    const signatures = new Set<string>()

    for (const pattern of STANDARD_PATTERNS) {
      const signature = JSON.stringify({ background: pattern.background, shapes: pattern.shapes })
      expect(signatures.has(signature), `${pattern.id}: duplicate geometry`).toBe(false)
      signatures.add(signature)

      for (let first = 0; first < pattern.shapes.length; first += 1) {
        for (let second = first + 1; second < pattern.shapes.length; second += 1) {
          expect(
            hasInteriorOverlap(pattern.shapes[first].points, pattern.shapes[second].points),
            `${pattern.id}: shapes ${first} and ${second} overlap`,
          ).toBe(false)
        }
      }
    }
  })

  it('assigns every block to one of the four pattern categories', () => {
    const patternIds = STANDARD_PATTERNS.map(({ id }) => id).sort()
    expect(Object.keys(PATTERN_CATEGORY_BY_ID).sort()).toEqual(patternIds)
    expect(new Set(Object.values(PATTERN_CATEGORY_BY_ID))).toEqual(new Set([
      'Базовые',
      'Звёзды',
      'Треугольники',
      'Классика',
    ]))
  })
})
