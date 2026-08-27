import { describe, expect, it } from 'vitest'
import type { PatternShape, Point } from './editorModel'
import {
  createPrimitive,
  flipGroup,
  groupBounds,
  hasPolygonOverlap,
  moveGroup,
  resizeGroup,
  rotateGroup,
  splitGroup,
  type DraftGroup,
  type PrimitiveKind,
  type SplitKind,
} from './blockEditorGeometry'

function polygonArea(points: readonly Point[]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index]
    const [x2, y2] = points[(index + 1) % points.length]
    twiceArea += x1 * y2 - y1 * x2
  }
  return Math.abs(twiceArea) / 2
}

function totalArea(shapes: readonly PatternShape[]): number {
  return shapes.reduce((sum, shape) => sum + polygonArea(shape.points), 0)
}

function rectangleGroup(
  id: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color = 2,
): DraftGroup {
  return {
    id,
    shapes: [{
      color,
      points: [[left, top], [right, top], [right, bottom], [left, bottom]],
    }],
  }
}

function expectInsideBlock(group: DraftGroup): void {
  for (const shape of group.shapes) {
    for (const [x, y] of shape.points) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  }
}

const primitiveExpectations: readonly [
  PrimitiveKind,
  readonly number[],
  { x: number; y: number; width: number; height: number },
][] = [
  ['square', [4], { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }],
  ['rectangle', [4], { x: 0.125, y: 0.25, width: 0.75, height: 0.5 }],
  ['hst', [3, 3], { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }],
  ['qst', [3, 3, 3, 3], { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }],
  ['flying-geese', [3, 3, 3], { x: 0.125, y: 0.25, width: 0.75, height: 0.5 }],
  ['diamond', [4], { x: 0.15, y: 0.15, width: 0.7, height: 0.7 }],
  ['hexagon', [6], { x: 0.2, y: 0.25, width: 0.6, height: 0.5 }],
  ['triangle', [3], { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }],
]

describe('block editor primitives', () => {
  it.each(primitiveExpectations)('creates a centered %s sewing unit', (kind, vertexCounts, expectedBounds) => {
    const group = createPrimitive(kind, 7, `primitive-${kind}`)

    expect(group.id).toBe(`primitive-${kind}`)
    expect(group.shapes.map((shape) => shape.points.length)).toEqual(vertexCounts)
    expect(group.shapes.every((shape) => shape.color === 7)).toBe(true)
    expect(groupBounds(group)).toEqual(expectedBounds)
    expect(expectedBounds.x + expectedBounds.width / 2).toBe(0.5)
    expect(expectedBounds.y + expectedBounds.height / 2).toBe(0.5)
    expectInsideBlock(group)
  })

  it('creates distinct generated identifiers when an id is omitted', () => {
    expect(createPrimitive('square', 0).id).not.toBe(createPrimitive('square', 0).id)
  })

  it('uses complete triangle tilings for HST, QST, and Flying Geese units', () => {
    const hst = createPrimitive('hst', 0, 'hst')
    const qst = createPrimitive('qst', 0, 'qst')
    const geese = createPrimitive('flying-geese', 0, 'geese')

    expect(totalArea(hst.shapes)).toBe(groupBounds(hst).width * groupBounds(hst).height)
    expect(totalArea(qst.shapes)).toBe(groupBounds(qst).width * groupBounds(qst).height)
    expect(totalArea(geese.shapes)).toBe(groupBounds(geese).width * groupBounds(geese).height)
  })
})

const splitExpectations: readonly [SplitKind, number, readonly number[]][] = [
  ['horizontal', 2, [4, 4]],
  ['vertical', 2, [4, 4]],
  ['diagonal-down', 2, [3, 3]],
  ['diagonal-up', 2, [3, 3]],
  ['quarters', 4, [4, 4, 4, 4]],
  ['four-triangles', 4, [3, 3, 3, 3]],
]

describe('block editor splits', () => {
  it.each(splitExpectations)('applies the %s split with complete coverage', (kind, shapeCount, vertexCounts) => {
    const original = rectangleGroup('source', 0.1, 0.2, 0.9, 0.8, 4)
    const before = structuredClone(original)
    const split = splitGroup(original, kind)

    expect(split).not.toBe(original)
    expect(split.id).toBe(original.id)
    expect(split.shapes).toHaveLength(shapeCount)
    expect(split.shapes.map((shape) => shape.points.length)).toEqual(vertexCounts)
    expect(split.shapes.every((shape) => shape.color === 4)).toBe(true)
    expect(groupBounds(split)).toEqual(groupBounds(original))
    expect(totalArea(split.shapes)).toBeCloseTo(totalArea(original.shapes), 12)
    expect(original).toEqual(before)
  })

  it('places horizontal, vertical, and quarter seams at the rectangle midpoint', () => {
    const source = rectangleGroup('source', 0.1, 0.2, 0.9, 0.8)

    expect(splitGroup(source, 'horizontal').shapes[0].points).toEqual([
      [0.1, 0.2], [0.9, 0.2], [0.9, 0.5], [0.1, 0.5],
    ])
    expect(splitGroup(source, 'vertical').shapes[0].points).toEqual([
      [0.1, 0.2], [0.5, 0.2], [0.5, 0.8], [0.1, 0.8],
    ])
    expect(splitGroup(source, 'quarters').shapes[3].points).toEqual([
      [0.5, 0.5], [0.9, 0.5], [0.9, 0.8], [0.5, 0.8],
    ])
  })

  it('leaves multipart and non-axis-aligned groups unchanged', () => {
    const multipart = createPrimitive('hst', 3, 'multipart')
    const diamond = createPrimitive('diamond', 3, 'diamond')

    expect(splitGroup(multipart, 'horizontal')).toBe(multipart)
    expect(splitGroup(diamond, 'quarters')).toBe(diamond)
  })
})

describe('block editor transforms', () => {
  it('rotates around the group center and preserves nested input values', () => {
    const original = createPrimitive('rectangle', 5, 'rotate')
    const before = structuredClone(original)
    const rotated = rotateGroup(original, 90)

    expect(groupBounds(rotated)).toEqual({ x: 0.25, y: 0.125, width: 0.5, height: 0.75 })
    expect(rotated).not.toBe(original)
    expect(rotated.shapes[0]).not.toBe(original.shapes[0])
    expect(rotated.shapes[0].points).not.toBe(original.shapes[0].points)
    expect(original).toEqual(before)
  })

  it('fits rotations whose raw bounds would extend beyond the block', () => {
    const fullBlock = rectangleGroup('full', 0, 0, 1, 1)
    const rotated = rotateGroup(fullBlock, 45)
    const bounds = groupBounds(rotated)

    expectInsideBlock(rotated)
    expect(bounds.width).toBeCloseTo(1, 10)
    expect(bounds.height).toBeCloseTo(1, 10)
  })

  it('flips independently across horizontal and vertical center axes', () => {
    const triangle = createPrimitive('triangle', 1, 'triangle')
    const before = structuredClone(triangle)
    const horizontal = flipGroup(triangle, 'horizontal')
    const vertical = flipGroup(triangle, 'vertical')

    expect(horizontal.shapes[0].points).toEqual([[0.5, 0.8], [0.8, 0.2], [0.2, 0.2]])
    expect(vertical.shapes[0].points).toEqual([[0.5, 0.2], [0.2, 0.8], [0.8, 0.8]])
    expect(horizontal).not.toBe(triangle)
    expect(vertical).not.toBe(triangle)
    expect(triangle).toEqual(before)
  })

  it('moves by snapped deltas and clamps the complete group at block edges', () => {
    const square = createPrimitive('square', 2, 'move')
    const before = structuredClone(square)
    const snapped = moveGroup(square, 0.13, -0.13, 4)
    const clamped = moveGroup(square, 4, 4)

    expect(groupBounds(snapped)).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 })
    expect(groupBounds(clamped)).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 })
    expect(square).toEqual(before)
  })

  it('resizes around the center with snapped dimensions and keeps the result inside', () => {
    const square = createPrimitive('square', 2, 'resize')
    const before = structuredClone(square)
    const resized = resizeGroup(square, 0.63, 0.37, 4)
    const edgeSquare = moveGroup(square, -1, -1)
    const edgeResize = resizeGroup(edgeSquare, 0.75, 0.75)

    expect(groupBounds(resized)).toEqual({ x: 0.125, y: 0.375, width: 0.75, height: 0.25 })
    expect(groupBounds(edgeResize)).toEqual({ x: 0, y: 0, width: 0.75, height: 0.75 })
    expectInsideBlock(resized)
    expectInsideBlock(edgeResize)
    expect(resized.shapes[0].color).toBe(square.shapes[0].color)
    expect(square).toEqual(before)
  })

  it('returns new nested geometry for no-op transforms', () => {
    const square = createPrimitive('square', 1, 'no-op')
    const rotated = rotateGroup(square, 0)
    const moved = moveGroup(square, 0, 0)
    const resized = resizeGroup(square, 0.5, 0.5)

    for (const transformed of [rotated, moved, resized]) {
      expect(transformed).toEqual(square)
      expect(transformed).not.toBe(square)
      expect(transformed.shapes).not.toBe(square.shapes)
      expect(transformed.shapes[0].points).not.toBe(square.shapes[0].points)
    }
  })
})

describe('group bounds', () => {
  it('encloses every shape in a multipart group', () => {
    const group: DraftGroup = {
      id: 'bounds',
      shapes: [
        { color: 0, points: [[0.3, 0.4], [0.7, 0.4], [0.5, 0.6]] },
        { color: 1, points: [[0.1, 0.2], [0.2, 0.2], [0.2, 0.9], [0.1, 0.9]] },
      ],
    }

    expect(groupBounds(group)).toEqual({ x: 0.1, y: 0.2, width: 0.6, height: 0.7 })
    expect(groupBounds({ id: 'empty', shapes: [] })).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe('polygon overlap detection', () => {
  it('detects positive-area intersection between different groups', () => {
    const first = rectangleGroup('first', 0.1, 0.1, 0.5, 0.5)
    const crossing = rectangleGroup('crossing', 0.4, 0.2, 0.8, 0.4)
    const contained = rectangleGroup('contained', 0.2, 0.2, 0.3, 0.3)

    expect(hasPolygonOverlap([first, crossing])).toBe(true)
    expect(hasPolygonOverlap([first, contained])).toBe(true)
  })

  it('ignores shared edges, shared corners, and separated polygons', () => {
    const first = rectangleGroup('first', 0.1, 0.1, 0.5, 0.5)
    const edge = rectangleGroup('edge', 0.5, 0.1, 0.8, 0.5)
    const corner = rectangleGroup('corner', 0.5, 0.5, 0.8, 0.8)
    const separate = rectangleGroup('separate', 0.6, 0.6, 0.9, 0.9)

    expect(hasPolygonOverlap([first, edge])).toBe(false)
    expect(hasPolygonOverlap([first, corner])).toBe(false)
    expect(hasPolygonOverlap([first, separate])).toBe(false)
  })

  it('does not treat the intentional seams within one group as overlap', () => {
    expect(hasPolygonOverlap([createPrimitive('qst', 0, 'qst')])).toBe(false)
    expect(hasPolygonOverlap([])).toBe(false)
  })
})
