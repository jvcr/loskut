import {
  directBlank,
  hstPairBlanks,
  templateBlank,
  type BlockCuttingRecipe,
} from './types'

export const BASIC_RECIPES: readonly BlockCuttingRecipe[] = [
  {
    patternId: 'solid',
    method: 'direct',
    sourceUrl: 'https://www.janome.com/wp-content/uploads/2025/02/chevron-table-runner.pdf',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(0, 'rectangle', 1, widthCm, heightCm, seamCm),
    ],
  },
  {
    patternId: 'hst',
    method: 'hst-two-at-a-time',
    sourceUrl:
      'https://my2.modafabrics.com/inspiration-resources/how-make-perfect-half-square-triangles-hsts-%E2%80%93-step-step-guide',
    resolve: ({ widthCm, seamCm }) => hstPairBlanks(0, 1, 1, widthCm, seamCm),
  },
  {
    patternId: 'hourglass',
    method: 'qst-two-at-a-time',
    sourceUrl: 'https://my.modafabrics.com/2018/09/building-blocks-quarter-square-triangles.html',
    resolve: ({ widthCm }) => {
      const cutSizeCm = Math.max(0, widthCm + 3.175)
      const hourglassParent = (
        paletteIndex: number,
        batchBlankCount: number,
      ) => ({
        paletteIndex,
        role: 'qst-square' as const,
        shape: 'square' as const,
        blanks: batchBlankCount,
        resultingPieces: 1,
        batchBlankCount,
        batchResultCount: 4,
        finishedWidthCm: Math.max(0, widthCm),
        finishedHeightCm: Math.max(0, widthCm),
        cutWidthCm: cutSizeCm,
        cutHeightCm: cutSizeCm,
        method: 'qst-two-at-a-time' as const,
      })
      return [
        hourglassParent(1, 2),
        hourglassParent(0, 1),
        hourglassParent(2, 1),
      ]
    },
  },
  {
    patternId: 'pinwheel',
    method: 'hst-two-at-a-time',
    sourceUrl: 'https://my.modafabrics.com/2016/10/black-and-pinwheels.html',
    resolve: ({ widthCm, seamCm }) => [
      ...hstPairBlanks(1, 0, 2, widthCm / 2, seamCm),
      ...hstPairBlanks(1, 2, 2, widthCm / 2, seamCm),
    ],
  },
  {
    patternId: 'checker',
    method: 'direct',
    sourceUrl:
      'https://my.modafabrics.com/inspiration-resources/bh5-group-2-block-8-crystal-manning',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(0, 'rectangle', 2, widthCm / 2, heightCm / 2, seamCm),
      directBlank(1, 'rectangle', 2, widthCm / 2, heightCm / 2, seamCm),
    ],
  },
  {
    patternId: 'stripes',
    method: 'strip-piecing',
    sourceUrl: 'https://my.modafabrics.com/sites/default/files/love-you-mean-it-instructions.pdf',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(1, 'strip', 1, widthCm / 4, heightCm, seamCm, 'strip-piecing'),
      directBlank(0, 'strip', 2, widthCm / 4, heightCm, seamCm, 'strip-piecing'),
      directBlank(2, 'strip', 1, widthCm / 4, heightCm, seamCm, 'strip-piecing'),
    ],
  },
  {
    patternId: 'diamond',
    method: 'paper-piecing',
    sourceUrl: 'https://www.janome.com/wp-content/uploads/2025/02/chevron-table-runner.pdf',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      templateBlank(0, 'template', 1, widthCm, heightCm, seamCm, 'paper-piecing'),
      templateBlank(1, 'template', 1, widthCm, heightCm, seamCm, 'paper-piecing'),
      templateBlank(2, 'template', 1, widthCm, heightCm, seamCm, 'paper-piecing'),
    ],
  },
  {
    patternId: 'nine-patch',
    method: 'strip-piecing',
    sourceUrl: 'https://my.modafabrics.com/sites/default/files/love-you-mean-it-instructions.pdf',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(
        1,
        'strip',
        2,
        (2 * widthCm) / 3 + 2 * seamCm,
        heightCm / 3,
        seamCm,
        'strip-piecing',
        4,
      ),
      directBlank(
        0,
        'strip',
        1,
        (2 * widthCm) / 3 + 2 * seamCm,
        heightCm / 3,
        seamCm,
        'strip-piecing',
        2,
      ),
      directBlank(0, 'strip', 2, widthCm / 3, heightCm / 3, seamCm, 'strip-piecing'),
      directBlank(1, 'strip', 1, widthCm / 3, heightCm / 3, seamCm, 'strip-piecing'),
    ],
  },
  {
    patternId: 'four-patch',
    method: 'strip-piecing',
    sourceUrl:
      'https://my.modafabrics.com/inspiration-resources/bh5-group-2-block-8-crystal-manning',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(
        0,
        'strip',
        1,
        widthCm + 2 * seamCm,
        heightCm / 2,
        seamCm,
        'strip-piecing',
        2,
      ),
      directBlank(
        1,
        'strip',
        1,
        widthCm + 2 * seamCm,
        heightCm / 2,
        seamCm,
        'strip-piecing',
        2,
      ),
    ],
  },
]
