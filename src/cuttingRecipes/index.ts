import { ADVANCED_RECIPES } from './advanced'
import { BASIC_RECIPES } from './basic'
import { CLASSIC_RECIPES } from './classics'
import { STAR_RECIPES } from './stars'
import type { BlockCuttingRecipe, RecipeContext, ResolvedCuttingRecipe } from './types'

export type {
  BlockCuttingRecipe,
  RecipeContext,
  FlyingGeeseMethod,
  RecipeMethod,
  RecipeRole,
  ResolvedCuttingRecipe,
  ResolvedRecipeBlank,
} from './types'

export const CUTTING_RECIPES: readonly BlockCuttingRecipe[] = [
  ...BASIC_RECIPES,
  ...STAR_RECIPES,
  ...CLASSIC_RECIPES,
  ...ADVANCED_RECIPES,
]

const RECIPES_BY_PATTERN = new Map(CUTTING_RECIPES.map((recipe) => [recipe.patternId, recipe]))

export function resolveCuttingRecipe(patternId: string, context: RecipeContext): ResolvedCuttingRecipe | null {
  const recipe = RECIPES_BY_PATTERN.get(patternId)
  if (!recipe) return null
  const blanks = recipe.resolve(context)
  const resolvedMethod = recipe.resolveMethod?.(context) ?? recipe.method
  return {
    patternId,
    method: blanks.length > 0 && blanks.every(({ method }) => method === 'template')
      ? 'template'
      : resolvedMethod,
    sourceUrl: recipe.sourceUrl,
    blanks,
  }
}
