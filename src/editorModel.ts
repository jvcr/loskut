import type { Language } from './i18n'
import { STANDARD_PATTERNS } from './standardPatterns'
import {
  resolveCuttingRecipe,
  type FlyingGeeseMethod,
  type RecipeMethod,
  type RecipeRole,
  type ResolvedRecipeBlank,
} from './cuttingRecipes'

export type PatternId = string

export type Point = readonly [number, number]
export type GridType = 'rectangle' | 'on-point' | 'triangle' | 'free'
export type QuarterTurn = 0 | 90 | 180 | 270

export interface PatternShape {
  color: number
  points: readonly Point[]
}

export interface BlockEditorGroup {
  id: string
  shapeIndices: readonly number[]
}

export interface BlockEditorData {
  version: 1
  gridDivisions: number
  groups: readonly BlockEditorGroup[]
}

export interface BlockPattern {
  id: PatternId
  name: string
  background: number
  shapes: readonly PatternShape[]
  source?: 'custom' | 'imported'
  unsupportedReason?: string
  editor?: BlockEditorData
  widthCm?: number
  heightCm?: number
}

export interface QuiltCell {
  patternId: PatternId
  rotation: QuarterTurn
  mirrorX?: boolean
  mirrorY?: boolean
  /** Index of the top-left cell which owns this merged cell. */
  offsetX?: number
  offsetY?: number
  scale?: number
  mergedInto?: number
}

export interface FabricPlacement {
  zoom: number
  positionX: number
  positionY: number
}

export interface QuiltDocument {
  version?: number
  name: string
  notes?: string
  rows: number
  columns: number
  blockSizeCm: number
  seamAllowanceCm: number
  palette: readonly string[]
  paletteLocks?: readonly boolean[]
  fabricFills?: readonly (string | null)[]
  fabricPlacements?: readonly FabricPlacement[]
  showGrid?: boolean
  gridType?: GridType
  rowSizesCm?: readonly number[]
  columnSizesCm?: readonly number[]
  customPatterns?: readonly BlockPattern[]
  fabricWidthCm?: number
  backingExtraCm?: number
  bindingWidthCm?: number
  cells: readonly QuiltCell[]
}

const square = (color: number, x: number, y: number, size: number): PatternShape => ({
  color,
  points: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]],
})

export const PATTERNS: readonly BlockPattern[] = [
  { id: 'solid', name: 'Однотонный', background: 0, shapes: [] },
  {
    id: 'hst',
    name: 'Треугольник',
    background: 0,
    shapes: [{ color: 1, points: [[0, 0], [1, 0], [1, 1]] }],
  },
  {
    id: 'hourglass',
    name: 'Песочные часы',
    background: 0,
    shapes: [
      { color: 1, points: [[0, 0], [1, 0], [0.5, 0.5]] },
      { color: 1, points: [[0, 1], [1, 1], [0.5, 0.5]] },
      { color: 2, points: [[1, 0], [1, 1], [0.5, 0.5]] },
    ],
  },
  {
    id: 'pinwheel',
    name: 'Вертушка',
    background: 0,
    shapes: [
      { color: 1, points: [[0, 0], [0.5, 0], [0.5, 0.5]] },
      { color: 1, points: [[1, 0], [1, 0.5], [0.5, 0.5]] },
      { color: 1, points: [[1, 1], [0.5, 1], [0.5, 0.5]] },
      { color: 1, points: [[0, 1], [0, 0.5], [0.5, 0.5]] },
      { color: 2, points: [[0.5, 0], [1, 0], [0.5, 0.5]] },
      { color: 2, points: [[1, 0.5], [1, 1], [0.5, 0.5]] },
    ],
  },
  {
    id: 'checker',
    name: 'Шахматка',
    background: 0,
    shapes: [square(1, 0, 0, 0.5), square(1, 0.5, 0.5, 0.5)],
  },
  {
    id: 'stripes',
    name: 'Полосы',
    background: 0,
    shapes: [
      { color: 1, points: [[0, 0], [0.25, 0], [0.25, 1], [0, 1]] },
      { color: 2, points: [[0.5, 0], [0.75, 0], [0.75, 1], [0.5, 1]] },
    ],
  },
  {
    id: 'diamond',
    name: 'Ромб',
    background: 0,
    shapes: [
      { color: 1, points: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] },
      { color: 2, points: [[0.5, 0.22], [0.78, 0.5], [0.5, 0.78], [0.22, 0.5]] },
    ],
  },
  ...STANDARD_PATTERNS,
]

export const DEFAULT_PALETTE = ['#fffaf4', '#ef476f', '#7c5cff', '#0f9f92'] as const
export const CURRENT_DOCUMENT_VERSION = 2
export const DETAILED_SEAM_ALLOWANCE_CM = 0.635

const finitePositive = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

const finiteNonNegative = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

const positiveInteger = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.round(value) : fallback

const normalizeRotation = (value: unknown): QuarterTurn => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return (((Math.round(value / 90) * 90) % 360 + 360) % 360) as QuarterTurn
}

const normalizeSizes = (value: unknown, length: number, fallback: number): number[] => {
  const source = Array.isArray(value) ? value : []
  return Array.from({ length }, (_, index) => finitePositive(source[index], fallback))
}

const clonePattern = (pattern: BlockPattern): BlockPattern => ({
  ...pattern,
  shapes: pattern.shapes.map((shape) => ({
    ...shape,
    points: shape.points.map(([x, y]) => [x, y] as const),
  })),
  ...(pattern.editor
    ? {
        editor: {
          ...pattern.editor,
          groups: pattern.editor.groups.map((group) => ({
            ...group,
            shapeIndices: [...group.shapeIndices],
          })),
        },
      }
    : {}),
})

export function createDocument(rows = 5, columns = 6): QuiltDocument {
  const safeRows = positiveInteger(rows, 5)
  const safeColumns = positiveInteger(columns, 6)
  const starterPatterns: PatternId[] = ['hst', 'pinwheel', 'hourglass', 'diamond']
  return {
    version: CURRENT_DOCUMENT_VERSION,
    name: 'Мой квилт',
    notes: '',
    rows: safeRows,
    columns: safeColumns,
    blockSizeCm: 25,
    seamAllowanceCm: 0.7,
    palette: [...DEFAULT_PALETTE],
    paletteLocks: DEFAULT_PALETTE.map(() => false),
    fabricFills: DEFAULT_PALETTE.map(() => null),
    fabricPlacements: DEFAULT_PALETTE.map(() => ({ zoom: 1, positionX: 50, positionY: 50 })),
    showGrid: true,
    gridType: 'rectangle',
    rowSizesCm: Array.from({ length: safeRows }, () => 25),
    columnSizesCm: Array.from({ length: safeColumns }, () => 25),
    customPatterns: [],
    fabricWidthCm: 110,
    backingExtraCm: 10,
    bindingWidthCm: 6.35,
    cells: Array.from({ length: safeRows * safeColumns }, (_, index) => ({
      patternId: starterPatterns[(index + Math.floor(index / safeColumns)) % starterPatterns.length],
      rotation: ((index % 4) * 90) as QuarterTurn,
    })),
  }
}

/** Converts persisted or imported data into the current, complete document shape. */
export function migrateDocument(input: unknown): QuiltDocument {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const rows = positiveInteger(source.rows, 5)
  const columns = positiveInteger(source.columns, 6)
  const blockSizeCm = finitePositive(source.blockSizeCm, 25)
  const rawPalette = Array.isArray(source.palette)
    ? source.palette.filter((color): color is string => typeof color === 'string' && color.length > 0)
    : []
  const palette = rawPalette.length > 0 ? rawPalette : [...DEFAULT_PALETTE]
  const rawCells = Array.isArray(source.cells) ? source.cells : []
  const cellCount = rows * columns
  const cells: QuiltCell[] = Array.from({ length: cellCount }, (_, index) => {
    const raw = rawCells[index]
    const cell = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const mergedInto = typeof cell.mergedInto === 'number'
      && Number.isInteger(cell.mergedInto)
      && cell.mergedInto >= 0
      && cell.mergedInto < cellCount
      && cell.mergedInto !== index
      ? cell.mergedInto
      : undefined
    return {
      patternId: typeof cell.patternId === 'string' && cell.patternId ? cell.patternId : 'solid',
      rotation: normalizeRotation(cell.rotation),
      ...(cell.mirrorX === true ? { mirrorX: true } : {}),
      ...(cell.mirrorY === true ? { mirrorY: true } : {}),
      ...(mergedInto === undefined ? {} : { mergedInto }),
      ...(typeof cell.offsetX === 'number' && Number.isFinite(cell.offsetX) ? { offsetX: cell.offsetX } : {}),
      ...(typeof cell.offsetY === 'number' && Number.isFinite(cell.offsetY) ? { offsetY: cell.offsetY } : {}),
      ...(typeof cell.scale === 'number' && Number.isFinite(cell.scale) && cell.scale > 0 ? { scale: cell.scale } : {}),
    }
  })
  const rawCustomPatterns = Array.isArray(source.customPatterns) ? source.customPatterns : []
  const customPatterns = rawCustomPatterns.flatMap((raw): BlockPattern[] => {
    if (!raw || typeof raw !== 'object') return []
    const pattern = raw as Record<string, unknown>
    if (typeof pattern.id !== 'string' || !pattern.id || !Array.isArray(pattern.shapes)) return []
    const shapes = pattern.shapes.flatMap((rawShape): PatternShape[] => {
      if (!rawShape || typeof rawShape !== 'object') return []
      const shape = rawShape as Record<string, unknown>
      if (typeof shape.color !== 'number' || !Number.isInteger(shape.color) || !Array.isArray(shape.points)) return []
      const points = shape.points.flatMap((point): Point[] =>
        Array.isArray(point) && point.length >= 2 && typeof point[0] === 'number' && typeof point[1] === 'number'
          ? [[point[0], point[1]] as const]
          : [])
      return points.length >= 3 ? [{ color: shape.color as number, points }] : []
    })
    const rawEditor = pattern.editor && typeof pattern.editor === 'object'
      ? pattern.editor as Record<string, unknown>
      : undefined
    const rawGroups = rawEditor && Array.isArray(rawEditor.groups) ? rawEditor.groups : []
    const editorGroups = rawGroups.flatMap((rawGroup): BlockEditorGroup[] => {
      if (!rawGroup || typeof rawGroup !== 'object') return []
      const group = rawGroup as Record<string, unknown>
      if (typeof group.id !== 'string' || !group.id || !Array.isArray(group.shapeIndices)) return []
      const shapeIndices = [...new Set(group.shapeIndices.filter((value): value is number =>
        typeof value === 'number'
        && Number.isInteger(value)
        && value >= 0
        && value < shapes.length))]
      return shapeIndices.length > 0 ? [{ id: group.id, shapeIndices }] : []
    })
    const gridDivisions = rawEditor && typeof rawEditor.gridDivisions === 'number'
      && Number.isInteger(rawEditor.gridDivisions)
      && rawEditor.gridDivisions >= 1
      && rawEditor.gridDivisions <= 32
      ? rawEditor.gridDivisions
      : 8
    return [{
      id: pattern.id,
      name: typeof pattern.name === 'string' && pattern.name ? pattern.name : pattern.id,
      background: typeof pattern.background === 'number' && Number.isInteger(pattern.background) ? pattern.background : 0,
      shapes,
      source: pattern.source === 'imported' ? 'imported' : 'custom',
      ...(typeof pattern.unsupportedReason === 'string' && pattern.unsupportedReason
        ? { unsupportedReason: pattern.unsupportedReason }
        : {}),
      ...(rawEditor
        ? {
            editor: {
              version: 1,
              gridDivisions,
              groups: editorGroups,
            } satisfies BlockEditorData,
          }
        : {}),
      ...(typeof pattern.widthCm === 'number' && Number.isFinite(pattern.widthCm) && pattern.widthCm > 0
        ? { widthCm: pattern.widthCm }
        : {}),
      ...(typeof pattern.heightCm === 'number' && Number.isFinite(pattern.heightCm) && pattern.heightCm > 0
        ? { heightCm: pattern.heightCm }
        : {}),
    }]
  })
  const locks = Array.isArray(source.paletteLocks) ? source.paletteLocks : []
  const rawFabricFills = Array.isArray(source.fabricFills) ? source.fabricFills : []
  const rawFabricPlacements = Array.isArray(source.fabricPlacements) ? source.fabricPlacements : []
  const gridTypes: readonly GridType[] = ['rectangle', 'on-point', 'triangle', 'free']
  return {
    version: CURRENT_DOCUMENT_VERSION,
    name: typeof source.name === 'string' && source.name ? source.name : 'Мой квилт',
    notes: typeof source.notes === 'string' ? source.notes : '',
    rows,
    columns,
    blockSizeCm,
    seamAllowanceCm: finitePositive(source.seamAllowanceCm, 0.7),
    palette,
    paletteLocks: palette.map((_, index) => locks[index] === true),
    fabricFills: palette.map((_, index) => typeof rawFabricFills[index] === 'string' ? rawFabricFills[index] as string : null),
    fabricPlacements: palette.map((_, index) => {
      const raw = rawFabricPlacements[index]
      const placement = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
      return {
        zoom: Math.max(1, Math.min(4, finitePositive(placement.zoom, 1))),
        positionX: Math.max(0, Math.min(100, finiteNonNegative(placement.positionX, 50))),
        positionY: Math.max(0, Math.min(100, finiteNonNegative(placement.positionY, 50))),
      }
    }),
    showGrid: source.showGrid !== false,
    gridType: gridTypes.includes(source.gridType as GridType) ? source.gridType as GridType : 'rectangle',
    rowSizesCm: normalizeSizes(source.rowSizesCm, rows, blockSizeCm),
    columnSizesCm: normalizeSizes(source.columnSizesCm, columns, blockSizeCm),
    customPatterns,
    fabricWidthCm: finitePositive(source.fabricWidthCm, 110),
    backingExtraCm: finiteNonNegative(source.backingExtraCm, 10),
    bindingWidthCm: finitePositive(source.bindingWidthCm, 6.35),
    cells,
  }
}

const emptyCell = (): QuiltCell => ({ patternId: 'solid', rotation: 0 })

function remapMergedCells(
  cells: readonly QuiltCell[],
  oldColumns: number,
  mapPosition: (row: number, column: number) => readonly [number, number] | undefined,
  newColumns: number,
): QuiltCell[] {
  return cells.flatMap((cell, oldIndex): QuiltCell[] => {
    const mapped = mapPosition(Math.floor(oldIndex / oldColumns), oldIndex % oldColumns)
    if (!mapped) return []
    const nextIndex = mapped[0] * newColumns + mapped[1]
    let mergedInto: number | undefined
    if (cell.mergedInto !== undefined) {
      const owner = mapPosition(Math.floor(cell.mergedInto / oldColumns), cell.mergedInto % oldColumns)
      if (owner) mergedInto = owner[0] * newColumns + owner[1]
    }
    return [{ ...cell, ...(mergedInto === undefined || mergedInto === nextIndex ? {} : { mergedInto }) }]
  })
}

export function resizeDocument(document: QuiltDocument, rows: number, columns: number): QuiltDocument {
  const safeRows = Math.max(1, Math.min(12, Math.round(rows)))
  const safeColumns = Math.max(1, Math.min(12, Math.round(columns)))
  const cells = Array.from({ length: safeRows * safeColumns }, (_, index) => {
    const oldRow = Math.floor(index / safeColumns)
    const oldColumn = index % safeColumns
    const cell = document.cells[oldRow * document.columns + oldColumn]
    if (!cell) return emptyCell()
    if (cell.mergedInto === undefined) return cell
    const ownerRow = Math.floor(cell.mergedInto / document.columns)
    const ownerColumn = cell.mergedInto % document.columns
    return ownerRow < safeRows && ownerColumn < safeColumns
      ? { ...cell, mergedInto: ownerRow * safeColumns + ownerColumn }
      : withoutMerge(cell)
  })
  return {
    ...document,
    rows: safeRows,
    columns: safeColumns,
    rowSizesCm: normalizeSizes(document.rowSizesCm, safeRows, document.blockSizeCm),
    columnSizesCm: normalizeSizes(document.columnSizesCm, safeColumns, document.blockSizeCm),
    cells,
  }
}

export function insertRow(document: QuiltDocument, at = document.rows): QuiltDocument {
  const index = Math.max(0, Math.min(document.rows, Math.round(at)))
  const cells: QuiltCell[] = []
  for (let row = 0; row <= document.rows; row += 1) {
    if (row === index) cells.push(...Array.from({ length: document.columns }, emptyCell))
    if (row < document.rows) cells.push(...document.cells.slice(row * document.columns, (row + 1) * document.columns))
  }
  const remapped = cells.map((cell) => {
    if (cell.mergedInto === undefined) return cell
    const ownerRow = Math.floor(cell.mergedInto / document.columns)
    const ownerColumn = cell.mergedInto % document.columns
    return { ...cell, mergedInto: (ownerRow >= index ? ownerRow + 1 : ownerRow) * document.columns + ownerColumn }
  })
  const sizes = normalizeSizes(document.rowSizesCm, document.rows, document.blockSizeCm)
  return {
    ...document,
    rows: document.rows + 1,
    rowSizesCm: [...sizes.slice(0, index), document.blockSizeCm, ...sizes.slice(index)],
    cells: remapped,
  }
}

export function removeRow(document: QuiltDocument, at: number): QuiltDocument {
  const index = Math.round(at)
  if (document.rows <= 1 || index < 0 || index >= document.rows) return document
  const cells = remapMergedCells(
    document.cells,
    document.columns,
    (row, column) => row === index ? undefined : [row > index ? row - 1 : row, column],
    document.columns,
  )
  const sizes = normalizeSizes(document.rowSizesCm, document.rows, document.blockSizeCm)
  return { ...document, rows: document.rows - 1, rowSizesCm: sizes.filter((_, row) => row !== index), cells }
}

export function insertColumn(document: QuiltDocument, at = document.columns): QuiltDocument {
  const index = Math.max(0, Math.min(document.columns, Math.round(at)))
  const newColumns = document.columns + 1
  const cells: QuiltCell[] = []
  for (let row = 0; row < document.rows; row += 1) {
    const oldRow = document.cells.slice(row * document.columns, (row + 1) * document.columns)
    cells.push(...oldRow.slice(0, index), emptyCell(), ...oldRow.slice(index))
  }
  const remapped = cells.map((cell) => {
    if (cell.mergedInto === undefined) return cell
    const ownerRow = Math.floor(cell.mergedInto / document.columns)
    const ownerColumn = cell.mergedInto % document.columns
    return { ...cell, mergedInto: ownerRow * newColumns + (ownerColumn >= index ? ownerColumn + 1 : ownerColumn) }
  })
  const sizes = normalizeSizes(document.columnSizesCm, document.columns, document.blockSizeCm)
  return {
    ...document,
    columns: newColumns,
    columnSizesCm: [...sizes.slice(0, index), document.blockSizeCm, ...sizes.slice(index)],
    cells: remapped,
  }
}

export function removeColumn(document: QuiltDocument, at: number): QuiltDocument {
  const index = Math.round(at)
  if (document.columns <= 1 || index < 0 || index >= document.columns) return document
  const newColumns = document.columns - 1
  const cells = remapMergedCells(
    document.cells,
    document.columns,
    (row, column) => column === index ? undefined : [row, column > index ? column - 1 : column],
    newColumns,
  )
  const sizes = normalizeSizes(document.columnSizesCm, document.columns, document.blockSizeCm)
  return { ...document, columns: newColumns, columnSizesCm: sizes.filter((_, column) => column !== index), cells }
}

export function resizeRow(document: QuiltDocument, row: number, sizeCm: number): QuiltDocument {
  if (!Number.isInteger(row) || row < 0 || row >= document.rows || !Number.isFinite(sizeCm) || sizeCm <= 0) return document
  const sizes = normalizeSizes(document.rowSizesCm, document.rows, document.blockSizeCm)
  return { ...document, rowSizesCm: sizes.map((size, index) => index === row ? sizeCm : size) }
}

export function resizeColumn(document: QuiltDocument, column: number, sizeCm: number): QuiltDocument {
  if (!Number.isInteger(column) || column < 0 || column >= document.columns || !Number.isFinite(sizeCm) || sizeCm <= 0) return document
  const sizes = normalizeSizes(document.columnSizesCm, document.columns, document.blockSizeCm)
  return { ...document, columnSizesCm: sizes.map((size, index) => index === column ? sizeCm : size) }
}

export function updateCells(
  document: QuiltDocument,
  indices: readonly number[],
  update: (cell: QuiltCell) => QuiltCell,
): QuiltDocument {
  const selected = new Set(indices)
  return {
    ...document,
    cells: document.cells.map((cell, index) => selected.has(index) ? update(cell) : cell),
  }
}

export function rotateCell(cell: QuiltCell): QuiltCell {
  return { ...cell, rotation: ((cell.rotation + 90) % 360) as QuarterTurn }
}

export type SelectionPreset = 'all' | 'odd' | 'even' | 'border' | 'diagonal' | 'clear'

export function selectPreset(document: QuiltDocument, preset: SelectionPreset): number[] {
  if (preset === 'clear') return []
  return document.cells.flatMap((_, index) => {
    const row = Math.floor(index / document.columns)
    const column = index % document.columns
    if (preset === 'all') return [index]
    if (preset === 'odd') return (row + column) % 2 === 0 ? [index] : []
    if (preset === 'even') return (row + column) % 2 === 1 ? [index] : []
    if (preset === 'border') return row === 0 || column === 0 || row === document.rows - 1 || column === document.columns - 1 ? [index] : []
    return row === column ? [index] : []
  })
}

const cleanIndices = (document: QuiltDocument, indices: readonly number[]): number[] =>
  [...new Set(indices)].filter((index) => Number.isInteger(index) && index >= 0 && index < document.cells.length).sort((a, b) => a - b)

const withoutMerge = (cell: QuiltCell): QuiltCell => {
  const { mergedInto: _mergedInto, ...rest } = cell
  return rest
}

export function unmergeCells(document: QuiltDocument, indices: readonly number[]): QuiltDocument {
  const selected = cleanIndices(document, indices)
  if (selected.length === 0) return document
  const owners = new Set(selected.map((index) => document.cells[index].mergedInto ?? index))
  for (const index of selected) {
    if (document.cells.some((cell) => cell.mergedInto === index)) owners.add(index)
  }
  let changed = false
  const cells = document.cells.map((cell, index) => {
    if (!owners.has(index) && (cell.mergedInto === undefined || !owners.has(cell.mergedInto))) return cell
    if (cell.mergedInto === undefined) return cell
    changed = true
    return withoutMerge(cell)
  })
  return changed ? { ...document, cells } : document
}

export function mergeCells(document: QuiltDocument, indices: readonly number[]): QuiltDocument {
  const selected = cleanIndices(document, indices)
  if (selected.length < 2) return document
  const rows = selected.map((index) => Math.floor(index / document.columns))
  const columns = selected.map((index) => index % document.columns)
  const minRow = Math.min(...rows)
  const maxRow = Math.max(...rows)
  const minColumn = Math.min(...columns)
  const maxColumn = Math.max(...columns)
  if ((maxRow - minRow + 1) * (maxColumn - minColumn + 1) !== selected.length) return document
  const selectedSet = new Set(selected)
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (!selectedSet.has(row * document.columns + column)) return document
    }
  }
  const cleared = unmergeCells(document, selected)
  const owner = minRow * document.columns + minColumn
  return {
    ...cleared,
    cells: cleared.cells.map((cell, index) => {
      if (!selectedSet.has(index)) return cell
      const unmerged = withoutMerge(cell)
      return index === owner ? unmerged : { ...unmerged, mergedInto: owner }
    }),
  }
}

export function mirrorCells(document: QuiltDocument, indices: readonly number[], axis: 'x' | 'y'): QuiltDocument {
  return updateCells(document, cleanIndices(document, indices), (cell) => axis === 'x'
    ? { ...cell, mirrorX: !cell.mirrorX }
    : { ...cell, mirrorY: !cell.mirrorY })
}

export function randomizeCellRotations(
  document: QuiltDocument,
  indices: readonly number[],
  random: () => number = Math.random,
): QuiltDocument {
  return updateCells(document, cleanIndices(document, indices), (cell) => ({
    ...cell,
    rotation: (Math.min(3, Math.max(0, Math.floor(random() * 4))) * 90) as QuarterTurn,
  }))
}

export function resetCellRotations(document: QuiltDocument, indices: readonly number[]): QuiltDocument {
  return updateCells(document, cleanIndices(document, indices), (cell) => ({ ...cell, rotation: 0 }))
}

export function cloneCustomPattern(document: QuiltDocument, sourceId: PatternId): QuiltDocument {
  const source = patternById(sourceId, document.customPatterns)
  const usedIds = new Set([...PATTERNS, ...(document.customPatterns ?? [])].map((pattern) => pattern.id))
  const base = `${source.id}-copy`
  let id = base
  let suffix = 2
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  const copy = clonePattern({
    ...source,
    id,
    name: `${source.name} — копия`,
    source: 'custom',
    unsupportedReason: source.unsupportedReason,
  })
  return { ...document, customPatterns: [...(document.customPatterns ?? []), copy] }
}

export interface QuiltEstimate {
  finishedWidthCm: number
  finishedHeightCm: number
  fabricMeters: number
  blocks: number
}

const documentSizes = (document: QuiltDocument) => ({
  rows: normalizeSizes(document.rowSizesCm, document.rows, document.blockSizeCm),
  columns: normalizeSizes(document.columnSizesCm, document.columns, document.blockSizeCm),
})

export function calculateQuilt(document: QuiltDocument): QuiltEstimate {
  const sizes = documentSizes(document)
  const blocks = document.rows * document.columns
  const finishedWidthCm = sizes.columns.reduce((sum, size) => sum + size, 0)
  const finishedHeightCm = sizes.rows.reduce((sum, size) => sum + size, 0)
  const totalFabricAreaCm2 = sizes.rows.reduce((sum, height) => sum
    + sizes.columns.reduce((rowSum, width) => rowSum
      + (width + 2 * document.seamAllowanceCm) * (height + 2 * document.seamAllowanceCm) * 1.1, 0), 0)
  return {
    finishedWidthCm,
    finishedHeightCm,
    fabricMeters: Math.ceil((totalFabricAreaCm2 / 110 / 100) * 10) / 10,
    blocks,
  }
}

export interface ColorFabricEstimate {
  color: string
  areaRatio: number
  fabricMeters: number
}

function polygonSignedArea(points: readonly Point[]): number {
  return points.reduce((area, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length]
    return area + x * nextY - nextX * y
  }, 0) / 2
}

const polygonArea = (points: readonly Point[]): number => Math.abs(polygonSignedArea(points))

function isConvexPolygon(points: readonly Point[]): boolean {
  if (points.length < 3 || polygonArea(points) <= 1e-10) return false
  let direction = 0
  for (let index = 0; index < points.length; index += 1) {
    const [ax, ay] = points[index]
    const [bx, by] = points[(index + 1) % points.length]
    const [cx, cy] = points[(index + 2) % points.length]
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
    if (Math.abs(cross) <= 1e-10) continue
    const nextDirection = Math.sign(cross)
    if (direction !== 0 && direction !== nextDirection) return false
    direction = nextDirection
  }
  return direction !== 0
}

function intersectConvex(subject: readonly Point[], clip: readonly Point[]): Point[] {
  let output = [...subject]
  const orientation = Math.sign(polygonSignedArea(clip)) || 1
  for (let edge = 0; edge < clip.length && output.length > 0; edge += 1) {
    const edgeStart = clip[edge]
    const edgeEnd = clip[(edge + 1) % clip.length]
    const input = output
    output = []
    const inside = ([x, y]: Point) => orientation
      * ((edgeEnd[0] - edgeStart[0]) * (y - edgeStart[1]) - (edgeEnd[1] - edgeStart[1]) * (x - edgeStart[0])) >= -1e-10
    const intersection = (start: Point, end: Point): Point => {
      const dx = end[0] - start[0]
      const dy = end[1] - start[1]
      const ex = edgeEnd[0] - edgeStart[0]
      const ey = edgeEnd[1] - edgeStart[1]
      const denominator = dx * ey - dy * ex
      if (Math.abs(denominator) <= 1e-12) return end
      const t = ((edgeStart[0] - start[0]) * ey - (edgeStart[1] - start[1]) * ex) / denominator
      return [start[0] + t * dx, start[1] + t * dy]
    }
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]
      const previous = input[(index + input.length - 1) % input.length]
      const currentInside = inside(current)
      const previousInside = inside(previous)
      if (currentInside) {
        if (!previousInside) output.push(intersection(previous, current))
        output.push(current)
      } else if (previousInside) {
        output.push(intersection(previous, current))
      }
    }
  }
  return output
}

function unionIntersectionArea(base: readonly Point[], covers: readonly (readonly Point[])[]): number {
  let total = 0
  const visit = (start: number, intersection: readonly Point[], depth: number) => {
    for (let index = start; index < covers.length; index += 1) {
      const next = intersectConvex(intersection, covers[index])
      const area = polygonArea(next)
      if (area <= 1e-10) continue
      total += depth % 2 === 0 ? area : -area
      visit(index + 1, next, depth + 1)
    }
  }
  visit(0, base, 0)
  return total
}
function simplifyPolygon(points: readonly Point[]): Point[] {
  const distinct = points.filter(([x, y], index) => {
    const [previousX, previousY] = points[(index + points.length - 1) % points.length]
    return Math.abs(x - previousX) > 1e-10 || Math.abs(y - previousY) > 1e-10
  })
  if (distinct.length <= 3) return distinct
  return distinct.filter((point, index) => {
    const previous = distinct[(index + distinct.length - 1) % distinct.length]
    const next = distinct[(index + 1) % distinct.length]
    return Math.abs(
      (point[0] - previous[0]) * (next[1] - point[1])
      - (point[1] - previous[1]) * (next[0] - point[0]),
    ) > 1e-10
  })
}

function clipConvexHalfPlane(
  subject: readonly Point[],
  edgeStart: Point,
  edgeEnd: Point,
  orientation: number,
  keepInside: boolean,
): Point[] {
  if (subject.length === 0) return []
  const signedDistance = ([x, y]: Point) => orientation
    * ((edgeEnd[0] - edgeStart[0]) * (y - edgeStart[1]) - (edgeEnd[1] - edgeStart[1]) * (x - edgeStart[0]))
  const result: Point[] = []
  for (let index = 0; index < subject.length; index += 1) {
    const current = subject[index]
    const previous = subject[(index + subject.length - 1) % subject.length]
    const currentDistance = signedDistance(current)
    const previousDistance = signedDistance(previous)
    const currentKept = keepInside ? currentDistance >= -1e-10 : currentDistance <= 1e-10
    const previousKept = keepInside ? previousDistance >= -1e-10 : previousDistance <= 1e-10
    if (currentKept !== previousKept) {
      const denominator = previousDistance - currentDistance
      if (Math.abs(denominator) > 1e-12) {
        const ratio = previousDistance / denominator
        result.push([
          previous[0] + ratio * (current[0] - previous[0]),
          previous[1] + ratio * (current[1] - previous[1]),
        ])
      }
    }
    if (currentKept) result.push(current)
  }
  return simplifyPolygon(result)
}

function subtractConvex(subject: readonly Point[], clip: readonly Point[]): Point[][] {
  const orientation = Math.sign(polygonSignedArea(clip)) || 1
  let remainder = [...subject]
  const outsidePieces: Point[][] = []
  for (let edge = 0; edge < clip.length && remainder.length > 0; edge += 1) {
    const edgeStart = clip[edge]
    const edgeEnd = clip[(edge + 1) % clip.length]
    const outside = clipConvexHalfPlane(remainder, edgeStart, edgeEnd, orientation, false)
    if (polygonArea(outside) > 1e-10) outsidePieces.push(outside)
    remainder = clipConvexHalfPlane(remainder, edgeStart, edgeEnd, orientation, true)
  }
  return outsidePieces
}

function convexHull(polygons: readonly (readonly Point[])[]): Point[] {
  const points = polygons.flat().map(([x, y]) => [x, y] as Point)
    .sort(([ax, ay], [bx, by]) => ax - bx || ay - by)
    .filter(([x, y], index, ordered) => index === 0
      || Math.abs(x - ordered[index - 1][0]) > 1e-10
      || Math.abs(y - ordered[index - 1][1]) > 1e-10)
  if (points.length <= 2) return points
  const cross = (origin: Point, first: Point, second: Point) =>
    (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0])
  const lower: Point[] = []
  for (const point of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-10) lower.pop()
    lower.push(point)
  }
  const upper: Point[] = []
  for (const point of [...points].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-10) upper.pop()
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function mergeAdjacentConvex(polygons: readonly (readonly Point[])[]): Point[][] {
  const merged = polygons.map((polygon) => [...polygon])
  for (let first = 0; first < merged.length; first += 1) {
    for (let second = first + 1; second < merged.length; second += 1) {
      const hull = convexHull([merged[first], merged[second]])
      const separateArea = polygonArea(merged[first]) + polygonArea(merged[second])
      if (Math.abs(polygonArea(hull) - separateArea) > 1e-9) continue
      merged[first] = hull
      merged.splice(second, 1)
      first = -1
      break
    }
  }
  return merged
}

function backgroundPieces(polygons: readonly (readonly Point[])[]): Point[][] {
  let pieces: Point[][] = [[[0, 0], [1, 0], [1, 1], [0, 1]]]
  for (const polygon of polygons) {
    pieces = pieces.flatMap((piece) => subtractConvex(piece, polygon))
  }
  return mergeAdjacentConvex(pieces)
}


interface PatternFractions {
  fractions: number[]
  pieces: { color: number; fraction: number; polygon: readonly Point[]; isBackground: boolean }[]
  overlap: boolean
  unsupported?: string
}

function exactPatternFractions(pattern: BlockPattern): PatternFractions {
  if (pattern.unsupportedReason) return { fractions: [], pieces: [], overlap: false, unsupported: pattern.unsupportedReason }
  if (pattern.shapes.length > 64) {
    return { fractions: [], pieces: [], overlap: false, unsupported: 'Больше 64 деталей: точный расчёт пересечений отключён.' }
  }
  const polygons = pattern.shapes.map((shape) => shape.points)
  const invalid = polygons.find((points) => !points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1)
    || !isConvexPolygon(points))
  if (invalid) {
    return { fractions: [], pieces: [], overlap: false, unsupported: 'Поддерживаются только выпуклые полигоны в нормализованных координатах 0…1.' }
  }
  let overlap = false
  for (let first = 0; first < polygons.length; first += 1) {
    for (let second = first + 1; second < polygons.length; second += 1) {
      if (polygonArea(intersectConvex(polygons[first], polygons[second])) > 1e-10) overlap = true
    }
  }
  const layers: { color: number; polygon: readonly Point[]; isBackground: boolean }[] = [
    { color: pattern.background, polygon: [[0, 0], [1, 0], [1, 1], [0, 1]], isBackground: true },
    ...pattern.shapes.map((shape) => ({ color: shape.color, polygon: shape.points, isBackground: false })),
  ]
  const fractions: number[] = []
  if (overlap) {
    const pieces: PatternFractions['pieces'] = []
    layers.forEach((layer, index) => {
      const fraction = Math.max(0, polygonArea(layer.polygon) - unionIntersectionArea(layer.polygon, layers.slice(index + 1).map(({ polygon }) => polygon)))
      if (fraction <= 1e-10) return
      fractions[layer.color] = (fractions[layer.color] ?? 0) + fraction
      pieces.push({ ...layer, fraction })
    })
    return { fractions, pieces, overlap }
  }

  const pieces: PatternFractions['pieces'] = [
    ...backgroundPieces(polygons).map((polygon) => ({
      color: pattern.background,
      fraction: polygonArea(polygon),
      polygon,
      isBackground: true,
    })),
    ...pattern.shapes.map((shape) => ({
      color: shape.color,
      fraction: polygonArea(shape.points),
      polygon: shape.points,
      isBackground: false,
    })),
  ]
  pieces.forEach(({ color, fraction }) => {
    fractions[color] = (fractions[color] ?? 0) + fraction
  })
  return { fractions, pieces, overlap }
}

export function calculateFabricByColor(
  document: QuiltDocument,
  fabricWidthCm = 110,
): ColorFabricEstimate[] {
  const colorAreas = document.palette.map(() => 0)
  const sizes = documentSizes(document)
  const fractionsByPattern = new Map<PatternId, number[]>()
  document.cells.forEach((cell, index) => {
    if (cell.mergedInto !== undefined) return
    const fractions = fractionsByPattern.get(cell.patternId)
      ?? exactPatternFractions(patternById(cell.patternId, document.customPatterns)).fractions
    fractionsByPattern.set(cell.patternId, fractions)
    const row = Math.floor(index / document.columns)
    const column = index % document.columns
    const blockAreaCm2 = (sizes.columns[column] + 2 * document.seamAllowanceCm)
      * (sizes.rows[row] + 2 * document.seamAllowanceCm) * 1.1
    fractions.forEach((fraction, paletteIndex) => {
      colorAreas[paletteIndex] = (colorAreas[paletteIndex] ?? 0) + fraction * blockAreaCm2
    })
  })
  const totalArea = colorAreas.reduce((sum, area) => sum + area, 0)
  return document.palette.map((color, index) => ({
    color,
    areaRatio: totalArea === 0 ? 0 : colorAreas[index] / totalArea,
    fabricMeters: Math.ceil((colorAreas[index] / fabricWidthCm / 100) * 10) / 10,
  }))
}

export function randomizeUnlockedPalette(
  document: QuiltDocument,
  colors: readonly string[],
  random: () => number = Math.random,
): QuiltDocument {
  const locks = document.paletteLocks ?? document.palette.map(() => false)
  return {
    ...document,
    palette: document.palette.map((color, index) => {
      if (locks[index] || colors.length === 0) return color
      return colors[Math.min(colors.length - 1, Math.max(0, Math.floor(random() * colors.length)))]
    }),
  }
}

export function patternById(id: PatternId, customPatterns: readonly BlockPattern[] = []): BlockPattern {
  return customPatterns.find((pattern) => pattern.id === id)
    ?? PATTERNS.find((pattern) => pattern.id === id)
    ?? PATTERNS[0]
}

export interface DetailedColorFabricEstimate {
  paletteIndex: number
  color: string
  visibleAreaCm2: number
  cuttingAreaCm2: number
  packedLengthCm: number
  fabricMeters: number
}

export interface BackingEstimate {
  quiltWidthCm: number
  quiltHeightCm: number
  cutWidthCm: number
  cutHeightCm: number
  panels: number
  panelWidthCm: number
  totalLengthCm: number
  fabricMeters: number
}

export interface BindingEstimate {
  perimeterCm: number
  requiredLengthCm: number
  stripWidthCm: number
  strips: number
  fabricMeters: number
}

export interface BlockColorBreakdown {
  paletteIndex: number
  visibleAreaCm2: number
  areaRatio: number
}

export interface BlockBreakdown {
  patternId: PatternId
  patternName: string
  count: number
  colors: readonly BlockColorBreakdown[]
}

export interface CuttingSummary {
  paletteIndex: number
  color: string
  pieces: number
  cuttingAreaCm2: number
  packedLengthCm: number
  fabricMeters: number
  purchaseMeters: number
  wasteAreaCm2: number
}

export interface CutPieceInstruction {
  paletteIndex: number
  color: string
  patternId: PatternId
  patternName: string
  shape: 'square' | 'rectangle' | 'triangle' | 'template'
  method: RecipeMethod
  role: RecipeRole
  finishedWidthCm: number
  finishedHeightCm: number
  cutWidthCm: number
  cutHeightCm: number
  pieces: number
  requiredPieces: number
  batchBlankCount?: number
  batchResultCount?: number
  rectanglesToCut: number
  partnerPaletteIndex?: number
  sourceUrl?: string
}
export type FabricDiagnosticCode =
  | 'custom-pattern'
  | 'imported-pattern'
  | 'oversize-blank'
  | 'overlapping-shapes'
  | 'unsupported-geometry'
  | 'unknown-pattern'
export interface FabricDiagnostic {
  code: FabricDiagnosticCode
  severity: 'info' | 'warning'
  message: string
  patternId?: PatternId
}
export interface ConstructionMethodSummary {
  patternId: PatternId
  patternName: string
  method: RecipeMethod
  sourceUrl: string
}


export interface DetailedFabricEstimate {
  seamAllowanceCm: number
  fabricWidthCm: number
  purchaseReservePercent: number
  topByColor: readonly DetailedColorFabricEstimate[]
  backing: BackingEstimate
  binding: BindingEstimate
  blockBreakdown: readonly BlockBreakdown[]
  cutting: readonly CuttingSummary[]
  pieceInstructions: readonly CutPieceInstruction[]
  constructionMethods: readonly ConstructionMethodSummary[]
  diagnostics: readonly FabricDiagnostic[]
}
export interface DetailedFabricOptions {
  flyingGeeseMethod?: FlyingGeeseMethod
}


const rounded = (value: number, digits = 3): number => Number(value.toFixed(digits))
const metersRoundedUp = (lengthCm: number): number => Math.ceil(lengthCm / 10) / 10

interface PackingPiece { width: number; height: number }
interface PackingResult { lengthCm: number; oversized: readonly PackingPiece[] }

function packAcrossWidth(pieces: readonly PackingPiece[], fabricWidthCm: number): PackingResult {
  const oversized: PackingPiece[] = []
  const fitting = pieces.flatMap((piece): PackingPiece[] => {
    if (piece.width <= fabricWidthCm + 1e-9) return [piece]
    if (piece.height <= fabricWidthCm + 1e-9) {
      return [{ width: piece.height, height: piece.width }]
    }
    oversized.push(piece)
    return []
  })
  const shelves: { usedWidth: number; height: number }[] = []
  const ordered = fitting.sort((a, b) => b.height - a.height || b.width - a.width)
  for (const piece of ordered) {
    const shelf = shelves.find((candidate) => candidate.usedWidth + piece.width <= fabricWidthCm + 1e-9)
    if (shelf) shelf.usedWidth += piece.width
    else shelves.push({ usedWidth: piece.width, height: piece.height })
  }
  return {
    lengthCm: shelves.reduce((sum, shelf) => sum + shelf.height, 0)
      + oversized.reduce((sum, piece) => sum + Math.max(piece.width, piece.height), 0),
    oversized,
  }
}

const isDiagonalSquareMethod = (method: RecipeMethod): boolean =>
  method === 'hst-two-at-a-time' || method === 'qst-two-at-a-time'

const isSquareOnlyRecipeMethod = (method: RecipeMethod): boolean =>
  isDiagonalSquareMethod(method)
  || method === 'flying-geese-sew-and-flip'
  || method === 'flying-geese-no-waste'

const isUnstretchedSquare = (width: number, height: number): boolean =>
  Math.abs(width - height) <= Math.max(1, width, height) * 1e-6

/** Source-backed cutting plan for built-ins; ambiguous geometry uses diagnosed template blanks. */
export function calculateDetailedFabric(
  document: QuiltDocument,
  language: Language = 'ru',
  options: DetailedFabricOptions = {},
): DetailedFabricEstimate {
  const fabricWidthCm = finitePositive(document.fabricWidthCm, 110)
  const backingExtraCm = finiteNonNegative(document.backingExtraCm, 10)
  const bindingWidthCm = finitePositive(document.bindingWidthCm, 6.35)
  const sizes = documentSizes(document)
  const quiltWidthCm = sizes.columns.reduce((sum, size) => sum + size, 0)
  const quiltHeightCm = sizes.rows.reduce((sum, size) => sum + size, 0)
  const diagnostics: FabricDiagnostic[] = []
  if ((document.gridType ?? 'rectangle') !== 'rectangle') {
    diagnostics.push({
      code: 'unsupported-geometry',
      severity: 'warning',
      message: language === 'ru'
        ? `Сетка «${document.gridType}» рассчитана по ограничивающему прямоугольнику; проверьте размеры вручную.`
        : `The ${document.gridType} grid was calculated using its bounding rectangle; verify the dimensions manually.`,
    })
  }

  const fractionsCache = new Map<PatternId, PatternFractions>()
  const reported = new Set<string>()
  const visibleAreas = document.palette.map(() => 0)
  const cuttingAreas = document.palette.map(() => 0)
  const packingPieces = document.palette.map((): PackingPiece[] => [])
  const pieceCounts = document.palette.map(() => 0)
  const breakdown = new Map<PatternId, { pattern: BlockPattern; count: number; areas: number[] }>()
  const pieceInstructionDrafts = new Map<string, CutPieceInstruction>()
  const constructionMethodDrafts = new Map<PatternId, ConstructionMethodSummary>()
  const registerInstruction = (
    pattern: BlockPattern,
    instruction: Omit<CutPieceInstruction, 'color' | 'patternId' | 'patternName'>,
  ) => {
    if (instruction.paletteIndex < 0 || instruction.paletteIndex >= document.palette.length) return
    const key = [
      pattern.id,
      instruction.paletteIndex,
      instruction.method,
      instruction.role,
      instruction.shape,
      rounded(instruction.finishedWidthCm),
      rounded(instruction.finishedHeightCm),
      rounded(instruction.cutWidthCm),
      rounded(instruction.cutHeightCm),
      instruction.partnerPaletteIndex ?? '',
      instruction.batchBlankCount ?? '',
      instruction.batchResultCount ?? '',
    ].join(':')
    const existing = pieceInstructionDrafts.get(key)
    if (existing) {
      existing.pieces += instruction.pieces
      existing.requiredPieces += instruction.requiredPieces
      existing.rectanglesToCut += instruction.rectanglesToCut
      return
    }
    pieceInstructionDrafts.set(key, {
      ...instruction,
      color: document.palette[instruction.paletteIndex],
      patternId: pattern.id,
      patternName: pattern.name,
      finishedWidthCm: rounded(instruction.finishedWidthCm),
      finishedHeightCm: rounded(instruction.finishedHeightCm),
      cutWidthCm: rounded(instruction.cutWidthCm),
      cutHeightCm: rounded(instruction.cutHeightCm),
    })
  }
  const registerConservativeBlank = (
    pattern: BlockPattern,
    paletteIndex: number,
    blockWidthCm: number,
    blockHeightCm: number,
  ) => {
    registerInstruction(pattern, {
      paletteIndex,
      shape: 'template',
      method: 'template',
      role: 'template',
      finishedWidthCm: blockWidthCm,
      finishedHeightCm: blockHeightCm,
      cutWidthCm: blockWidthCm + 2 * DETAILED_SEAM_ALLOWANCE_CM,
      cutHeightCm: blockHeightCm + 2 * DETAILED_SEAM_ALLOWANCE_CM,
      pieces: 1,
      requiredPieces: 1,
      rectanglesToCut: 1,
    })
  }
  const registerRecipeBlank = (
    pattern: BlockPattern,
    blank: ResolvedRecipeBlank,
    sourceUrl: string,
  ) => {
    registerInstruction(pattern, {
      paletteIndex: blank.paletteIndex,
      shape: blank.shape,
      method: blank.method,
      role: blank.role,
      finishedWidthCm: blank.finishedWidthCm,
      finishedHeightCm: blank.finishedHeightCm,
      cutWidthCm: blank.cutWidthCm,
      cutHeightCm: blank.cutHeightCm,
      pieces: blank.resultingPieces,
      requiredPieces: blank.resultingPieces,
      batchBlankCount: blank.batchBlankCount,
      batchResultCount: blank.batchResultCount,
      rectanglesToCut: blank.blanks,
      partnerPaletteIndex: blank.partnerPaletteIndex,
      sourceUrl,
    })
  }
  const mergedChildren = new Map<number, number[]>()
  document.cells.forEach((cell, index) => {
    if (cell.mergedInto === undefined) return
    const children = mergedChildren.get(cell.mergedInto) ?? []
    children.push(index)
    mergedChildren.set(cell.mergedInto, children)
  })

  document.cells.forEach((cell, index) => {
    if (cell.mergedInto !== undefined) return
    const custom = document.customPatterns?.find((pattern) => pattern.id === cell.patternId)
    const builtIn = PATTERNS.find((pattern) => pattern.id === cell.patternId)
    const pattern = custom ?? builtIn ?? PATTERNS[0]
    if (!custom && !builtIn && !reported.has(`unknown:${cell.patternId}`)) {
      reported.add(`unknown:${cell.patternId}`)
      diagnostics.push({
        code: 'unknown-pattern',
        severity: 'warning',
        patternId: cell.patternId,
        message: language === 'ru'
          ? `Узор «${cell.patternId}» не найден; использован однотонный блок.`
          : `Pattern “${cell.patternId}” was not found; a solid block was used.`,
      })
    }
    if (custom && !reported.has(`custom:${pattern.id}`)) {
      reported.add(`custom:${pattern.id}`)
      diagnostics.push({
        code: pattern.source === 'imported' ? 'imported-pattern' : 'custom-pattern',
        severity: 'warning',
        patternId: pattern.id,
        message: language === 'ru'
          ? pattern.source === 'imported'
            ? `Импортированный узор «${pattern.name}»: физическая сборка неоднозначна; использован консервативный план полноразмерных шаблонных заготовок.`
            : `Пользовательский узор «${pattern.name}»: физическая сборка неоднозначна; использован консервативный план полноразмерных шаблонных заготовок.`
          : pattern.source === 'imported'
            ? `Imported pattern “${pattern.name}”: physical assembly is ambiguous; a conservative plan of full-size template blanks was used.`
            : `Custom pattern “${pattern.name}”: physical assembly is ambiguous; a conservative plan of full-size template blanks was used.`,
      })
    }
    const fractions = fractionsCache.get(pattern.id) ?? exactPatternFractions(pattern)
    fractionsCache.set(pattern.id, fractions)
    if (fractions.unsupported && !reported.has(`unsupported:${pattern.id}`)) {
      reported.add(`unsupported:${pattern.id}`)
      diagnostics.push({
        code: 'unsupported-geometry',
        severity: 'warning',
        patternId: pattern.id,
        message: language === 'ru'
          ? `${pattern.name}: ${fractions.unsupported}`
          : `${pattern.name}: this geometry cannot be calculated exactly; a conservative full-block estimate was used.`,
      })
    }
    if (custom && fractions.overlap && !reported.has(`overlap:${pattern.id}`)) {
      reported.add(`overlap:${pattern.id}`)
      diagnostics.push({
        code: 'overlapping-shapes',
        severity: 'warning',
        patternId: pattern.id,
        message: language === 'ru'
          ? `${pattern.name}: перекрывающиеся слои не задают однозначных физических деталей; использован консервативный план полноразмерных шаблонных заготовок.`
          : `${pattern.name}: overlapping layers do not define unambiguous physical pieces; a conservative plan of full-size template blanks was used.`,
      })
    }

    const ownerRow = Math.floor(index / document.columns)
    const ownerColumn = index % document.columns
    const group = mergedChildren.get(index) ?? []
    const rows = [ownerRow, ...group.map((child) => Math.floor(child / document.columns))]
    const columns = [ownerColumn, ...group.map((child) => child % document.columns)]
    const minRow = Math.min(...rows)
    const maxRow = Math.max(...rows)
    const minColumn = Math.min(...columns)
    const maxColumn = Math.max(...columns)
    const width = sizes.columns.slice(minColumn, maxColumn + 1).reduce((sum, size) => sum + size, 0)
    const height = sizes.rows.slice(minRow, maxRow + 1).reduce((sum, size) => sum + size, 0)
    const finishedArea = width * height
    if (!fractions.unsupported) {
      const entry = breakdown.get(pattern.id) ?? { pattern, count: 0, areas: [] }
      entry.count += 1
      fractions.fractions.forEach((fraction, paletteIndex) => {
        if (paletteIndex < 0 || paletteIndex >= document.palette.length) return
        const visible = fraction * finishedArea
        visibleAreas[paletteIndex] += visible
        entry.areas[paletteIndex] = (entry.areas[paletteIndex] ?? 0) + visible
      })
      breakdown.set(pattern.id, entry)
    }

    const recipe = builtIn && !custom
      ? resolveCuttingRecipe(pattern.id, {
          widthCm: width,
          heightCm: height,
          seamCm: DETAILED_SEAM_ALLOWANCE_CM,
          flyingGeeseMethod: options.flyingGeeseMethod,
        })
      : null
    const squareRecipeOnStretchedBlock = recipe !== null
      && pattern.id !== 'flying-geese'
      && (isSquareOnlyRecipeMethod(recipe.method)
        || recipe.blanks.some(({ method }) => isSquareOnlyRecipeMethod(method)))
      && !isUnstretchedSquare(width, height)
    const invalidFlyingGeeseUnit = recipe !== null
      && pattern.id === 'flying-geese'
      && recipe.blanks.some(({ method }) => method === 'template')
    if (invalidFlyingGeeseUnit && !reported.has(`invalid-flying-geese:${pattern.id}`)) {
      reported.add(`invalid-flying-geese:${pattern.id}`)
      diagnostics.push({
        code: 'unsupported-geometry',
        severity: 'warning',
        patternId: pattern.id,
        message: options.flyingGeeseMethod === 'no-waste'
          ? language === 'ru'
            ? `${pattern.name}: для метода Flying Geese без отходов ширина готового блока должна в точности вдвое превышать высоту; использованы полноразмерные шаблонные заготовки.`
            : `${pattern.name}: the no-waste Flying Geese method requires a finished unit exactly twice as wide as it is tall; full-size template blanks were used.`
          : language === 'ru'
            ? `${pattern.name}: ширина готового блока Flying Geese должна в точности вдвое превышать высоту; использованы полноразмерные шаблонные заготовки.`
            : `${pattern.name}: a finished Flying Geese unit must be exactly twice as wide as it is tall; full-size template blanks were used.`,
      })
    }
    if (squareRecipeOnStretchedBlock && !reported.has(`stretched-recipe:${pattern.id}`)) {
      reported.add(`stretched-recipe:${pattern.id}`)
      diagnostics.push({
        code: 'unsupported-geometry',
        severity: 'warning',
        patternId: pattern.id,
        message: language === 'ru'
          ? `${pattern.name}: рецепт HST/QST/Flying Geese применим только к нерастянутому квадратному блоку; использованы консервативные полноразмерные шаблонные заготовки.`
          : `${pattern.name}: the HST/QST/Flying Geese recipe requires an unstretched square block; conservative full-size template blanks were used.`,
      })
    }
    if (recipe && !squareRecipeOnStretchedBlock) {
      constructionMethodDrafts.set(pattern.id, {
        patternId: pattern.id,
        patternName: pattern.name,
        method: recipe.method,
        sourceUrl: recipe.sourceUrl,
      })
      recipe.blanks.forEach((blank) => registerRecipeBlank(pattern, blank, recipe.sourceUrl))
      return
    }

    if (!recipe && builtIn && !custom && !reported.has(`recipe:${pattern.id}`)) {
      reported.add(`recipe:${pattern.id}`)
      diagnostics.push({
        code: 'unsupported-geometry',
        severity: 'warning',
        patternId: pattern.id,
        message: language === 'ru'
          ? `${pattern.name}: рецепт раскроя не найден; использован консервативный план полноразмерных шаблонных заготовок.`
          : `${pattern.name}: no source-backed cutting recipe was found; a conservative plan of full-size template blanks was used.`,
      })
    }
    if (squareRecipeOnStretchedBlock) {
      new Set([pattern.background, ...pattern.shapes.map(({ color }) => color)])
        .forEach((paletteIndex) => registerConservativeBlank(pattern, paletteIndex, width, height))
      return
    }
    if (fractions.unsupported) {
      registerConservativeBlank(pattern, pattern.background, width, height)
      pattern.shapes.forEach(({ color }) => {
        registerConservativeBlank(pattern, color, width, height)
      })
      return
    }
    fractions.pieces.forEach(({ color }) => {
      registerConservativeBlank(pattern, color, width, height)
    })
  })

  pieceInstructionDrafts.forEach((instruction) => {
    if (instruction.batchBlankCount !== undefined && instruction.batchResultCount !== undefined) {
      const batches = Math.ceil(instruction.requiredPieces / instruction.batchResultCount)
      instruction.rectanglesToCut = batches * instruction.batchBlankCount
      instruction.pieces = batches * instruction.batchResultCount
    }
  })
  const pieceInstructions = [...pieceInstructionDrafts.values()]
    .sort((left, right) =>
      left.paletteIndex - right.paletteIndex
      || left.patternName.localeCompare(right.patternName, 'ru')
      || left.role.localeCompare(right.role)
      || left.cutWidthCm - right.cutWidthCm
      || left.cutHeightCm - right.cutHeightCm)
  pieceInstructions.forEach((piece) => {
    const paletteIndex = piece.paletteIndex
    const blankAreaCm2 = piece.rectanglesToCut * piece.cutWidthCm * piece.cutHeightCm
    cuttingAreas[paletteIndex] += blankAreaCm2
    pieceCounts[paletteIndex] += piece.pieces
    for (let blank = 0; blank < piece.rectanglesToCut; blank += 1) {
      packingPieces[paletteIndex].push({ width: piece.cutWidthCm, height: piece.cutHeightCm })
    }
  })

  const cutting = document.palette.flatMap((color, paletteIndex): CuttingSummary[] => {
    if (cuttingAreas[paletteIndex] <= 1e-10) return []
    const packing = packAcrossWidth(packingPieces[paletteIndex], fabricWidthCm)
    packing.oversized.forEach((piece) => {
      const reportKey = `oversize:${paletteIndex}:${rounded(piece.width)}:${rounded(piece.height)}`
      if (reported.has(reportKey)) return
      reported.add(reportKey)
      diagnostics.push({
        code: 'oversize-blank',
        severity: 'warning',
        message: language === 'ru'
          ? `Заготовка ${rounded(piece.width)} × ${rounded(piece.height)} см для цвета «${color}» не помещается по ширине ткани ни в одной ориентации; в требуемую длину заложена её длинная сторона.`
          : `The ${rounded(piece.width)} × ${rounded(piece.height)} cm blank for color “${color}” cannot fit across the fabric in either orientation; its long dimension was charged as required length.`,
      })
    })
    const packedLengthCm = packing.lengthCm
    const purchaseMeters = metersRoundedUp(packedLengthCm * 1.1)
    const purchasedAreaCm2 = purchaseMeters * 100 * fabricWidthCm
    return [{
      paletteIndex,
      color,
      pieces: pieceCounts[paletteIndex],
      cuttingAreaCm2: rounded(cuttingAreas[paletteIndex]),
      packedLengthCm: rounded(packedLengthCm),
      fabricMeters: purchaseMeters,
      purchaseMeters,
      wasteAreaCm2: rounded(Math.max(0, purchasedAreaCm2 - cuttingAreas[paletteIndex])),
    }]
  })
  const topByColor = cutting.map((summary): DetailedColorFabricEstimate => ({
    paletteIndex: summary.paletteIndex,
    color: summary.color,
    visibleAreaCm2: rounded(visibleAreas[summary.paletteIndex]),
    cuttingAreaCm2: summary.cuttingAreaCm2,
    packedLengthCm: summary.packedLengthCm,
    fabricMeters: summary.fabricMeters,
  }))

  const cutWidthCm = quiltWidthCm + 2 * backingExtraCm
  const cutHeightCm = quiltHeightCm + 2 * backingExtraCm
  const panels = Math.max(1, Math.ceil(cutWidthCm / fabricWidthCm))
  const backingLengthCm = panels * cutHeightCm
  const perimeterCm = 2 * (quiltWidthCm + quiltHeightCm)
  const requiredLengthCm = perimeterCm + 25
  const strips = Math.max(1, Math.ceil(requiredLengthCm / fabricWidthCm))

  return {
    seamAllowanceCm: DETAILED_SEAM_ALLOWANCE_CM,
    fabricWidthCm,
    purchaseReservePercent: 10,
    topByColor,
    backing: {
      quiltWidthCm: rounded(quiltWidthCm),
      quiltHeightCm: rounded(quiltHeightCm),
      cutWidthCm: rounded(cutWidthCm),
      cutHeightCm: rounded(cutHeightCm),
      panels,
      panelWidthCm: rounded(cutWidthCm / panels),
      totalLengthCm: rounded(backingLengthCm),
      fabricMeters: metersRoundedUp(backingLengthCm),
    },
    binding: {
      perimeterCm: rounded(perimeterCm),
      requiredLengthCm: rounded(requiredLengthCm),
      stripWidthCm: bindingWidthCm,
      strips,
      fabricMeters: metersRoundedUp(strips * bindingWidthCm),
    },
    blockBreakdown: [...breakdown.values()].map(({ pattern, count, areas }) => {
      const total = areas.reduce((sum, area) => sum + (area ?? 0), 0)
      return {
        patternId: pattern.id,
        patternName: pattern.name,
        count,
        colors: areas.flatMap((area, paletteIndex): BlockColorBreakdown[] => area > 1e-10 ? [{
          paletteIndex,
          visibleAreaCm2: rounded(area),
          areaRatio: total === 0 ? 0 : rounded(area / total, 6),
        }] : []),
      }
    }),
    cutting,
    pieceInstructions,
    constructionMethods: [...constructionMethodDrafts.values()],
    diagnostics,
  }
}
