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

  it('preserves valid custom block editor groups and removes invalid shape references', () => {
    const migrated = migrateDocument({
      ...createDocument(1, 1),
      customPatterns: [{
        id: 'custom-units',
        name: 'Units',
        background: 0,
        source: 'custom',
        shapes: [
          { color: 1, points: [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]] },
          { color: 2, points: [[0.5, 0], [1, 0], [1, 0.5], [0.5, 0.5]] },
        ],
        editor: {
          version: 1,
          gridDivisions: 12,
          groups: [
            { id: 'pair', shapeIndices: [0, 1, 1, 99] },
            { id: 'invalid', shapeIndices: [-1, 99] },
          ],
        },
      }],
    })

    expect(migrated.customPatterns?.[0].editor).toEqual({
      version: 1,
      gridDivisions: 12,
      groups: [{ id: 'pair', shapeIndices: [0, 1] }],
    })
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
      method: 'direct',
      role: 'rectangle',
      sourceUrl: expect.stringMatching(/^https:\/\//),
    })])
    expect(estimate.pieceInstructions[0]).not.toHaveProperty('instruction')
    expect(estimate.constructionMethods).toEqual([{
      patternId: 'solid',
      patternName: 'Однотонный',
      method: 'direct',
      sourceUrl: expect.stringMatching(/^https:\/\//),
    }])
    expect(estimate.diagnostics).toEqual([])
  })

  it('accounts for every source-backed strip blank in a nine-patch cutting plan', () => {
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
    expect(ninePatch.pieceInstructions.reduce((sum, instruction) => sum + instruction.rectanglesToCut, 0)).toBe(6)
    expect(ninePatch.pieceInstructions.every(({ method, role }) =>
      method === 'strip-piecing' && role === 'strip')).toBe(true)
    expect(ninePatch.constructionMethods).toEqual([expect.objectContaining({
      patternId: 'nine-patch',
      method: 'strip-piecing',
    })])

    ninePatch.cutting.forEach((color) => {
      const instructedBlankArea = ninePatch.pieceInstructions
        .filter((instruction) => instruction.paletteIndex === color.paletteIndex)
        .reduce((sum, instruction) =>
          sum + instruction.rectanglesToCut * instruction.cutWidthCm * instruction.cutHeightCm, 0)
      expect(color.cuttingAreaCm2).toBeCloseTo(instructedBlankArea, 3)
    })
  })

  it('batches source-backed two-at-a-time HST square blanks across identical cells', () => {
    const document = {
      ...createDocument(1, 2),
      cells: [
        { patternId: 'hst', rotation: 0 as const },
        { patternId: 'hst', rotation: 90 as const },
      ],
    }
    const estimate = calculateDetailedFabric(document)
    const hstSquares = estimate.pieceInstructions.filter(({ role }) => role === 'hst-square')

    expect(hstSquares).toHaveLength(2)
    expect(hstSquares.every(({
      shape,
      method,
      pieces,
      rectanglesToCut,
      cutWidthCm,
      cutHeightCm,
      partnerPaletteIndex,
      sourceUrl,
    }) =>
      shape === 'square'
      && method === 'hst-two-at-a-time'
      && pieces === 2
      && rectanglesToCut === 1
      && cutWidthCm === 27.223
      && cutHeightCm === 27.223
      && partnerPaletteIndex !== undefined
      && sourceUrl?.startsWith('https://'))).toBe(true)
    estimate.cutting.forEach((color) => {
      expect(color.cuttingAreaCm2).toBeCloseTo(27.223 * 27.223, 3)
      expect(color.packedLengthCm).toBe(27.223)
    })
  })

  it('reports one required HST while exposing both units produced by its batch', () => {
    const estimate = calculateDetailedFabric({
      ...createDocument(1, 1),
      cells: [{ patternId: 'hst', rotation: 0 as const }],
    })
    const hstSquares = estimate.pieceInstructions.filter(({ role }) => role === 'hst-square')

    expect(hstSquares).toHaveLength(2)
    expect(hstSquares.every(({
      requiredPieces,
      pieces,
      rectanglesToCut,
      batchBlankCount,
      batchResultCount,
    }) =>
      requiredPieces === 1
      && pieces === 2
      && rectanglesToCut === 1
      && batchBlankCount === 1
      && batchResultCount === 2)).toBe(true)
  })

  it('aggregates four Hourglass units into one source-correct three-color batch', () => {
    const estimate = calculateDetailedFabric({
      ...createDocument(1, 4),
      cells: Array.from({ length: 4 }, () => ({
        patternId: 'hourglass',
        rotation: 0 as const,
      })),
    })
    const qstSquares = estimate.pieceInstructions.filter(({ role }) => role === 'qst-square')

    expect(qstSquares).toHaveLength(3)
    expect(qstSquares.map(({
      paletteIndex,
      requiredPieces,
      pieces,
      rectanglesToCut,
      batchBlankCount,
      batchResultCount,
    }) => ({
      paletteIndex,
      requiredPieces,
      pieces,
      rectanglesToCut,
      batchBlankCount,
      batchResultCount,
    }))).toEqual([
      {
        paletteIndex: 0,
        requiredPieces: 4,
        pieces: 4,
        rectanglesToCut: 1,
        batchBlankCount: 1,
        batchResultCount: 4,
      },
      {
        paletteIndex: 1,
        requiredPieces: 4,
        pieces: 4,
        rectanglesToCut: 2,
        batchBlankCount: 2,
        batchResultCount: 4,
      },
      {
        paletteIndex: 2,
        requiredPieces: 4,
        pieces: 4,
        rectanglesToCut: 1,
        batchBlankCount: 1,
        batchResultCount: 4,
      },
    ])
  })

  it('uses Card Trick parent-square batch records for both diagonal cuts', () => {
    const estimate = calculateDetailedFabric({
      ...createDocument(1, 1),
      cells: [{ patternId: 'card-trick', rotation: 0 as const }],
    })
    const standaloneParents = estimate.pieceInstructions.filter(({
      role,
      partnerPaletteIndex,
    }) => (role === 'hst-square' || role === 'qst-square')
      && partnerPaletteIndex === undefined)

    expect(standaloneParents.filter(({ batchResultCount }) => batchResultCount === 2))
      .toHaveLength(2)
    expect(standaloneParents.filter(({ batchResultCount }) => batchResultCount === 4))
      .toHaveLength(3)
    expect(standaloneParents.every(({
      requiredPieces,
      pieces,
      rectanglesToCut,
      batchBlankCount,
      batchResultCount,
    }) =>
      requiredPieces === batchResultCount
      && pieces === batchResultCount
      && rectanglesToCut === 1
      && batchBlankCount === 1)).toBe(true)
  })

  it('exposes the two extra Jacob’s Ladder strip-pieced units', () => {
    const estimate = calculateDetailedFabric({
      ...createDocument(1, 1),
      cells: [{ patternId: 'jacobs-ladder', rotation: 0 as const }],
    })
    const strips = estimate.pieceInstructions.filter(({ role }) => role === 'strip')

    expect(strips).toHaveLength(2)
    expect(strips.every(({
      requiredPieces,
      pieces,
      rectanglesToCut,
      batchBlankCount,
      batchResultCount,
    }) =>
      requiredPieces === 10
      && pieces === 12
      && rectanglesToCut === 2
      && batchBlankCount === 2
      && batchResultCount === 12)).toBe(true)
  })

  it('warns and uses full-block templates instead of a square-unit recipe for a stretched HST', () => {
    const document = {
      ...createDocument(1, 1),
      rowSizesCm: [50],
      columnSizesCm: [25],
      cells: [{ patternId: 'hst', rotation: 0 as const }],
    }

    const russian = calculateDetailedFabric(document)
    const english = calculateDetailedFabric(document, 'en')

    expect(russian.constructionMethods).toEqual([])
    expect(russian.pieceInstructions).toHaveLength(2)
    expect(russian.pieceInstructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        paletteIndex: 0,
        shape: 'template',
        method: 'template',
        rectanglesToCut: 1,
        pieces: 1,
        cutWidthCm: 26.27,
        cutHeightCm: 51.27,
      }),
      expect.objectContaining({
        paletteIndex: 1,
        shape: 'template',
        method: 'template',
        rectanglesToCut: 1,
        pieces: 1,
        cutWidthCm: 26.27,
        cutHeightCm: 51.27,
      }),
    ]))
    expect(russian.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupported-geometry',
        severity: 'warning',
        patternId: 'hst',
        message: expect.stringContaining('квадрат'),
      }),
    ])
    expect(english.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupported-geometry',
        severity: 'warning',
        patternId: 'hst',
        message: expect.stringContaining('square'),
      }),
    ])
  })

  it('rotates an indivisible blank across the width of fabric instead of splitting it', () => {
    const estimate = calculateDetailedFabric({
      ...createDocument(1, 1),
      rowSizesCm: [10],
      columnSizesCm: [201.27],
      fabricWidthCm: 110,
      cells: [{ patternId: 'solid', rotation: 0 as const }],
    })

    expect(estimate.pieceInstructions).toEqual([
      expect.objectContaining({ cutWidthCm: 202.54, cutHeightCm: 11.27, rectanglesToCut: 1 }),
    ])
    expect(estimate.cutting[0]).toMatchObject({
      packedLengthCm: 202.54,
      purchaseMeters: 2.3,
    })
    expect(estimate.diagnostics).toEqual([])
  })

  it('warns and charges the long dimension when a blank cannot fit either orientation', () => {
    const estimate = calculateDetailedFabric({
      ...createDocument(1, 1),
      rowSizesCm: [150],
      columnSizesCm: [120],
      fabricWidthCm: 110,
      cells: [{ patternId: 'solid', rotation: 0 as const }],
    }, 'en')

    expect(estimate.cutting[0].packedLengthCm).toBe(151.27)
    expect(estimate.diagnostics).toEqual([
      expect.objectContaining({
        code: 'oversize-blank',
        severity: 'warning',
        message: expect.stringContaining('cannot fit'),
      }),
    ])
  })

  it('cuts one canonical Flying Geese unit as one body rectangle and two corner squares', () => {
    const estimate = calculateDetailedFabric({
      ...createDocument(1, 1),
      rowSizesCm: [10],
      columnSizesCm: [20],
      cells: [{ patternId: 'flying-geese', rotation: 0 as const }],
    })

    expect(estimate.pieceInstructions).toEqual([
      expect.objectContaining({
        paletteIndex: 0,
        role: 'goose-corner',
        shape: 'square',
        method: 'flying-geese-sew-and-flip',
        pieces: 2,
        rectanglesToCut: 2,
        cutWidthCm: 11.27,
        cutHeightCm: 11.27,
      }),
      expect.objectContaining({
        paletteIndex: 1,
        role: 'goose-body',
        shape: 'rectangle',
        method: 'flying-geese-sew-and-flip',
        pieces: 1,
        rectanglesToCut: 1,
        cutWidthCm: 21.27,
        cutHeightCm: 11.27,
      }),
    ])
    expect(estimate.constructionMethods).toEqual([expect.objectContaining({
      patternId: 'flying-geese',
      method: 'flying-geese-sew-and-flip',
    })])
    expect(estimate.diagnostics).toEqual([])
  })

  it('batches no-waste Flying Geese across the whole quilt in groups of four', () => {
    for (const quantity of [5, 6, 7, 8]) {
      const estimate = calculateDetailedFabric({
        ...createDocument(1, quantity),
        rowSizesCm: [10],
        columnSizesCm: Array.from({ length: quantity }, () => 20),
        cells: Array.from({ length: quantity }, () => ({
          patternId: 'flying-geese',
          rotation: 0 as const,
        })),
      }, 'en', { flyingGeeseMethod: 'no-waste' })
      const body = estimate.pieceInstructions.find(({ role }) => role === 'goose-body')!
      const corners = estimate.pieceInstructions.find(({ role }) => role === 'goose-corner')!

      expect(body).toMatchObject({
        shape: 'square',
        method: 'flying-geese-no-waste',
        requiredPieces: quantity,
        pieces: 8,
        rectanglesToCut: 2,
        batchBlankCount: 1,
        batchResultCount: 4,
        cutWidthCm: 23.175,
        cutHeightCm: 23.175,
      })
      expect(corners).toMatchObject({
        shape: 'square',
        method: 'flying-geese-no-waste',
        requiredPieces: quantity * 2,
        pieces: 16,
        rectanglesToCut: 8,
        batchBlankCount: 4,
        batchResultCount: 8,
        cutWidthCm: 12.223,
        cutHeightCm: 12.223,
      })
      expect(estimate.constructionMethods).toEqual([expect.objectContaining({
        patternId: 'flying-geese',
        method: 'flying-geese-no-waste',
      })])
    }
  })

  it('changes cutting area and purchase deterministically with the Flying Geese method', () => {
    const document = {
      ...createDocument(1, 4),
      rowSizesCm: [10],
      columnSizesCm: [20, 20, 20, 20],
      cells: Array.from({ length: 4 }, () => ({
        patternId: 'flying-geese',
        rotation: 0 as const,
      })),
    }
    const sewAndFlip = calculateDetailedFabric(document)
    const noWaste = calculateDetailedFabric(document, 'ru', { flyingGeeseMethod: 'no-waste' })

    expect(sewAndFlip.cutting.map(({ cuttingAreaCm2, purchaseMeters }) =>
      [cuttingAreaCm2, purchaseMeters])).not.toEqual(
      noWaste.cutting.map(({ cuttingAreaCm2, purchaseMeters }) =>
        [cuttingAreaCm2, purchaseMeters]),
    )
    expect(noWaste.cutting).toMatchObject([
      { paletteIndex: 0, cuttingAreaCm2: 597.607, purchaseMeters: 0.2 },
      { paletteIndex: 1, cuttingAreaCm2: 537.081, purchaseMeters: 0.3 },
    ])
  })

  it('warns, uses templates, and reports template construction for a non-2:1 goose', () => {
    const estimate = calculateDetailedFabric({
      ...createDocument(1, 1),
      rowSizesCm: [10],
      columnSizesCm: [30],
      cells: [{ patternId: 'flying-geese', rotation: 0 as const }],
    }, 'en')

    expect(estimate.pieceInstructions).toHaveLength(2)
    expect(estimate.pieceInstructions.every(({ method, shape }) =>
      method === 'template' && shape === 'template')).toBe(true)
    expect(estimate.constructionMethods).toEqual([expect.objectContaining({
      patternId: 'flying-geese',
      method: 'template',
    })])
    expect(estimate.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupported-geometry',
        message: expect.stringContaining('exactly twice as wide'),
      }),
    ])
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
      patternId === 'imported-overlap' || patternId === 'unsupported').every(({ shape, rectanglesToCut, pieces }) =>
      shape === 'template' && rectanglesToCut === pieces)).toBe(true)
  })

  it('localizes diagnostics without changing any calculated geometry or quantities', () => {
    const document = {
      ...createDocument(1, 1),
      gridType: 'triangle' as const,
      cells: [{ patternId: 'missing-pattern', rotation: 0 as const }],
    }

    const russian = calculateDetailedFabric(document)
    const english = calculateDetailedFabric(document, 'en')

    expect(russian.diagnostics.map(({ message }) => message)).toEqual([
      expect.stringContaining('рассчитана'),
      expect.stringContaining('не найден'),
    ])
    expect(english.diagnostics.map(({ message }) => message)).toEqual([
      expect.stringContaining('was calculated'),
      expect.stringContaining('was not found'),
    ])
    expect({
      ...english,
      diagnostics: undefined,
    }).toEqual({
      ...russian,
      diagnostics: undefined,
    })
  })
})
