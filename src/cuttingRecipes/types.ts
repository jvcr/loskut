export type RecipeMethod =
  | 'direct'
  | 'strip-piecing'
  | 'hst-two-at-a-time'
  | 'qst-two-at-a-time'
  | 'flying-geese-sew-and-flip'
  | 'flying-geese-no-waste'
  | 'template'
  | 'paper-piecing'
  | 'english-paper-piecing'

export type FlyingGeeseMethod = 'sew-and-flip' | 'no-waste'

export type RecipeRole =
  | 'square'
  | 'rectangle'
  | 'strip'
  | 'hst-square'
  | 'qst-square'
  | 'goose-body'
  | 'goose-corner'
  | 'template'
  | 'blade'
  | 'hexagon'

export interface RecipeContext {
  widthCm: number
  heightCm: number
  seamCm: number
  flyingGeeseMethod?: FlyingGeeseMethod
}

export interface ResolvedRecipeBlank {
  paletteIndex: number
  role: RecipeRole
  shape: 'square' | 'rectangle' | 'template'
  blanks: number
  resultingPieces: number
  batchBlankCount?: number
  batchResultCount?: number
  finishedWidthCm: number
  finishedHeightCm: number
  cutWidthCm: number
  cutHeightCm: number
  method: RecipeMethod
  partnerPaletteIndex?: number
}

export interface ResolvedCuttingRecipe {
  patternId: string
  method: RecipeMethod
  sourceUrl: string
  blanks: readonly ResolvedRecipeBlank[]
}

export interface BlockCuttingRecipe {
  patternId: string
  method: RecipeMethod
  sourceUrl: string
  resolveMethod?: (context: RecipeContext) => RecipeMethod
  resolve: (context: RecipeContext) => readonly ResolvedRecipeBlank[]
}

const positive = (value: number): number => Math.max(0, value)

export function directBlank(
  paletteIndex: number,
  role: 'square' | 'rectangle' | 'strip',
  blanks: number,
  finishedWidthCm: number,
  finishedHeightCm: number,
  seamCm: number,
  method: 'direct' | 'strip-piecing' = 'direct',
  resultingPieces = blanks,
): ResolvedRecipeBlank {
  return {
    paletteIndex,
    role,
    shape: role === 'square' ? 'square' : 'rectangle',
    blanks,
    resultingPieces,
    finishedWidthCm: positive(finishedWidthCm),
    finishedHeightCm: positive(finishedHeightCm),
    cutWidthCm: positive(finishedWidthCm + 2 * seamCm),
    cutHeightCm: positive(finishedHeightCm + 2 * seamCm),
    method,
  }
}

/** Two-at-a-time HST: finished unit + 7/8in at a 1/4in seam, generalized as 2s + 3/8in trim room. */
export function hstPairBlanks(
  firstPaletteIndex: number,
  secondPaletteIndex: number,
  units: number,
  finishedUnitCm: number,
  seamCm: number,
): ResolvedRecipeBlank[] {
  const batches = Math.ceil(units / 2)
  const cutSizeCm = positive(finishedUnitCm + 2 * seamCm + 0.9525)
  return [firstPaletteIndex, secondPaletteIndex].map((paletteIndex, index) => ({
    paletteIndex,
    role: 'hst-square',
    shape: 'square',
    blanks: batches,
    resultingPieces: units,
    batchBlankCount: 1,
    batchResultCount: 2,
    finishedWidthCm: positive(finishedUnitCm),
    finishedHeightCm: positive(finishedUnitCm),
    cutWidthCm: cutSizeCm,
    cutHeightCm: cutSizeCm,
    method: 'hst-two-at-a-time',
    partnerPaletteIndex: index === 0 ? secondPaletteIndex : firstPaletteIndex,
  }))
}

/** Two-at-a-time QST/hourglass: standard cut square is finished unit + 1.25in. */
export function qstPairBlanks(
  firstPaletteIndex: number,
  secondPaletteIndex: number,
  units: number,
  finishedUnitCm: number,
): ResolvedRecipeBlank[] {
  const batches = Math.ceil(units / 2)
  const cutSizeCm = positive(finishedUnitCm + 3.175)
  return [firstPaletteIndex, secondPaletteIndex].map((paletteIndex, index) => ({
    paletteIndex,
    role: 'qst-square',
    shape: 'square',
    blanks: batches,
    resultingPieces: units,
    batchBlankCount: 1,
    batchResultCount: 2,
    finishedWidthCm: positive(finishedUnitCm),
    finishedHeightCm: positive(finishedUnitCm),
    cutWidthCm: cutSizeCm,
    cutHeightCm: cutSizeCm,
    method: 'qst-two-at-a-time',
    partnerPaletteIndex: index === 0 ? secondPaletteIndex : firstPaletteIndex,
  }))
}

/** Flying Geese blanks for either one-at-a-time sew-and-flip or four-at-a-time no-waste construction. */
export function flyingGeeseBlanks(
  bodyPaletteIndex: number,
  cornerPaletteIndex: number,
  units: number,
  finishedWidthCm: number,
  finishedHeightCm: number,
  seamCm: number,
  flyingGeeseMethod: FlyingGeeseMethod = 'sew-and-flip',
): ResolvedRecipeBlank[] {
  const validUnit = Number.isFinite(finishedWidthCm)
    && Number.isFinite(finishedHeightCm)
    && finishedWidthCm > 0
    && finishedHeightCm > 0
  const validRatio = Math.abs(finishedWidthCm - 2 * finishedHeightCm)
    <= Math.max(finishedWidthCm, 2 * finishedHeightCm) * 1e-6
  if (!validUnit || !validRatio) {
    return [
      {
        ...templateBlank(
          bodyPaletteIndex,
          'template',
          units,
          finishedWidthCm,
          finishedHeightCm,
          seamCm,
        ),
        resultingPieces: units,
        partnerPaletteIndex: cornerPaletteIndex,
      },
      {
        ...templateBlank(
          cornerPaletteIndex,
          'template',
          units * 2,
          finishedWidthCm / 2,
          finishedHeightCm,
          seamCm,
        ),
        resultingPieces: units * 2,
        partnerPaletteIndex: bodyPaletteIndex,
      },
    ]
  }

  if (flyingGeeseMethod === 'no-waste') {
    const batches = Math.ceil(units / 4)
    const bodySizeCm = positive(finishedWidthCm + 3.175)
    const cornerSizeCm = positive(finishedHeightCm + 2.2225)
    return [
      {
        paletteIndex: bodyPaletteIndex,
        role: 'goose-body',
        shape: 'square',
        blanks: batches,
        resultingPieces: units,
        batchBlankCount: 1,
        batchResultCount: 4,
        finishedWidthCm: positive(finishedWidthCm),
        finishedHeightCm: positive(finishedHeightCm),
        cutWidthCm: bodySizeCm,
        cutHeightCm: bodySizeCm,
        method: 'flying-geese-no-waste',
        partnerPaletteIndex: cornerPaletteIndex,
      },
      {
        paletteIndex: cornerPaletteIndex,
        role: 'goose-corner',
        shape: 'square',
        blanks: batches * 4,
        resultingPieces: units * 2,
        batchBlankCount: 4,
        batchResultCount: 8,
        finishedWidthCm: positive(finishedHeightCm),
        finishedHeightCm: positive(finishedHeightCm),
        cutWidthCm: cornerSizeCm,
        cutHeightCm: cornerSizeCm,
        method: 'flying-geese-no-waste',
        partnerPaletteIndex: bodyPaletteIndex,
      },
    ]
  }

  const bodyWidth = positive(finishedWidthCm + 2 * seamCm)
  const bodyHeight = positive(finishedHeightCm + 2 * seamCm)
  return [
    {
      paletteIndex: bodyPaletteIndex,
      role: 'goose-body',
      shape: 'rectangle',
      blanks: units,
      resultingPieces: units,
      finishedWidthCm: positive(finishedWidthCm),
      finishedHeightCm: positive(finishedHeightCm),
      cutWidthCm: bodyWidth,
      cutHeightCm: bodyHeight,
      method: 'flying-geese-sew-and-flip',
      partnerPaletteIndex: cornerPaletteIndex,
    },
    {
      paletteIndex: cornerPaletteIndex,
      role: 'goose-corner',
      shape: 'square',
      blanks: units * 2,
      resultingPieces: units * 2,
      finishedWidthCm: positive(finishedHeightCm),
      finishedHeightCm: positive(finishedHeightCm),
      cutWidthCm: bodyHeight,
      cutHeightCm: bodyHeight,
      method: 'flying-geese-sew-and-flip',
      partnerPaletteIndex: bodyPaletteIndex,
    },
  ]
}

export function templateBlank(
  paletteIndex: number,
  role: 'template' | 'blade' | 'hexagon',
  blanks: number,
  finishedWidthCm: number,
  finishedHeightCm: number,
  seamCm: number,
  method: 'template' | 'paper-piecing' | 'english-paper-piecing' = 'template',
): ResolvedRecipeBlank {
  return {
    paletteIndex,
    role,
    shape: 'template',
    blanks,
    resultingPieces: blanks,
    finishedWidthCm: positive(finishedWidthCm),
    finishedHeightCm: positive(finishedHeightCm),
    cutWidthCm: positive(finishedWidthCm + 2 * seamCm),
    cutHeightCm: positive(finishedHeightCm + 2 * seamCm),
    method,
  }
}
