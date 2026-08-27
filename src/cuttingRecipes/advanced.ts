import {
  directBlank,
  flyingGeeseBlanks,
  hstPairBlanks,
  templateBlank,
  type BlockCuttingRecipe,
  type ResolvedRecipeBlank,
} from './types'

const DUTCHMANS_PUZZLE_SOURCE =
  'https://fabric406.com/blogs/fabric406-blog/free-dutchmans-puzzle-quilt-block-tutorial'
const CARD_TRICK_SOURCE =
  'https://scissortailquilting.com/wp-content/uploads/dlm_uploads/2019/10/CardTrickQuiltBlockPattern.pdf'
const STORM_AT_SEA_SOURCE = 'https://www.accuquilt.com/blog/tidal-wave-storm-at-sea'
const DRESDEN_PLATE_SOURCE =
  'https://webfiles.modafabrics.com/webfiles/fp_DresdenSummerStitchAlong.pdf'
const FLOWER_GARDEN_SOURCE =
  'https://webfiles.modafabrics.com/webfiles/fp_StrawberryLemonadePS37670.pdf'

export const ADVANCED_RECIPES: readonly BlockCuttingRecipe[] = [
  {
    patternId: 'dutchmans-puzzle',
    method: 'flying-geese-sew-and-flip',
    sourceUrl: DUTCHMANS_PUZZLE_SOURCE,
    resolveMethod: ({ flyingGeeseMethod }) =>
      flyingGeeseMethod === 'no-waste'
        ? 'flying-geese-no-waste'
        : 'flying-geese-sew-and-flip',
    resolve: ({ widthCm, heightCm, seamCm, flyingGeeseMethod }) => [
      ...flyingGeeseBlanks(1, 0, 4, widthCm / 2, heightCm / 4, seamCm, flyingGeeseMethod),
      ...flyingGeeseBlanks(2, 0, 4, widthCm / 2, heightCm / 4, seamCm, flyingGeeseMethod),
    ],
  },
  {
    patternId: 'card-trick',
    method: 'hst-two-at-a-time',
    sourceUrl: CARD_TRICK_SOURCE,
    resolve: ({ widthCm, seamCm }) => {
      const cell = widthCm / 3
      const hstCutSize = cell + 4 * seamCm
      const largeTriangleCutSize = cell + 3.5 * seamCm
      const qstParentCutSize = cell + 5 * seamCm
      const diagonalSquareParent = (
        paletteIndex: number,
        blanks: number,
        cutSizeCm: number,
        role: 'hst-square' | 'qst-square',
        method: 'hst-two-at-a-time' | 'qst-two-at-a-time',
        piecesPerBlank: number,
      ): ResolvedRecipeBlank => ({
        ...directBlank(paletteIndex, 'square', blanks, cell, cell, seamCm),
        role,
        resultingPieces: blanks * piecesPerBlank,
        batchBlankCount: 1,
        batchResultCount: piecesPerBlank,
        cutWidthCm: cutSizeCm,
        cutHeightCm: cutSizeCm,
        method,
      })
      const cornerHsts = [
        ...hstPairBlanks(0, 1, 2, cell, seamCm),
        ...hstPairBlanks(0, 2, 2, cell, seamCm),
      ].map((blank) => ({
        ...blank,
        cutWidthCm: hstCutSize,
        cutHeightCm: hstCutSize,
      }))

      return [
        ...cornerHsts,
        diagonalSquareParent(
          1,
          1,
          largeTriangleCutSize,
          'hst-square',
          'hst-two-at-a-time',
          2,
        ),
        diagonalSquareParent(
          2,
          1,
          largeTriangleCutSize,
          'hst-square',
          'hst-two-at-a-time',
          2,
        ),
        diagonalSquareParent(
          0,
          1,
          qstParentCutSize,
          'qst-square',
          'qst-two-at-a-time',
          4,
        ),
        diagonalSquareParent(
          1,
          1,
          qstParentCutSize,
          'qst-square',
          'qst-two-at-a-time',
          4,
        ),
        diagonalSquareParent(
          2,
          1,
          qstParentCutSize,
          'qst-square',
          'qst-two-at-a-time',
          4,
        ),
      ]
    },
  },
  {
    patternId: 'snails-trail',
    method: 'template',
    sourceUrl: STORM_AT_SEA_SOURCE,
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(1, 'square', 2, widthCm / 8, heightCm / 8, seamCm),
      directBlank(2, 'square', 2, widthCm / 8, heightCm / 8, seamCm),
      templateBlank(2, 'template', 2, widthCm / 4, heightCm / 8, seamCm),
      templateBlank(1, 'template', 2, widthCm / 8, heightCm / 4, seamCm),
      templateBlank(1, 'template', 2, widthCm / 4, heightCm / 4, seamCm),
      templateBlank(2, 'template', 2, widthCm / 4, heightCm / 4, seamCm),
      templateBlank(1, 'template', 2, widthCm / 2, heightCm / 4, seamCm),
      templateBlank(2, 'template', 2, widthCm / 4, heightCm / 2, seamCm),
      templateBlank(1, 'template', 2, widthCm / 2, heightCm / 2, seamCm),
      templateBlank(2, 'template', 2, widthCm / 2, heightCm / 2, seamCm),
    ],
  },
  {
    patternId: 'storm-at-sea',
    method: 'template',
    sourceUrl: STORM_AT_SEA_SOURCE,
    resolve: ({ widthCm, heightCm, seamCm }) => [
      templateBlank(2, 'template', 1, (3 * widthCm) / 5, (3 * heightCm) / 5, seamCm),
      templateBlank(1, 'template', 2, widthCm / 2, heightCm / 5, seamCm),
      templateBlank(1, 'template', 2, widthCm / 5, heightCm / 2, seamCm),
      templateBlank(2, 'template', 4, widthCm / 5, heightCm / 5, seamCm),
      templateBlank(0, 'template', 4, widthCm / 2, heightCm / 2, seamCm),
    ],
  },
  {
    patternId: 'dresden-plate',
    method: 'template',
    sourceUrl: DRESDEN_PLATE_SOURCE,
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(0, 'square', 1, widthCm, heightCm, seamCm),
      templateBlank(0, 'template', 1, (3 * widthCm) / 10, (3 * heightCm) / 10, seamCm),
      templateBlank(1, 'blade', 4, widthCm / 2, heightCm / 2, seamCm),
      templateBlank(2, 'blade', 4, widthCm / 2, heightCm / 2, seamCm),
      templateBlank(3, 'blade', 4, widthCm / 2, heightCm / 2, seamCm),
    ],
  },
  {
    patternId: 'grandmothers-flower-garden',
    method: 'english-paper-piecing',
    sourceUrl: FLOWER_GARDEN_SOURCE,
    resolve: ({ widthCm, heightCm, seamCm }) => {
      const hexagonWidth = (2 * widthCm) / (3 * Math.sqrt(3))
      const hexagonHeight = heightCm / 3

      return [
        directBlank(0, 'square', 1, widthCm, heightCm, seamCm),
        templateBlank(
          2,
          'hexagon',
          1,
          hexagonWidth,
          hexagonHeight,
          seamCm,
          'english-paper-piecing',
        ),
        templateBlank(
          1,
          'hexagon',
          3,
          hexagonWidth,
          hexagonHeight,
          seamCm,
          'english-paper-piecing',
        ),
        templateBlank(
          3,
          'hexagon',
          3,
          hexagonWidth,
          hexagonHeight,
          seamCm,
          'english-paper-piecing',
        ),
      ]
    },
  },
]
