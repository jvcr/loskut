import { describe, expect, it } from 'vitest'
import { PATTERNS } from './editorModel'
import { CUTTING_RECIPES, resolveCuttingRecipe } from './cuttingRecipes'

describe('cutting recipe registry', () => {
  it('covers every built-in pattern exactly once and no unknown patterns', () => {
    const patternIds = PATTERNS.map(({ id }) => id).sort()
    const recipeIds = CUTTING_RECIPES.map(({ patternId }) => patternId).sort()

    expect(new Set(recipeIds).size).toBe(recipeIds.length)
    expect(recipeIds).toEqual(patternIds)
  })

  it('resolves every recipe to positive finite source-backed blanks', () => {
    for (const pattern of PATTERNS) {
      const recipe = resolveCuttingRecipe(pattern.id, {
        widthCm: 30,
        heightCm: 24,
        seamCm: 0.635,
      })

      expect(recipe, pattern.id).not.toBeNull()
      expect(() => new URL(recipe!.sourceUrl)).not.toThrow()
      expect(recipe!.sourceUrl, pattern.id).toMatch(/^https:\/\//)
      expect(recipe!.blanks.length, pattern.id).toBeGreaterThan(0)
      for (const blank of recipe!.blanks) {
        expect(Number.isFinite(blank.paletteIndex), `${pattern.id}: paletteIndex`).toBe(true)
        expect(blank.paletteIndex, `${pattern.id}: paletteIndex`).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(blank.blanks), `${pattern.id}: blanks`).toBe(true)
        expect(blank.blanks, `${pattern.id}: blanks`).toBeGreaterThan(0)
        expect(Number.isFinite(blank.resultingPieces), `${pattern.id}: resultingPieces`).toBe(true)
        expect(blank.resultingPieces, `${pattern.id}: resultingPieces`).toBeGreaterThan(0)
        for (const [name, dimension] of [
          ['finishedWidthCm', blank.finishedWidthCm],
          ['finishedHeightCm', blank.finishedHeightCm],
          ['cutWidthCm', blank.cutWidthCm],
          ['cutHeightCm', blank.cutHeightCm],
        ] as const) {
          expect(Number.isFinite(dimension), `${pattern.id}: ${name}`).toBe(true)
          expect(dimension, `${pattern.id}: ${name}`).toBeGreaterThan(0)
        }
        if (blank.batchBlankCount !== undefined || blank.batchResultCount !== undefined) {
          expect(blank.batchBlankCount, `${pattern.id}: batchBlankCount`).toBeGreaterThan(0)
          expect(blank.batchResultCount, `${pattern.id}: batchResultCount`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('records explicit output batches for HST and the three-color Hourglass method', () => {
    const hst = resolveCuttingRecipe('hst', {
      widthCm: 20,
      heightCm: 20,
      seamCm: 0.635,
    })!
    const hourglass = resolveCuttingRecipe('hourglass', {
      widthCm: 20,
      heightCm: 20,
      seamCm: 0.635,
    })!

    expect(hst.blanks).toHaveLength(2)
    expect(hst.blanks.every((blank) =>
      blank.blanks === 1
      && blank.resultingPieces === 1
      && blank.batchBlankCount === 1
      && blank.batchResultCount === 2)).toBe(true)
    expect(hourglass.blanks.map(({
      paletteIndex,
      blanks,
      resultingPieces,
      batchBlankCount,
      batchResultCount,
    }) => ({
      paletteIndex,
      blanks,
      resultingPieces,
      batchBlankCount,
      batchResultCount,
    }))).toEqual([
      { paletteIndex: 1, blanks: 2, resultingPieces: 1, batchBlankCount: 2, batchResultCount: 4 },
      { paletteIndex: 0, blanks: 1, resultingPieces: 1, batchBlankCount: 1, batchResultCount: 4 },
      { paletteIndex: 2, blanks: 1, resultingPieces: 1, batchBlankCount: 1, batchResultCount: 4 },
    ])
  })

  it('records Card Trick diagonal-square parent yields without a method-wide assumption', () => {
    const recipe = resolveCuttingRecipe('card-trick', {
      widthCm: 30,
      heightCm: 30,
      seamCm: 0.635,
    })!
    const standaloneParents = recipe.blanks.filter(({ partnerPaletteIndex }) =>
      partnerPaletteIndex === undefined)

    expect(standaloneParents.filter(({ batchResultCount }) => batchResultCount === 2))
      .toHaveLength(2)
    expect(standaloneParents.filter(({ batchResultCount }) => batchResultCount === 4))
      .toHaveLength(3)
    expect(standaloneParents.every(({ blanks, batchBlankCount, batchResultCount, resultingPieces }) =>
      blanks === 1
      && batchBlankCount === 1
      && resultingPieces === batchResultCount)).toBe(true)
  })

  it('records Jacob’s Ladder strip batches as twelve produced units with ten required', () => {
    const recipe = resolveCuttingRecipe('jacobs-ladder', {
      widthCm: 30,
      heightCm: 30,
      seamCm: 0.635,
    })!
    const strips = recipe.blanks.filter(({ role }) => role === 'strip')

    expect(strips).toHaveLength(2)
    expect(strips.every(({ blanks, resultingPieces, batchBlankCount, batchResultCount }) =>
      blanks === 2
      && resultingPieces === 10
      && batchBlankCount === 2
      && batchResultCount === 12)).toBe(true)
  })

  it('resolves one Flying Geese unit to one body and two corner blanks by default', () => {
    const recipe = resolveCuttingRecipe('flying-geese', {
      widthCm: 20,
      heightCm: 10,
      seamCm: 0.635,
    })!

    expect(recipe.method).toBe('flying-geese-sew-and-flip')
    expect(recipe.blanks).toEqual([
      expect.objectContaining({
        paletteIndex: 1,
        role: 'goose-body',
        shape: 'rectangle',
        blanks: 1,
        resultingPieces: 1,
        cutWidthCm: 21.27,
        cutHeightCm: 11.27,
        method: 'flying-geese-sew-and-flip',
      }),
      expect.objectContaining({
        paletteIndex: 0,
        role: 'goose-corner',
        shape: 'square',
        blanks: 2,
        resultingPieces: 2,
        cutWidthCm: 11.27,
        cutHeightCm: 11.27,
        method: 'flying-geese-sew-and-flip',
      }),
    ])
  })

  it('resolves four Flying Geese units to one large and four small no-waste squares', () => {
    const recipe = resolveCuttingRecipe('sawtooth-star', {
      widthCm: 40,
      heightCm: 40,
      seamCm: 0.635,
      flyingGeeseMethod: 'no-waste',
    })!
    const geese = recipe.blanks.filter(({ role }) =>
      role === 'goose-body' || role === 'goose-corner')

    expect(recipe.method).toBe('flying-geese-no-waste')
    expect(geese).toEqual([
      expect.objectContaining({
        role: 'goose-body',
        shape: 'square',
        blanks: 1,
        resultingPieces: 4,
        batchBlankCount: 1,
        batchResultCount: 4,
        cutWidthCm: 23.175,
        cutHeightCm: 23.175,
        method: 'flying-geese-no-waste',
      }),
      expect.objectContaining({
        role: 'goose-corner',
        shape: 'square',
        blanks: 4,
        resultingPieces: 8,
        batchBlankCount: 4,
        batchResultCount: 8,
        cutWidthCm: 12.2225,
        cutHeightCm: 12.2225,
        method: 'flying-geese-no-waste',
      }),
    ])
  })

  it('retains four geese in Sawtooth Star and eight in Dutchman’s Puzzle', () => {
    const context = { widthCm: 40, heightCm: 40, seamCm: 0.635 }
    const sawtooth = resolveCuttingRecipe('sawtooth-star', context)!
    const dutchman = resolveCuttingRecipe('dutchmans-puzzle', context)!
    const resultingUnits = (recipe: NonNullable<typeof sawtooth>) => ({
      bodies: recipe.blanks
        .filter(({ role }) => role === 'goose-body')
        .reduce((sum, { resultingPieces }) => sum + resultingPieces, 0),
      corners: recipe.blanks
        .filter(({ role }) => role === 'goose-corner')
        .reduce((sum, { resultingPieces }) => sum + resultingPieces, 0),
    })

    expect(resultingUnits(sawtooth)).toEqual({ bodies: 4, corners: 8 })
    expect(resultingUnits(dutchman)).toEqual({ bodies: 8, corners: 16 })
  })

  it('falls back to templates for every non-2:1 Flying Geese proportion', () => {
    const tooNarrow = resolveCuttingRecipe('flying-geese', {
      widthCm: 19,
      heightCm: 10,
      seamCm: 0.635,
    })!
    const tooWide = resolveCuttingRecipe('flying-geese', {
      widthCm: 30,
      heightCm: 10,
      seamCm: 0.635,
    })!
    const nonCanonicalNoWaste = resolveCuttingRecipe('flying-geese', {
      widthCm: 21,
      heightCm: 10,
      seamCm: 0.635,
      flyingGeeseMethod: 'no-waste',
    })!

    for (const recipe of [tooNarrow, tooWide, nonCanonicalNoWaste]) {
      expect(recipe.method).toBe('template')
      expect(recipe.blanks.every(({ method }) => method === 'template')).toBe(true)
    }

    const wideCornerTemplate = tooWide.blanks.find(({ paletteIndex }) => paletteIndex === 0)
    expect(wideCornerTemplate).toMatchObject({
      blanks: 2,
      finishedWidthCm: 15,
      finishedHeightCm: 10,
      cutWidthCm: 16.27,
      cutHeightCm: 11.27,
    })
  })
})
