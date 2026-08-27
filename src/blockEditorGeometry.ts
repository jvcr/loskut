import type { PatternShape, Point } from './editorModel'

export type PrimitiveKind =
  | 'square'
  | 'rectangle'
  | 'hst'
  | 'qst'
  | 'flying-geese'
  | 'diamond'
  | 'hexagon'
  | 'triangle'

export type SplitKind =
  | 'horizontal'
  | 'vertical'
  | 'diagonal-down'
  | 'diagonal-up'
  | 'quarters'
  | 'four-triangles'

export interface DraftGroup {
  id: string
  shapes: PatternShape[]
}

export interface SeamPoint {
  x: number
  y: number
}

const EPSILON = 1e-10
const COORDINATE_PRECISION = 1e12
let fallbackGroupId = 0

function point(x: number, y: number): Point {
  return [x, y]
}

function polygon(color: number, points: readonly Point[]): PatternShape {
  return { color, points }
}

function rectangle(color: number, left: number, top: number, right: number, bottom: number): PatternShape {
  return polygon(color, [
    point(left, top),
    point(right, top),
    point(right, bottom),
    point(left, bottom),
  ])
}

function createGroupId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `draft-${globalThis.crypto.randomUUID()}`
  }

  fallbackGroupId += 1
  return `draft-${fallbackGroupId}`
}

export function createPrimitive(kind: PrimitiveKind, color: number, id = createGroupId()): DraftGroup {
  const squareLeft = 0.25
  const squareTop = 0.25
  const squareRight = 0.75
  const squareBottom = 0.75
  const center = point(0.5, 0.5)
  let shapes: PatternShape[]

  switch (kind) {
    case 'square':
      shapes = [rectangle(color, squareLeft, squareTop, squareRight, squareBottom)]
      break
    case 'rectangle':
      shapes = [rectangle(color, 0.125, 0.25, 0.875, 0.75)]
      break
    case 'hst':
      shapes = [
        polygon(color, [point(squareLeft, squareTop), point(squareRight, squareTop), point(squareRight, squareBottom)]),
        polygon(color, [point(squareLeft, squareTop), point(squareRight, squareBottom), point(squareLeft, squareBottom)]),
      ]
      break
    case 'qst':
      shapes = [
        polygon(color, [point(squareLeft, squareTop), point(squareRight, squareTop), center]),
        polygon(color, [point(squareRight, squareTop), point(squareRight, squareBottom), center]),
        polygon(color, [point(squareRight, squareBottom), point(squareLeft, squareBottom), center]),
        polygon(color, [point(squareLeft, squareBottom), point(squareLeft, squareTop), center]),
      ]
      break
    case 'flying-geese': {
      const left = 0.125
      const top = 0.25
      const right = 0.875
      const bottom = 0.75
      const apex = point(0.5, top)
      shapes = [
        polygon(color, [point(left, top), apex, point(left, bottom)]),
        polygon(color, [apex, point(right, bottom), point(left, bottom)]),
        polygon(color, [apex, point(right, top), point(right, bottom)]),
      ]
      break
    }
    case 'diamond':
      shapes = [polygon(color, [point(0.5, 0.15), point(0.85, 0.5), point(0.5, 0.85), point(0.15, 0.5)])]
      break
    case 'hexagon':
      shapes = [polygon(color, [
        point(0.35, 0.25),
        point(0.65, 0.25),
        point(0.8, 0.5),
        point(0.65, 0.75),
        point(0.35, 0.75),
        point(0.2, 0.5),
      ])]
      break
    case 'triangle':
      shapes = [polygon(color, [point(0.5, 0.2), point(0.8, 0.8), point(0.2, 0.8)])]
      break
  }

  return { id, shapes }
}

export function groupBounds(group: DraftGroup): { x: number; y: number; width: number; height: number } {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const shape of group.shapes) {
    for (const [x, y] of shape.points) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  return {
    x: cleanCoordinate(minX),
    y: cleanCoordinate(minY),
    width: cleanCoordinate(maxX - minX),
    height: cleanCoordinate(maxY - minY),
  }
}

function axisAlignedRectangleBounds(group: DraftGroup): ReturnType<typeof groupBounds> | null {
  if (group.shapes.length !== 1 || group.shapes[0].points.length !== 4) return null

  const bounds = groupBounds(group)
  if (bounds.width <= EPSILON || bounds.height <= EPSILON) return null

  const corners = [
    point(bounds.x, bounds.y),
    point(bounds.x + bounds.width, bounds.y),
    point(bounds.x + bounds.width, bounds.y + bounds.height),
    point(bounds.x, bounds.y + bounds.height),
  ]
  const matchedCorners = new Set<number>()

  for (const candidate of group.shapes[0].points) {
    const cornerIndex = corners.findIndex(([x, y]) => (
      Math.abs(candidate[0] - x) <= EPSILON && Math.abs(candidate[1] - y) <= EPSILON
    ))
    if (cornerIndex === -1 || matchedCorners.has(cornerIndex)) return null
    matchedCorners.add(cornerIndex)
  }

  return matchedCorners.size === 4 ? bounds : null
}

export function splitGroup(group: DraftGroup, kind: SplitKind): DraftGroup {
  const bounds = axisAlignedRectangleBounds(group)
  if (!bounds) return group

  const color = group.shapes[0].color
  const left = bounds.x
  const top = bounds.y
  const right = left + bounds.width
  const bottom = top + bounds.height
  const centerX = left + bounds.width / 2
  const centerY = top + bounds.height / 2
  const topLeft = point(left, top)
  const topRight = point(right, top)
  const bottomRight = point(right, bottom)
  const bottomLeft = point(left, bottom)
  const center = point(centerX, centerY)
  let shapes: PatternShape[]

  switch (kind) {
    case 'horizontal':
      shapes = [
        rectangle(color, left, top, right, centerY),
        rectangle(color, left, centerY, right, bottom),
      ]
      break
    case 'vertical':
      shapes = [
        rectangle(color, left, top, centerX, bottom),
        rectangle(color, centerX, top, right, bottom),
      ]
      break
    case 'diagonal-down':
      shapes = [
        polygon(color, [topLeft, topRight, bottomRight]),
        polygon(color, [topLeft, bottomRight, bottomLeft]),
      ]
      break
    case 'diagonal-up':
      shapes = [
        polygon(color, [topLeft, topRight, bottomLeft]),
        polygon(color, [topRight, bottomRight, bottomLeft]),
      ]
      break
    case 'quarters':
      shapes = [
        rectangle(color, left, top, centerX, centerY),
        rectangle(color, centerX, top, right, centerY),
        rectangle(color, left, centerY, centerX, bottom),
        rectangle(color, centerX, centerY, right, bottom),
      ]
      break
    case 'four-triangles':
      shapes = [
        polygon(color, [topLeft, topRight, center]),
        polygon(color, [topRight, bottomRight, center]),
        polygon(color, [bottomRight, bottomLeft, center]),
        polygon(color, [bottomLeft, topLeft, center]),
      ]
      break
  }

  return { id: group.id, shapes }
}

function cleanCoordinate(value: number): number {
  const rounded = Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION
  if (Math.abs(rounded) <= EPSILON) return 0
  if (Math.abs(rounded - 1) <= EPSILON) return 1
  return rounded
}

function mapGroup(group: DraftGroup, transform: (x: number, y: number) => Point): DraftGroup {
  return {
    id: group.id,
    shapes: group.shapes.map((shape) => ({
      color: shape.color,
      points: shape.points.map(([x, y]) => transform(x, y)),
    })),
  }
}

function translateGroup(group: DraftGroup, dx: number, dy: number): DraftGroup {
  return mapGroup(group, (x, y) => point(cleanCoordinate(x + dx), cleanCoordinate(y + dy)))
}

function fitInsideBlock(group: DraftGroup): DraftGroup {
  if (group.shapes.length === 0) return mapGroup(group, (x, y) => point(x, y))

  let fitted = group
  let bounds = groupBounds(fitted)
  const scale = Math.min(1, bounds.width > 1 ? 1 / bounds.width : 1, bounds.height > 1 ? 1 / bounds.height : 1)

  if (scale < 1) {
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    fitted = mapGroup(fitted, (x, y) => point(
      cleanCoordinate(centerX + (x - centerX) * scale),
      cleanCoordinate(centerY + (y - centerY) * scale),
    ))
    bounds = groupBounds(fitted)
  }

  const dx = bounds.x < 0
    ? -bounds.x
    : bounds.x + bounds.width > 1
      ? 1 - bounds.x - bounds.width
      : 0
  const dy = bounds.y < 0
    ? -bounds.y
    : bounds.y + bounds.height > 1
      ? 1 - bounds.y - bounds.height
      : 0

  return translateGroup(fitted, dx, dy)
}

export function rotateGroup(group: DraftGroup, degrees: number): DraftGroup {
  const bounds = groupBounds(group)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const safeDegrees = Number.isFinite(degrees) ? degrees : 0
  const radians = safeDegrees * Math.PI / 180
  const cosine = cleanCoordinate(Math.cos(radians))
  const sine = cleanCoordinate(Math.sin(radians))
  const rotated = mapGroup(group, (x, y) => {
    const offsetX = x - centerX
    const offsetY = y - centerY
    return point(
      cleanCoordinate(centerX + offsetX * cosine - offsetY * sine),
      cleanCoordinate(centerY + offsetX * sine + offsetY * cosine),
    )
  })

  return fitInsideBlock(rotated)
}

export function flipGroup(group: DraftGroup, axis: 'horizontal' | 'vertical'): DraftGroup {
  const bounds = groupBounds(group)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const flipped = mapGroup(group, (x, y) => axis === 'horizontal'
    ? point(cleanCoordinate(x), cleanCoordinate(centerY * 2 - y))
    : point(cleanCoordinate(centerX * 2 - x), cleanCoordinate(y)))

  return fitInsideBlock(flipped)
}

function snapped(value: number, snapDivisions?: number): number {
  if (!snapDivisions || !Number.isFinite(snapDivisions) || snapDivisions <= 0) return value
  return Math.round(value * snapDivisions) / snapDivisions
}

export function moveGroup(
  group: DraftGroup,
  dx: number,
  dy: number,
  snapDivisions?: number,
): DraftGroup {
  const bounds = groupBounds(group)
  const requestedX = Number.isFinite(dx) ? snapped(dx, snapDivisions) : 0
  const requestedY = Number.isFinite(dy) ? snapped(dy, snapDivisions) : 0
  if (bounds.width > 1 || bounds.height > 1) {
    return fitInsideBlock(translateGroup(group, requestedX, requestedY))
  }
  const clampedX = Math.max(-bounds.x, Math.min(requestedX, 1 - bounds.x - bounds.width))
  const clampedY = Math.max(-bounds.y, Math.min(requestedY, 1 - bounds.y - bounds.height))

  return translateGroup(group, clampedX, clampedY)
}

function resizedDimension(requested: number, current: number, snapDivisions?: number): number {
  if (!Number.isFinite(requested)) return current

  const value = snapped(requested, snapDivisions)
  const minimum = snapDivisions && Number.isFinite(snapDivisions) && snapDivisions > 0
    ? 1 / snapDivisions
    : EPSILON
  return Math.min(1, Math.max(minimum, value))
}

export function resizeGroup(
  group: DraftGroup,
  width: number,
  height: number,
  snapDivisions?: number,
): DraftGroup {
  const bounds = groupBounds(group)
  if (group.shapes.length === 0) return mapGroup(group, (x, y) => point(x, y))

  const nextWidth = resizedDimension(width, bounds.width, snapDivisions)
  const nextHeight = resizedDimension(height, bounds.height, snapDivisions)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const left = Math.max(0, Math.min(centerX - nextWidth / 2, 1 - nextWidth))
  const top = Math.max(0, Math.min(centerY - nextHeight / 2, 1 - nextHeight))

  return mapGroup(group, (x, y) => point(
    cleanCoordinate(left + (bounds.width <= EPSILON ? 0 : (x - bounds.x) / bounds.width * nextWidth)),
    cleanCoordinate(top + (bounds.height <= EPSILON ? 0 : (y - bounds.y) / bounds.height * nextHeight)),
  ))
}

function signedSeamDistance(
  pointValue: Point,
  start: SeamPoint,
  seamUnitX: number,
  seamUnitY: number,
): number {
  return seamUnitX * (pointValue[1] - start.y)
    - seamUnitY * (pointValue[0] - start.x)
}

function seamIntersection(
  first: Point,
  second: Point,
  firstDistance: number,
  secondDistance: number,
): Point {
  const denominator = firstDistance - secondDistance
  if (denominator === 0) return point(first[0], first[1])

  const amount = firstDistance / denominator
  return point(
    cleanCoordinate(first[0] + (second[0] - first[0]) * amount),
    cleanCoordinate(first[1] + (second[1] - first[1]) * amount),
  )
}

function samePoint(first: Point, second: Point): boolean {
  return Math.abs(first[0] - second[0]) <= EPSILON
    && Math.abs(first[1] - second[1]) <= EPSILON
}

function appendDistinct(points: Point[], nextPoint: Point): void {
  if (points.length === 0 || !samePoint(points[points.length - 1], nextPoint)) {
    points.push(nextPoint)
  }
}

function clipPolygonToSeamHalfPlane(
  points: readonly Point[],
  start: SeamPoint,
  seamUnitX: number,
  seamUnitY: number,
  side: 1 | -1,
): Point[] {
  if (points.length === 0) return []

  const clipped: Point[] = []
  let previous = points[points.length - 1]
  let previousDistance = signedSeamDistance(previous, start, seamUnitX, seamUnitY)
  let previousInside = side * previousDistance >= -EPSILON

  for (const current of points) {
    const currentDistance = signedSeamDistance(current, start, seamUnitX, seamUnitY)
    const currentInside = side * currentDistance >= -EPSILON

    if (previousInside !== currentInside) {
      appendDistinct(clipped, seamIntersection(previous, current, previousDistance, currentDistance))
    }
    if (currentInside) {
      appendDistinct(clipped, point(cleanCoordinate(current[0]), cleanCoordinate(current[1])))
    }

    previous = current
    previousDistance = currentDistance
    previousInside = currentInside
  }

  if (clipped.length > 1 && samePoint(clipped[0], clipped[clipped.length - 1])) {
    clipped.pop()
  }
  return clipped
}

function uniqueSplitId(base: string, usedIds: Set<string>): string {
  if (!usedIds.has(base)) {
    usedIds.add(base)
    return base
  }

  let suffix = 2
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1
  const id = `${base}-${suffix}`
  usedIds.add(id)
  return id
}

export function splitGroupsBySeam(
  groups: readonly DraftGroup[],
  start: SeamPoint,
  end: SeamPoint,
): DraftGroup[] {
  const seamX = end.x - start.x
  const seamY = end.y - start.y
  const seamLength = Math.hypot(seamX, seamY)
  if (seamLength <= EPSILON) return [...groups]
  const seamUnitX = seamX / seamLength
  const seamUnitY = seamY / seamLength

  const usedIds = new Set(groups.map((group) => group.id))
  const result: DraftGroup[] = []

  for (const group of groups) {
    if (group.shapes.length !== 1) {
      result.push(group)
      continue
    }

    const shape = group.shapes[0]
    const positivePoints = clipPolygonToSeamHalfPlane(shape.points, start, seamUnitX, seamUnitY, 1)
    const negativePoints = clipPolygonToSeamHalfPlane(shape.points, start, seamUnitX, seamUnitY, -1)
    if (polygonArea(positivePoints) <= EPSILON || polygonArea(negativePoints) <= EPSILON) {
      result.push(group)
      continue
    }

    result.push(
      {
        id: uniqueSplitId(`${group.id}-a`, usedIds),
        shapes: [polygon(shape.color, positivePoints)],
      },
      {
        id: uniqueSplitId(`${group.id}-b`, usedIds),
        shapes: [polygon(shape.color, negativePoints)],
      },
    )
  }

  return result
}

function polygonArea(points: readonly Point[]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index]
    const [x2, y2] = points[(index + 1) % points.length]
    twiceArea += x1 * y2 - y1 * x2
  }
  return Math.abs(twiceArea) / 2
}

function polygonsOverlap(first: readonly Point[], second: readonly Point[]): boolean {
  if (first.length < 3 || second.length < 3 || polygonArea(first) <= EPSILON || polygonArea(second) <= EPSILON) {
    return false
  }

  for (const polygonPoints of [first, second]) {
    for (let index = 0; index < polygonPoints.length; index += 1) {
      const [startX, startY] = polygonPoints[index]
      const [endX, endY] = polygonPoints[(index + 1) % polygonPoints.length]
      const axisX = -(endY - startY)
      const axisY = endX - startX
      if (Math.abs(axisX) <= EPSILON && Math.abs(axisY) <= EPSILON) continue

      let firstMin = Number.POSITIVE_INFINITY
      let firstMax = Number.NEGATIVE_INFINITY
      let secondMin = Number.POSITIVE_INFINITY
      let secondMax = Number.NEGATIVE_INFINITY

      for (const [x, y] of first) {
        const projection = x * axisX + y * axisY
        firstMin = Math.min(firstMin, projection)
        firstMax = Math.max(firstMax, projection)
      }
      for (const [x, y] of second) {
        const projection = x * axisX + y * axisY
        secondMin = Math.min(secondMin, projection)
        secondMax = Math.max(secondMax, projection)
      }

      if (Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin) <= EPSILON) return false
    }
  }

  return true
}

export function hasPolygonOverlap(groups: readonly DraftGroup[]): boolean {
  for (let firstGroupIndex = 0; firstGroupIndex < groups.length; firstGroupIndex += 1) {
    for (let secondGroupIndex = firstGroupIndex + 1; secondGroupIndex < groups.length; secondGroupIndex += 1) {
      for (const firstShape of groups[firstGroupIndex].shapes) {
        for (const secondShape of groups[secondGroupIndex].shapes) {
          if (polygonsOverlap(firstShape.points, secondShape.points)) return true
        }
      }
    }
  }

  return false
}
