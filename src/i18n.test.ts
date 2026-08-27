import { describe, expect, it } from 'vitest'
import {
  centimetersToDisplay,
  displayLengthToCentimeters,
  localizedPatternName,
  metersToDisplayFabricLength,
  measurementUnits,
  squareCentimetersToDisplay,
} from './i18n'

describe('localized measurement boundaries', () => {
  it('round-trips inches without changing canonical centimeters', () => {
    const canonicalCentimeters = 63.5
    const displayedInches = centimetersToDisplay(canonicalCentimeters, 'imperial')

    expect(displayedInches).toBe(25)
    expect(displayLengthToCentimeters(displayedInches, 'imperial')).toBe(canonicalCentimeters)
    expect(centimetersToDisplay(canonicalCentimeters, 'metric')).toBe(canonicalCentimeters)
  })

  it('converts square centimeters to square inches and meters to yards', () => {
    expect(squareCentimetersToDisplay(6.4516, 'imperial')).toBeCloseTo(1, 12)
    expect(metersToDisplayFabricLength(0.9144, 'imperial')).toBeCloseTo(1, 12)
  })

  it('uses language-appropriate metric symbols and imperial symbols', () => {
    expect(measurementUnits('ru', 'metric')).toEqual({ length: 'см', area: 'см²', fabric: 'м' })
    expect(measurementUnits('en', 'metric')).toEqual({ length: 'cm', area: 'cm²', fabric: 'm' })
    expect(measurementUnits('en', 'imperial')).toEqual({ length: 'in', area: 'in²', fabric: 'yd' })
  })

  it('translates built-in pattern names but preserves custom fallbacks', () => {
    expect(localizedPatternName('en', 'shoo-fly', 'Муха')).toBe('Shoo-Fly')
    expect(localizedPatternName('ru', 'shoo-fly', 'Муха')).toBe('Муха')
    expect(localizedPatternName('en', 'custom-rose', 'Rose by Anna')).toBe('Rose by Anna')
  })
})
