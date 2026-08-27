import type { BlockCuttingRecipe } from './types'
import {
  directBlank,
  flyingGeeseBlanks,
  hstPairBlanks,
  qstPairBlanks,
} from './types'

export const STAR_RECIPES: readonly BlockCuttingRecipe[] = [
  {
    patternId: 'log-cabin',
    method: 'direct',
    sourceUrl: 'https://www.allpeoplequilt.com/quilt-patterns/quilt-blocks/log-cabin-quilt-block-option-1',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(0, 'rectangle', 1, widthCm / 5, heightCm / 5, seamCm),
      directBlank(1, 'square', 1, widthCm / 5, heightCm / 5, seamCm),
      directBlank(1, 'strip', 1, widthCm / 5, heightCm * 2 / 5, seamCm),
      directBlank(1, 'strip', 1, widthCm * 3 / 5, heightCm / 5, seamCm),
      directBlank(1, 'strip', 1, widthCm / 5, heightCm * 4 / 5, seamCm),
      directBlank(2, 'strip', 1, widthCm * 2 / 5, heightCm / 5, seamCm),
      directBlank(2, 'strip', 1, widthCm / 5, heightCm * 3 / 5, seamCm),
      directBlank(2, 'strip', 1, widthCm * 4 / 5, heightCm / 5, seamCm),
      directBlank(2, 'strip', 1, widthCm / 5, heightCm, seamCm),
    ],
  },
  {
    patternId: 'rail-fence',
    method: 'strip-piecing',
    sourceUrl: 'https://www.allpeoplequilt.com/quilt-patterns/quilt-blocks/rail-fence-quilt-block',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      directBlank(0, 'strip', 2, widthCm / 6, heightCm / 2, seamCm, 'strip-piecing'),
      directBlank(0, 'strip', 2, widthCm / 2, heightCm / 6, seamCm, 'strip-piecing'),
      directBlank(1, 'strip', 2, widthCm / 6, heightCm / 2, seamCm, 'strip-piecing'),
      directBlank(1, 'strip', 2, widthCm / 2, heightCm / 6, seamCm, 'strip-piecing'),
      directBlank(2, 'strip', 2, widthCm / 6, heightCm / 2, seamCm, 'strip-piecing'),
      directBlank(2, 'strip', 2, widthCm / 2, heightCm / 6, seamCm, 'strip-piecing'),
    ],
  },
  {
    patternId: 'flying-geese',
    method: 'flying-geese-sew-and-flip',
    sourceUrl: 'https://my.modafabrics.com/inspiration-resources/bake-shop-basics-flying-geese',
    resolveMethod: ({ flyingGeeseMethod }) =>
      flyingGeeseMethod === 'no-waste'
        ? 'flying-geese-no-waste'
        : 'flying-geese-sew-and-flip',
    resolve: ({ widthCm, heightCm, seamCm, flyingGeeseMethod }) =>
      flyingGeeseBlanks(1, 0, 1, widthCm, heightCm, seamCm, flyingGeeseMethod),
  },
  {
    patternId: 'ohio-star',
    method: 'qst-two-at-a-time',
    sourceUrl: 'https://my.modafabrics.com/2018/09/building-blocks-quarter-square-triangles.html',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      ...qstPairBlanks(0, 1, 4, widthCm / 3),
      directBlank(0, 'square', 4, widthCm / 3, heightCm / 3, seamCm),
      directBlank(2, 'square', 1, widthCm / 3, heightCm / 3, seamCm),
    ],
  },
  {
    patternId: 'sawtooth-star',
    method: 'flying-geese-sew-and-flip',
    sourceUrl: 'https://my.modafabrics.com/inspiration-resources/bake-shop-basics-flying-geese',
    resolveMethod: ({ flyingGeeseMethod }) =>
      flyingGeeseMethod === 'no-waste'
        ? 'flying-geese-no-waste'
        : 'flying-geese-sew-and-flip',
    resolve: ({ widthCm, heightCm, seamCm, flyingGeeseMethod }) => [
      ...flyingGeeseBlanks(1, 0, 4, widthCm / 2, heightCm / 4, seamCm, flyingGeeseMethod),
      directBlank(0, 'square', 4, widthCm / 4, heightCm / 4, seamCm),
      directBlank(2, 'square', 1, widthCm / 2, heightCm / 2, seamCm),
    ],
  },
  {
    patternId: 'churn-dash',
    method: 'hst-two-at-a-time',
    sourceUrl: 'https://www.allpeoplequilt.com/quilt-patterns/quilt-blocks/churn-dash-quilt-block',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      ...hstPairBlanks(0, 1, 4, widthCm / 3, seamCm),
      directBlank(0, 'rectangle', 2, widthCm / 3, heightCm / 6, seamCm),
      directBlank(1, 'rectangle', 2, widthCm / 3, heightCm / 6, seamCm),
      directBlank(0, 'rectangle', 2, widthCm / 6, heightCm / 3, seamCm),
      directBlank(1, 'rectangle', 2, widthCm / 6, heightCm / 3, seamCm),
      directBlank(2, 'square', 1, widthCm / 3, heightCm / 3, seamCm),
    ],
  },
  {
    patternId: 'friendship-star',
    method: 'hst-two-at-a-time',
    sourceUrl: 'https://www.allpeoplequilt.com/quilt-patterns/quilt-blocks/friendship-star-quilt-block',
    resolve: ({ widthCm, heightCm, seamCm }) => [
      ...hstPairBlanks(0, 1, 4, widthCm / 3, seamCm),
      directBlank(0, 'square', 4, widthCm / 3, heightCm / 3, seamCm),
      directBlank(2, 'square', 1, widthCm / 3, heightCm / 3, seamCm),
    ],
  },
]
