import {
  directBlank,
  hstPairBlanks,
  type BlockCuttingRecipe,
} from './types'

const trimmedHstPairBlanks = (
  firstPaletteIndex: number,
  secondPaletteIndex: number,
  units: number,
  finishedUnitCm: number,
  seamCm: number,
) => {
  const cutSizeCm = Math.max(0, finishedUnitCm + 4 * seamCm)
  return hstPairBlanks(
    firstPaletteIndex,
    secondPaletteIndex,
    units,
    finishedUnitCm,
    seamCm,
  ).map((blank) => ({
    ...blank,
    cutWidthCm: cutSizeCm,
    cutHeightCm: cutSizeCm,
  }))
}

export const CLASSIC_RECIPES: readonly BlockCuttingRecipe[] = [
  {
    patternId: 'bow-tie',
    method: 'direct',
    sourceUrl:
      'https://www.rileyblakedesigns.com/assets/images/freepatterns/quiltpatterns/MenswearFreePattern.pdf',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(1, 'square', 1, widthCm / 2, heightCm / 2, seamCm),
      directBlank(1, 'square', 1, widthCm / 4, heightCm / 4, seamCm),
      directBlank(2, 'square', 1, widthCm / 2, heightCm / 2, seamCm),
      directBlank(2, 'square', 1, widthCm / 4, heightCm / 4, seamCm),
      directBlank(0, 'square', 2, widthCm / 2, heightCm / 2, seamCm),
    ],
  },
  {
    patternId: 'bear-paw',
    method: 'hst-two-at-a-time',
    sourceUrl:
      'https://blog.fatquartershop.com/wp-content/uploads/2014/12/BearPawBlock-Pattern.pdf',
    resolve: ({ widthCm, heightCm, seamCm }) => {
      const unitWidthCm = widthCm / 7
      const unitHeightCm = heightCm / 7

      return [
        ...trimmedHstPairBlanks(1, 0, 16, unitWidthCm, seamCm),
        directBlank(1, 'square', 4, unitWidthCm * 2, unitHeightCm * 2, seamCm),
        directBlank(1, 'square', 1, unitWidthCm, unitHeightCm, seamCm),
        directBlank(0, 'square', 4, unitWidthCm, unitHeightCm, seamCm),
        directBlank(0, 'rectangle', 4, unitWidthCm, unitHeightCm * 3, seamCm),
      ]
    },
  },
  {
    patternId: 'basket',
    method: 'hst-two-at-a-time',
    sourceUrl:
      'https://www.polkadotchair.com/twelve-inch-basket-quilt-block-pattern-a-step-by-step-guide/',
    resolve: ({ widthCm, heightCm, seamCm }) => {
      const unitWidthCm = widthCm / 4
      const unitHeightCm = heightCm / 4

      return [
        ...trimmedHstPairBlanks(1, 0, 4, unitWidthCm, seamCm),
        ...trimmedHstPairBlanks(2, 0, 2, unitWidthCm, seamCm),
        directBlank(1, 'square', 3, unitWidthCm, unitHeightCm, seamCm),
        directBlank(0, 'square', 3, unitWidthCm, unitHeightCm, seamCm),
        directBlank(0, 'rectangle', 2, unitWidthCm, unitHeightCm * 2, seamCm),
      ]
    },
  },
  {
    patternId: 'shoo-fly',
    method: 'hst-two-at-a-time',
    sourceUrl: 'https://www.accuquilt.com/blog/shoo-fly-quilt-block-modern-quilt',
    resolve: ({ widthCm, heightCm, seamCm }) => {
      const unitWidthCm = widthCm / 3
      const unitHeightCm = heightCm / 3

      return [
        ...trimmedHstPairBlanks(1, 0, 4, unitWidthCm, seamCm),
        directBlank(1, 'square', 1, unitWidthCm, unitHeightCm, seamCm),
        directBlank(0, 'square', 4, unitWidthCm, unitHeightCm, seamCm),
      ]
    },
  },
  {
    patternId: 'jacobs-ladder',
    method: 'strip-piecing',
    sourceUrl: 'https://www.fatquartershop.com/downloadable/download/sample/sample_id/412/',
    resolve: ({ widthCm, seamCm }) => {
      const unitCm = widthCm / 3
      const stripFinishedWidthCm = unitCm / 2
      const stripFinishedLengthCm = unitCm * 3 + seamCm * 10

      return [
        ...trimmedHstPairBlanks(1, 0, 4, unitCm, seamCm),
        {
          ...directBlank(
            1,
            'strip',
            2,
            stripFinishedWidthCm,
            stripFinishedLengthCm,
            seamCm,
            'strip-piecing',
            10,
          ),
          batchBlankCount: 2,
          batchResultCount: 12,
        },
        {
          ...directBlank(
            0,
            'strip',
            2,
            stripFinishedWidthCm,
            stripFinishedLengthCm,
            seamCm,
            'strip-piecing',
            10,
          ),
          batchBlankCount: 2,
          batchResultCount: 12,
        },
      ]
    },
  },
  {
    patternId: 'maple-leaf',
    method: 'hst-two-at-a-time',
    sourceUrl: 'https://www.fatquartershop.com/downloadable/download/sample/sample_id/313/',
    resolve: ({ widthCm, heightCm, seamCm }) => {
      const unitWidthCm = widthCm / 3
      const unitHeightCm = heightCm / 3

      return [
        ...trimmedHstPairBlanks(1, 0, 4, unitWidthCm, seamCm),
        directBlank(1, 'square', 3, unitWidthCm, unitHeightCm, seamCm),
        directBlank(1, 'square', 1, unitWidthCm, unitHeightCm, seamCm),
        directBlank(0, 'square', 1, unitWidthCm, unitHeightCm, seamCm),
        directBlank(
          0,
          'square',
          2,
          (unitWidthCm * 5) / 6,
          (unitHeightCm * 5) / 6,
          seamCm,
        ),
      ]
    },
  },
  {
    patternId: 'courthouse-steps',
    method: 'strip-piecing',
    sourceUrl: 'https://www.missouriquiltco.com/pages/tutorial-courthouse-steps-quilt',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(3, 'rectangle', 1, widthCm / 5, heightCm / 5, seamCm),
      directBlank(1, 'strip', 2, (widthCm * 2) / 5, heightCm / 10, seamCm, 'strip-piecing'),
      directBlank(1, 'strip', 4, (widthCm * 3) / 5, heightCm / 10, seamCm, 'strip-piecing'),
      directBlank(1, 'strip', 2, (widthCm * 4) / 5, heightCm / 10, seamCm, 'strip-piecing'),
      directBlank(2, 'strip', 2, widthCm / 10, heightCm / 5, seamCm, 'strip-piecing'),
      directBlank(2, 'strip', 2, widthCm / 10, (heightCm * 2) / 5, seamCm, 'strip-piecing'),
      directBlank(2, 'strip', 2, widthCm / 10, (heightCm * 4) / 5, seamCm, 'strip-piecing'),
      directBlank(2, 'strip', 2, widthCm / 10, heightCm, seamCm, 'strip-piecing'),
    ],
  },
]
