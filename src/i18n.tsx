import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'ru' | 'en'
export type MeasurementSystem = 'metric' | 'imperial'

const PREFERENCES_KEY = 'loskut.editor.preferences'
export const CM_PER_INCH = 2.54
export const CM2_PER_IN2 = CM_PER_INCH * CM_PER_INCH
export const METERS_PER_YARD = 0.9144

const ENGLISH_PATTERN_NAMES: Record<string, string> = {
  solid: 'Solid',
  hst: 'Half-square triangle',
  hourglass: 'Hourglass',
  pinwheel: 'Pinwheel',
  checker: 'Checkerboard',
  stripes: 'Stripes',
  diamond: 'Diamond',
  'nine-patch': 'Nine Patch',
  'four-patch': 'Four Patch',
  'log-cabin': 'Log Cabin',
  'rail-fence': 'Rail Fence',
  'flying-geese': 'Flying Geese',
  'ohio-star': 'Ohio Star',
  'sawtooth-star': 'Sawtooth Star',
  'churn-dash': 'Churn Dash',
  'bow-tie': 'Bow Tie',
  'friendship-star': 'Friendship Star',
  'bear-paw': "Bear's Paw",
  basket: 'Basket',
  'shoo-fly': 'Shoo-Fly',
  'jacobs-ladder': "Jacob's Ladder",
  'maple-leaf': 'Maple Leaf',
  'courthouse-steps': 'Courthouse Steps',
  'dutchmans-puzzle': "Dutchman's Puzzle",
  'card-trick': 'Card Trick',
  'snails-trail': "Snail's Trail",
  'storm-at-sea': 'Storm at Sea',
  'dresden-plate': 'Dresden Plate',
  'grandmothers-flower-garden': "Grandmother's Flower Garden",
}

export function localizedPatternName(language: Language, id: string, fallback: string): string {
  return language === 'en' ? ENGLISH_PATTERN_NAMES[id] ?? fallback : fallback
}

export function centimetersToDisplay(centimeters: number, system: MeasurementSystem): number {
  return system === 'metric' ? centimeters : centimeters / CM_PER_INCH
}

export function displayLengthToCentimeters(value: number, system: MeasurementSystem): number {
  return system === 'metric' ? value : value * CM_PER_INCH
}

export function squareCentimetersToDisplay(squareCentimeters: number, system: MeasurementSystem): number {
  return system === 'metric' ? squareCentimeters : squareCentimeters / CM2_PER_IN2
}

export function metersToDisplayFabricLength(meters: number, system: MeasurementSystem): number {
  return system === 'metric' ? meters : meters / METERS_PER_YARD
}

export function measurementUnits(language: Language, system: MeasurementSystem): {
  length: 'см' | 'cm' | 'in'
  area: 'см²' | 'cm²' | 'in²'
  fabric: 'м' | 'm' | 'yd'
} {
  if (system === 'imperial') return { length: 'in', area: 'in²', fabric: 'yd' }
  return language === 'ru'
    ? { length: 'см', area: 'см²', fabric: 'м' }
    : { length: 'cm', area: 'cm²', fabric: 'm' }
}

interface PreferencesContextValue {
  language: Language
  measurementSystem: MeasurementSystem
  setLanguage: (language: Language) => void
  setMeasurementSystem: (system: MeasurementSystem) => void
  text: (russian: string, english: string) => string
  patternName: (id: string, fallback: string) => string
  lengthUnit: 'см' | 'cm' | 'in'
  areaUnit: 'см²' | 'cm²' | 'in²'
  fabricUnit: 'м' | 'm' | 'yd'
  toDisplayLength: (centimeters: number) => number
  fromDisplayLength: (value: number) => number
  formatLength: (centimeters: number, maximumFractionDigits?: number) => string
  formatArea: (squareCentimeters: number, maximumFractionDigits?: number) => string
  formatFabricLength: (meters: number, minimumFractionDigits?: number) => string
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function loadPreferences(): { language: Language; measurementSystem: MeasurementSystem } {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Record<string, unknown>
    return {
      language: stored.language === 'en' ? 'en' : 'ru',
      measurementSystem: stored.measurementSystem === 'imperial' ? 'imperial' : 'metric',
    }
  } catch {
    return { language: 'ru', measurementSystem: 'metric' }
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(loadPreferences, [])
  const [language, setLanguage] = useState<Language>(initial.language)
  const [measurementSystem, setMeasurementSystem] = useState<MeasurementSystem>(initial.measurementSystem)

  useEffect(() => {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ language, measurementSystem }))
    document.documentElement.lang = language
  }, [language, measurementSystem])

  const value = useMemo<PreferencesContextValue>(() => {
    const locale = language === 'ru' ? 'ru-RU' : 'en-US'
    const units = measurementUnits(language, measurementSystem)
    const lengthUnit = units.length
    const areaUnit = units.area
    const fabricUnit = units.fabric
    const toDisplayLength = (centimeters: number) => centimetersToDisplay(centimeters, measurementSystem)
    const fromDisplayLength = (displayValue: number) => displayLengthToCentimeters(displayValue, measurementSystem)
    const formatNumber = (value: number, maximumFractionDigits: number, minimumFractionDigits = 0) => new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value)

    return {
      language,
      measurementSystem,
      setLanguage,
      setMeasurementSystem,
      text: (russian, english) => language === 'ru' ? russian : english,
      patternName: (id, fallback) => localizedPatternName(language, id, fallback),
      lengthUnit,
      areaUnit,
      fabricUnit,
      toDisplayLength,
      fromDisplayLength,
      formatLength: (centimeters, maximumFractionDigits = 2) => `${formatNumber(toDisplayLength(centimeters), maximumFractionDigits)} ${lengthUnit}`,
      formatArea: (squareCentimeters, maximumFractionDigits = 1) => `${formatNumber(squareCentimetersToDisplay(squareCentimeters, measurementSystem), maximumFractionDigits)} ${areaUnit}`,
      formatFabricLength: (meters, minimumFractionDigits = 1) => `${formatNumber(metersToDisplayFabricLength(meters, measurementSystem), 2, minimumFractionDigits)} ${fabricUnit}`,
    }
  }, [language, measurementSystem])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider')
  return context
}
