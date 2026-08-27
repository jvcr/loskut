import { describe, expect, it } from 'vitest'
import {
  calculateDetailedFabric,
  calculateQuilt,
  cloneCustomPattern,
  createDocument,
  CURRENT_DOCUMENT_VERSION,
  DETAILED_SEAM_ALLOWANCE_CM,
  insertColumn,
  insertRow,
  mergeCells,
  migrateDocument,
  mirrorCells,
  patternById,
  randomizeCellRotations,
  removeColumn,
  removeRow,
  resetCellRotations,
  resizeColumn,
  resizeDocument,
  resizeRow,
  rotateCell,
  selectPreset,
  unmergeCells,
  updateCells,
  type BlockPattern,
} from './editorModel'

describe('quilt document', () => {
  it('calculates finished size and fabric estimate with seams and reserve', () => {
    const document = createDocument(5, 6)

    expect(calculateQuilt(document)).toEqual({
      finishedWidthCm: 150,
      finishedHeightCm: 125,
      fabricMeters: 2.1,
      blocks: 30,
    })
  })

  it('preserves cells by row and column while resizing', () => {
    const original = createDocument(3, 4)
    const resized = resizeDocument(original, 2, 2)

    expect(resized.cells).toEqual([
      original.cells[0],
      original.cells[1],
      original.cells[4],
      original.cells[5],
    ])
  })

  it('updates only selected cells and rotates in quarter turns', () => {
    const original = createDocument(2, 2)
    const updated = updateCells(original, [1, 3], (cell) => ({
      ...rotateCell(cell),
      patternId: 'checker',
    }))

    expect(updated.cells[0]).toBe(original.cells[0])
    expect(updated.cells[2]).toBe(original.cells[2])
    expect(updated.cells[1].patternId).toBe('checker')
    expect(updated.cells[1].rotation).toBe((original.cells[1].rotation + 90) % 360)
    expect(updated.cells[3].patternId).toBe('checker')
  })

  it('migrates legacy and malformed persisted values to complete current defaults', () => {
    const migrated = migrateDocument({
      version: 1,
      name: 'Legacy',
      rows: 2,
      columns: 2,
      blockSizeCm: 30,
      palette: ['#fff', '#000'],
      fabricFills: ['data:image/png;base64,abc', 42],
      fabricPlacements: [{ zoom: 9, positionX: -1, positionY: 70 }],
      cells: [
        { patternId: 'hst', rotation: -90, mirrorX: true },
        { patternId: 'future-pattern', rotation: 181 },
      ],
    })

    expect(migrated).toMatchObject({
      version: CURRENT_DOCUMENT_VERSION,
      name: 'Legacy',
      notes: '',
      rows: 2,
      columns: 2,
      blockSizeCm: 30,
      seamAllowanceCm: 0.7,
      gridType: 'rectangle',
      rowSizesCm: [30, 30],
      columnSizesCm: [30, 30],
      paletteLocks: [false, false],
      fabricFills: ['data:image/png;base64,abc', null],
      fabricPlacements: [
        { zoom: 4, positionX: 50, positionY: 70 },
        { zoom: 1, positionX: 50, positionY: 50 },
      ],
      showGrid: true,
      customPatterns: [],
      fabricWidthCm: 110,
      backingExtraCm: 10,
      bindingWidthCm: 6.35,
    })
    expect(migrated.cells).toEqual([
      { patternId: 'hst', rotation: 270, mirrorX: true },
      { patternId: 'future-pattern', rotation: 180 },
      { patternId: 'solid', rotation: 0 },
      { patternId: 'solid', rotation: 0 },
    ])
  })

  it('inserts, removes and independently resizes rows and columns without moving survivors', () => {
    const original = {
      ...createDocument(2, 2),
      cells: [
        { patternId: 'a', rotation: 0 as const },
        { patternId: 'b', rotation: 90 as const },
        { patternId: 'c', rotation: 180 as const },
        { patternId: 'd', rotation: 270 as const },
      ],
    }
    const withRow = insertRow(original, 1)
    expect(withRow.cells.map((cell) => cell.patternId)).toEqual(['a', 'b', 'solid', 'solid', 'c', 'd'])
    expect(removeRow(withRow, 1).cells).toEqual(original.cells)

    const withColumn = insertColumn(original, 1)
    expect(withColumn.cells.map((cell) => cell.patternId)).toEqual(['a', 'solid', 'b', 'c', 'solid', 'd'])
    expect(removeColumn(withColumn, 1).cells).toEqual(original.cells)

    const resized = resizeColumn(resizeRow(withColumn, 1, 42), 0, 17)
    expect(resized.rowSizesCm).toEqual([25, 42])
    expect(resized.columnSizesCm).toEqual([17, 25, 25])
    expect(original.rowSizesCm).toEqual([25, 25])
    expect(original.columnSizesCm).toEqual([25, 25])
  })

  it('provides deterministic geometric selection presets', () => {
    const document = createDocument(3, 4)
    expect(selectPreset(document, 'all')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(selectPreset(document, 'odd')).toEqual([0, 2, 5, 7, 8, 10])
    expect(selectPreset(document, 'even')).toEqual([1, 3, 4, 6, 9, 11])
    expect(selectPreset(document, 'border')).toEqual([0, 1, 2, 3, 4, 7, 8, 9, 10, 11])
    expect(selectPreset(document, 'diagonal')).toEqual([0, 5, 10])
    expect(selectPreset(document, 'clear')).toEqual([])
  })

  it('merges only rectangular selections and can unmerge from either owner or child', () => {
    const document = createDocument(3, 3)
    expect(mergeCells(document, [0, 1, 3])).toBe(document)

    const merged = mergeCells(document, [1, 2, 4, 5])
    expect(merged.cells[1].mergedInto).toBeUndefined()
    expect(merged.cells[2].mergedInto).toBe(1)
    expect(merged.cells[4].mergedInto).toBe(1)
    expect(merged.cells[5].mergedInto).toBe(1)
    expect(document.cells.every((cell) => cell.mergedInto === undefined)).toBe(true)

    const unmerged = unmergeCells(merged, [5])
    expect(unmerged.cells.every((cell) => cell.mergedInto === undefined)).toBe(true)
  })

  it('mirrors and randomizes only selected cells with an injectable random source', () => {
    const document = createDocument(1, 3)
    const mirrored = mirrorCells(mirrorCells(document, [0, 2], 'x'), [2], 'y')
    expect(mirrored.cells.map(({ mirrorX, mirrorY }) => [mirrorX, mirrorY])).toEqual([
      [true, undefined],
      [undefined, undefined],
      [true, true],
    ])

    const values = [0, 0.26, 0.51]
    let cursor = 0
    const randomized = randomizeCellRotations(document, [0, 1, 2], () => values[cursor++])
    expect(randomized.cells.map((cell) => cell.rotation)).toEqual([0, 90, 180])
    expect(resetCellRotations(randomized, [1, 2]).cells.map((cell) => cell.rotation)).toEqual([0, 0, 0])
  })

  it('clones built-in or custom patterns with a fresh deterministic id and deep geometry', () => {
    const first = cloneCustomPattern(createDocument(1, 1), 'hst')
    const second = cloneCustomPattern(first, 'hst')

    expect(first.customPatterns?.[0]).toMatchObject({ id: 'hst-copy', name: 'Треугольник — копия', source: 'custom' })
    expect(second.customPatterns?.[1].id).toBe('hst-copy-2')
    expect(patternById('hst-copy', second.customPatterns)).toBe(second.customPatterns?.[0])
    expect(first.customPatterns?.[0].shapes).not.toBe(patternById('hst').shapes)
  })
})

describe('detailed fabric calculation', () => {
  it('uses exact visible polygon area, a fixed seam, width packing, backing panels and binding strips', () => {
    const document = {
      ...createDocument(1, 1),
      blockSizeCm: 25,
      rowSizesCm: [20],
      columnSizesCm: [30],
      cells: [{ patternId: 'solid', rotation: 0 as const }],
      fabricWidthCm: 110,
      backingExtraCm: 10,
      bindingWidthCm: 6.35,
    }
    const estimate = calculateDetailedFabric(document)

    expect(estimate.seamAllowanceCm).toBe(DETAILED_SEAM_ALLOWANCE_CM)
    expect(estimate.purchaseReservePercent).toBe(10)
    expect(estimate.topByColor).toHaveLength(1)
    expect(estimate.topByColor[0]).toMatchObject({
      paletteIndex: 0,
      color: document.palette[0],
      visibleAreaCm2: 600,
      fabricMeters: 0.3,
    })
    expect(estimate.topByColor[0].cuttingAreaCm2).toBeCloseTo((30 + 1.27) * (20 + 1.27), 3)
    expect(estimate.topByColor[0].packedLengthCm).toBeCloseTo(21.27, 5)
    expect(estimate.backing).toEqual({
      quiltWidthCm: 30,
      quiltHeightCm: 20,
      cutWidthCm: 50,
      cutHeightCm: 40,
      panels: 1,
      panelWidthCm: 50,
      totalLengthCm: 40,
      fabricMeters: 0.4,
    })
    expect(estimate.binding).toEqual({
      perimeterCm: 100,
      requiredLengthCm: 125,
      stripWidthCm: 6.35,
      strips: 2,
      fabricMeters: 0.2,
    })
    expect(estimate.blockBreakdown).toEqual([{
      patternId: 'solid',
      patternName: 'Однотонный',
      count: 1,
      colors: [{ paletteIndex: 0, visibleAreaCm2: 600, areaRatio: 1 }],
    }])
    expect(estimate.cutting[0]).toMatchObject({ paletteIndex: 0, pieces: 1 })
    expect(estimate.cutting[0].purchaseMeters).toBe(0.3)
    expect(estimate.cutting[0].wasteAreaCm2).toBeGreaterThan(0)
    expect(estimate.pieceInstructions).toEqual([expect.objectContaining({
      paletteIndex: 0,
      patternId: 'solid',
      shape: 'rectangle',
      cutWidthCm: 31.27,
      cutHeightCm: 21.27,
      pieces: 1,
      rectanglesToCut: 1,
    })])
    expect(estimate.pieceInstructions[0].instruction).toContain('31,27 × 21,27 см')
    expect(estimate.diagnostics).toEqual([])
  })

  it('accounts for every physical piece and internal seam in a nine-patch cutting plan', () => {
    const base = {
      ...createDocument(1, 1),
      blockSizeCm: 30,
      rowSizesCm: [30],
      columnSizesCm: [30],
    }
    const solid = calculateDetailedFabric({
      ...base,
      cells: [{ patternId: 'solid', rotation: 0 as const }],
    })
    const ninePatch = calculateDetailedFabric({
      ...base,
      cells: [{ patternId: 'nine-patch', rotation: 0 as const }],
    })

    expect(solid.cutting.reduce((sum, color) => sum + color.pieces, 0)).toBe(1)
    expect(ninePatch.cutting.reduce((sum, color) => sum + color.pieces, 0)).toBe(9)
    expect(ninePatch.pieceInstructions.reduce((sum, instruction) => sum + instruction.pieces, 0)).toBe(9)
    expect(ninePatch.cutting.reduce((sum, color) => sum + color.cuttingAreaCm2, 0))
      .toBeGreaterThan(solid.cutting.reduce((sum, color) => sum + color.cuttingAreaCm2, 0))
    expect(ninePatch.cutting).toMatchObject([
      { paletteIndex: 0, pieces: 4, cuttingAreaCm2: 508.052, packedLengthCm: 11.27, purchaseMeters: 0.2 },
      { paletteIndex: 1, pieces: 5, cuttingAreaCm2: 635.064, packedLengthCm: 11.27, purchaseMeters: 0.2 },
    ])

    ninePatch.cutting.forEach((color) => {
      const instructedBlankArea = ninePatch.pieceInstructions
        .filter((instruction) => instruction.paletteIndex === color.paletteIndex)
        .reduce((sum, instruction) =>
          sum + instruction.rectanglesToCut * instruction.cutWidthCm * instruction.cutHeightCm, 0)
      expect(color.cuttingAreaCm2).toBeCloseTo(instructedBlankArea, 3)
    })
  })

  it('turns half-square triangles into diagonal cutting instructions with seam allowances', () => {
    const document = {
      ...createDocument(1, 2),
      cells: [
        { patternId: 'hst', rotation: 0 as const },
        { patternId: 'hst', rotation: 90 as const },
      ],
    }
    const estimate = calculateDetailedFabric(document)
    const triangles = estimate.pieceInstructions.filter(({ shape }) => shape === 'triangle')

    expect(triangles).toHaveLength(2)
    expect(triangles.every(({ pieces, rectanglesToCut, cutWidthCm, cutHeightCm, instruction }) =>
      pieces === 2
      && rectanglesToCut === 1
      && cutWidthCm === 26.27
      && cutHeightCm === 26.27
      && instruction.includes('разрезать каждый по диагонали'))).toBe(true)
    estimate.cutting.forEach((color) => {
      expect(color.cuttingAreaCm2).toBeCloseTo(26.27 * 26.27, 3)
      expect(color.packedLengthCm).toBe(26.27)
    })
  })

  it('counts merged rectangles as one enlarged block', () => {
    const document = mergeCells({
      ...createDocument(2, 2),
      cells: Array.from({ length: 4 }, () => ({ patternId: 'solid', rotation: 0 as const })),
    }, [0, 1, 2, 3])
    const estimate = calculateDetailedFabric(document)

    expect(estimate.blockBreakdown).toMatchObject([{ patternId: 'solid', count: 1 }])
    expect(estimate.topByColor[0].visibleAreaCm2).toBe(2500)
  })

  it('reports custom, imported, overlapping and unsupported geometry instead of inventing precision', () => {
    const patterns: readonly BlockPattern[] = [
      {
        id: 'imported-overlap',
        name: 'Imported overlap',
        background: 0,
        source: 'imported',
        shapes: [
          { color: 1, points: [[0, 0], [1, 0], [1, 1]] },
          { color: 2, points: [[0, 0], [1, 0], [0, 1]] },
        ],
      },
      {
        id: 'unsupported',
        name: 'Concave',
        background: 0,
        source: 'custom',
        shapes: [{ color: 1, points: [[0, 0], [1, 0], [0.5, 0.5], [1, 1], [0, 1]] }],
      },
    ]
    const document = {
      ...createDocument(1, 2),
      customPatterns: patterns,
      cells: [
        { patternId: 'imported-overlap', rotation: 0 as const },
        { patternId: 'unsupported', rotation: 0 as const },
      ],
    }
    const estimate = calculateDetailedFabric(document)

    expect(estimate.diagnostics.map(({ code }) => code)).toEqual([
      'imported-pattern',
      'overlapping-shapes',
      'custom-pattern',
      'unsupported-geometry',
    ])
    expect(estimate.blockBreakdown).toHaveLength(1)
    expect(estimate.blockBreakdown[0].patternId).toBe('imported-overlap')
    expect(estimate.diagnostics.every(({ message, severity }) => message.length > 0 && severity === 'warning')).toBe(true)
    expect(estimate.pieceInstructions.filter(({ patternId }) =>
      patternId === 'imported-overlap' || patternId === 'unsupported').every(({ shape, instruction, patternName }) =>
      shape === 'template' && instruction.includes('заготовок') && instruction.includes(patternName))).toBe(true)
  })
})
