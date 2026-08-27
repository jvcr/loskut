import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  calculateQuilt,
  cloneCustomPattern,
  createDocument,
  insertColumn,
  insertRow,
  mergeCells,
  migrateDocument,
  mirrorCells,
  PATTERNS,
  patternById,
  randomizeCellRotations,
  randomizeUnlockedPalette,
  removeColumn,
  removeRow,
  resetCellRotations,
  resizeColumn,
  resizeDocument,
  resizeRow,
  rotateCell,
  selectPreset as selectionPresetIndices,
  unmergeCells,
  updateCells,
  type BlockPattern,
  type FabricPlacement,
  type PatternId,
  type QuiltCell,
  type QuiltDocument,
} from './editorModel'
import { PatternPreview } from './PatternPreview'
import { BlockEditorModal } from './BlockEditorModal'
import { FabricCalculatorPanel } from './FabricCalculatorPanel'
import { PATTERN_CATEGORY_BY_ID } from './standardPatterns'
import { PrintBlockModal } from './PrintBlockModal'
import { usePreferences } from './i18n'

type PanelId = 'blocks' | 'colors' | 'grid' | 'calculator'
type PatternCategory = 'all' | 'basic' | 'stars' | 'triangles' | 'classic'
type Tool = 'select' | 'paint' | 'eyedropper' | 'pan'

interface HistoryState {
  past: QuiltDocument[]
  present: QuiltDocument
  future: QuiltDocument[]
}

type HistoryAction =
  | { type: 'commit'; next: QuiltDocument }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; next: QuiltDocument }

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'commit') {
    if (action.next === state.present) return state
    return { past: [...state.past.slice(-49), state.present], present: action.next, future: [] }
  }
  if (action.type === 'undo') {
    const previous = state.past.at(-1)
    if (!previous) return state
    return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] }
  }
  if (action.type === 'redo') {
    const next = state.future[0]
    if (!next) return state
    return { past: [...state.past, state.present], present: next, future: state.future.slice(1) }
  }
  return { past: [], present: action.next, future: [] }
}

const PATTERN_CATEGORIES: readonly PatternCategory[] = ['all', 'basic', 'stars', 'triangles', 'classic']
const PATTERN_CATEGORY_NAMES: Record<Exclude<PatternCategory, 'all'>, string> = {
  basic: 'Базовые',
  stars: 'Звёзды',
  triangles: 'Треугольники',
  classic: 'Классика',
}

const COLOR_NAMES = [
  ['Фон', 'Background'],
  ['Акцент', 'Accent'],
  ['Контраст', 'Contrast'],
  ['Дополнительный', 'Secondary'],
] as const
const RANDOM_COLORS = ['#ef476f', '#7c5cff', '#0f9f92', '#ff9f1c', '#2176ff', '#8338ec', '#e63946', '#2a9d8f']

const LOCAL_DOCUMENT_KEY = 'loskut.editor.document.v2'
const AUTOSAVE_KEY = 'loskut.editor.autosave'

function loadLocalDocument(initialDocument?: QuiltDocument): QuiltDocument {
  if (initialDocument) return migrateDocument(initialDocument)
  try {
    const saved = window.localStorage.getItem(LOCAL_DOCUMENT_KEY)
    return saved ? migrateDocument(JSON.parse(saved)) : createDocument()
  } catch {
    return createDocument()
  }
}

function drawPattern(
  context: CanvasRenderingContext2D,
  cell: QuiltCell,
  palette: readonly string[],
  fabricImages: readonly (HTMLImageElement | null)[],
  fabricPlacements: readonly FabricPlacement[],
  patterns: readonly BlockPattern[],
  x: number,
  y: number,
  width: number,
  height: number,
  showGrid: boolean,
) {
  const pattern = patternById(cell.patternId, patterns)
  context.save()
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.translate(x + width / 2, y + height / 2)
  context.scale(cell.mirrorX ? -1 : 1, cell.mirrorY ? -1 : 1)
  context.rotate(cell.rotation * Math.PI / 180)
  context.translate(-width / 2, -height / 2)
  const fills = palette.map((color, index) => {
    const image = fabricImages[index]
    if (!image) return color
    const placement = fabricPlacements[index] ?? { zoom: 1, positionX: 50, positionY: 50 }
    const canvasPattern = context.createPattern(image, 'no-repeat')
    if (!canvasPattern) return color
    const offsetX = -(placement.zoom - 1) * width * placement.positionX / 100
    const offsetY = -(placement.zoom - 1) * height * placement.positionY / 100
    canvasPattern.setTransform(new DOMMatrix()
      .translate(offsetX, offsetY)
      .scale(width * placement.zoom / image.naturalWidth, height * placement.zoom / image.naturalHeight))
    return canvasPattern
  })
  context.fillStyle = fills[pattern.background] ?? palette[0]
  context.fillRect(0, 0, width, height)
  for (const shape of pattern.shapes) {
    context.beginPath()
    shape.points.forEach(([pointX, pointY], index) => {
      const px = pointX * width
      const py = pointY * height
      if (index === 0) context.moveTo(px, py)
      else context.lineTo(px, py)
    })
    context.closePath()
    context.fillStyle = fills[shape.color] ?? palette[0]
    context.fill()
  }
  context.restore()
  if (showGrid) {
    context.strokeStyle = 'rgba(30, 25, 48, 0.18)'
    context.lineWidth = Math.max(1, Math.min(width, height) * 0.012)
    context.strokeRect(x, y, width, height)
  }
}

export interface EditorPageProps {
  initialDocument?: QuiltDocument
  onBack?: () => void
  onSave?: (document: QuiltDocument) => void
  onSaveBlock?: (name: string, patternId: PatternId) => void
}


export default function EditorPage({ initialDocument, onBack, onSave, onSaveBlock }: EditorPageProps) {
  const {
    language,
    measurementSystem,
    setLanguage,
    setMeasurementSystem,
    text,
    patternName,
    lengthUnit,
    toDisplayLength,
    fromDisplayLength,
    formatLength,
    formatFabricLength,
  } = usePreferences()
  const [history, dispatch] = useReducer(historyReducer, initialDocument, (document) => ({
    past: [],
    present: loadLocalDocument(document),
    future: [],
  }))
  const [patternCategory, setPatternCategory] = useState<PatternCategory>('all')
  const document = history.present
  const [activePanel, setActivePanel] = useState<PanelId>('blocks')
  const [tool, setTool] = useState<Tool>('paint')
  const [activePattern, setActivePattern] = useState<PatternId>('hst')
  const [selectedCells, setSelectedCells] = useState<Set<number>>(() => new Set([0]))
  const [zoom, setZoom] = useState(0.9)
  const [toast, setToast] = useState('')
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [autosave, setAutosave] = useState(() => window.localStorage.getItem(AUTOSAVE_KEY) !== 'false')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [blockEditor, setBlockEditor] = useState<BlockPattern | 'new' | null>(null)
  const [printPattern, setPrintPattern] = useState<BlockPattern | null>(null)
  const [selectedHeader, setSelectedHeader] = useState<{ kind: 'row' | 'column'; index: number } | null>(null)
  const [editingFabricIndex, setEditingFabricIndex] = useState<number | null>(null)
  const painting = useRef(false)
  const selectionAnchor = useRef<number | null>(null)
  const panStart = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null)
  const copiedCell = useRef<QuiltCell | null>(null)
  const paletteImageInput = useRef<HTMLInputElement>(null)
  const fabricImageInput = useRef<HTMLInputElement>(null)
  const fabricTarget = useRef(0)
  const importInput = useRef<HTMLInputElement>(null)

  const commit = useCallback((update: QuiltDocument | ((current: QuiltDocument) => QuiltDocument)) => {
    const next = typeof update === 'function' ? update(history.present) : update
    dispatch({ type: 'commit', next })
  }, [history.present])

  const selectedIndices = useMemo(() => [...selectedCells].filter((index) => index < document.cells.length), [document.cells.length, selectedCells])
  const estimate = useMemo(() => calculateQuilt(document), [document])
  const patterns = useMemo(() => [...PATTERNS, ...(document.customPatterns ?? [])], [document.customPatterns])
  const visiblePatterns = useMemo(() => patternCategory === 'all'
    ? patterns
    : patterns.filter((pattern) => (PATTERN_CATEGORY_BY_ID[pattern.id] ?? 'Базовые') === PATTERN_CATEGORY_NAMES[patternCategory]),
  [patternCategory, patterns])
  const editingFabricSource = editingFabricIndex === null ? null : document.fabricFills?.[editingFabricIndex] ?? null
  const editingFabricPlacement = editingFabricIndex === null
    ? null
    : document.fabricPlacements?.[editingFabricIndex] ?? { zoom: 1, positionX: 50, positionY: 50 }

  const flash = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 1900)
  }, [])

  const applyPattern = useCallback((index: number) => {
    commit((current) => updateCells(current, [index], (cell) => ({ ...cell, patternId: activePattern })))
  }, [activePattern, commit])
  const choosePattern = useCallback((patternId: PatternId) => {
    setActivePattern(patternId)
    setTool('paint')
    if (selectedIndices.length === 0) return
    commit((current) => updateCells(current, selectedIndices, (cell) => ({ ...cell, patternId })))
    flash(language === 'ru'
      ? `Блок применён к выделенным ячейкам: ${selectedIndices.length}`
      : `Pattern applied to selected cells: ${selectedIndices.length}`)
  }, [commit, flash, language, selectedIndices])

  const rotateSelection = useCallback(() => {
    if (selectedIndices.length === 0) return
    commit((current) => updateCells(current, selectedIndices, rotateCell))
  }, [commit, selectedIndices])

  const rotateSelectionLeft = useCallback(() => {
    if (selectedIndices.length === 0) return
    commit((current) => updateCells(current, selectedIndices, (cell) => ({
      ...cell,
      rotation: ((cell.rotation + 270) % 360) as QuiltCell['rotation'],
    })))
  }, [commit, selectedIndices])

  const randomizeSelectionRotation = useCallback(() => {
    if (selectedIndices.length === 0) return
    commit((current) => randomizeCellRotations(current, selectedIndices))
  }, [commit, selectedIndices])

  const resetSelectionRotation = useCallback(() => {
    if (selectedIndices.length === 0) return
    commit((current) => resetCellRotations(current, selectedIndices))
  }, [commit, selectedIndices])

  const selectPreset = (preset: 'all' | 'odd' | 'even' | 'border' | 'diagonal' | 'clear') => {
    setSelectedCells(new Set(selectionPresetIndices(document, preset)))
    setTool('select')
  }

  const selectRow = (row: number) => {
    setSelectedCells(new Set(Array.from({ length: document.columns }, (_, column) => row * document.columns + column)))
    setSelectedHeader({ kind: 'row', index: row })
    setTool('select')
  }

  const selectColumn = (column: number) => {
    setSelectedCells(new Set(Array.from({ length: document.rows }, (_, row) => row * document.columns + column)))
    setSelectedHeader({ kind: 'column', index: column })
    setTool('select')
  }

  const dragSelectionTo = (index: number) => {
    const anchor = selectionAnchor.current
    if (anchor === null) return
    const anchorRow = Math.floor(anchor / document.columns)
    const anchorColumn = anchor % document.columns
    const targetRow = Math.floor(index / document.columns)
    const targetColumn = index % document.columns
    const indices: number[] = []
    for (let row = Math.min(anchorRow, targetRow); row <= Math.max(anchorRow, targetRow); row += 1) {
      for (let column = Math.min(anchorColumn, targetColumn); column <= Math.max(anchorColumn, targetColumn); column += 1) {
        indices.push(row * document.columns + column)
      }
    }
    setSelectedCells(new Set(indices))
  }

  const mergeSelection = () => {
    const next = mergeCells(document, selectedIndices)
    if (next === document) {
      flash(text('Для объединения выделите прямоугольную область', 'Select a rectangular area to merge'))
      return
    }
    commit(next)
  }

  const unmergeSelection = () => {
    commit((current) => unmergeCells(current, selectedIndices))
  }

  const mirrorSelection = (axis: 'x' | 'y') => {
    if (selectedIndices.length === 0) return
    commit((current) => mirrorCells(current, selectedIndices, axis))
  }

  const transformFreeSelection = (deltaX: number, deltaY: number, scaleFactor = 1) => {
    if (selectedIndices.length === 0) return
    commit((current) => updateCells(current, selectedIndices, (cell) => ({
      ...cell,
      offsetX: (cell.offsetX ?? 0) + deltaX,
      offsetY: (cell.offsetY ?? 0) + deltaY,
      scale: Math.max(0.25, Math.min(3, (cell.scale ?? 1) * scaleFactor)),
    })))
  }

  const cloneActiveBlock = () => {
    const source = patternById(activePattern, document.customPatterns)
    const next = cloneCustomPattern(document, activePattern)
    const clone = next.customPatterns?.at(-1)
    if (!clone) {
      commit(next)
      return
    }
    const localizedSourceName = patternName(source.id, source.name)
    const localizedCloneName = text(`${localizedSourceName} — копия`, `${localizedSourceName} — copy`)
    const localizedDocument = {
      ...next,
      customPatterns: next.customPatterns?.map((pattern) => pattern.id === clone.id
        ? { ...pattern, name: localizedCloneName }
        : pattern),
    }
    commit(localizedDocument)
    setActivePattern(clone.id)
    flash(text('Копия блока создана', 'Block copy created'))
  }

  const changeSelectedTrack = (action: 'insert-before' | 'insert-after' | 'remove' | 'resize') => {
    if (!selectedHeader) {
      flash(text('Сначала выберите заголовок ряда или столбца', 'Select a row or column header first'))
      return
    }
    const { kind, index } = selectedHeader
    if (action === 'resize') {
      const currentSize = kind === 'row'
        ? document.rowSizesCm?.[index] ?? document.blockSizeCm
        : document.columnSizesCm?.[index] ?? document.blockSizeCm
      const entered = window.prompt(
        text(`Новый размер, ${lengthUnit}`, `New size, ${lengthUnit}`),
        String(toDisplayLength(currentSize)),
      )
      if (entered === null) return
      const displaySize = Number(entered)
      const sizeCm = fromDisplayLength(displaySize)
      if (!Number.isFinite(sizeCm) || sizeCm < 0.5 || sizeCm > 200) {
        flash(text(
          `Введите размер от ${formatLength(0.5)} до ${formatLength(200)}`,
          `Enter a size from ${formatLength(0.5)} to ${formatLength(200)}`,
        ))
        return
      }
      commit((current) => kind === 'row' ? resizeRow(current, index, sizeCm) : resizeColumn(current, index, sizeCm))
      return
    }
    if (action === 'remove') {
      if ((kind === 'row' ? document.rows : document.columns) <= 1) {
        flash(text('Нельзя удалить последний ряд или столбец', 'The last row or column cannot be removed'))
        return
      }
      commit((current) => kind === 'row' ? removeRow(current, index) : removeColumn(current, index))
      setSelectedCells(new Set())
      setSelectedHeader(null)
      return
    }
    const insertionIndex = action === 'insert-before' ? index : index + 1
    commit((current) => kind === 'row' ? insertRow(current, insertionIndex) : insertColumn(current, insertionIndex))
    setSelectedHeader({ kind, index: action === 'insert-before' ? index + 1 : index })
  }

  const clearSelection = useCallback(() => {
    if (selectedIndices.length === 0) return
    commit((current) => updateCells(current, selectedIndices, () => ({ patternId: 'solid', rotation: 0 })))
  }, [commit, selectedIndices])

  const copySelection = useCallback(() => {
    const cell = document.cells[selectedIndices[0]]
    if (!cell) return
    copiedCell.current = { ...cell }
    flash(text('Блок скопирован', 'Block copied'))
  }, [document.cells, flash, selectedIndices, text])

  const pasteSelection = useCallback(() => {
    const cell = copiedCell.current
    if (!cell || selectedIndices.length === 0) return
    commit((current) => updateCells(current, selectedIndices, () => ({ ...cell })))
  }, [commit, selectedIndices])

  useEffect(() => {
    const stopPointerAction = () => {
      painting.current = false
      selectionAnchor.current = null
      panStart.current = null
    }
    window.addEventListener('pointerup', stopPointerAction)
    return () => window.removeEventListener('pointerup', stopPointerAction)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey
      const target = event.target as HTMLElement | null
      const editingText = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if (command && event.key.toLowerCase() === 'a' && !editingText) {
        event.preventDefault()
        setSelectedCells(new Set(document.cells.map((_, index) => index)))
        setTool('select')
      } else if (command && event.key.toLowerCase() === 'c' && !editingText) {
        event.preventDefault()
        copySelection()
      } else if (command && event.key.toLowerCase() === 'v' && !editingText) {
        event.preventDefault()
        pasteSelection()
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !editingText) {
        event.preventDefault()
        clearSelection()
      } else if (event.key === 'Escape') {
        setSelectedCells(new Set())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearSelection, copySelection, document.cells, pasteSelection])

  useEffect(() => {
    if (!autosave) return
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(LOCAL_DOCUMENT_KEY, JSON.stringify(document))
        setLastSavedAt(new Date())
        onSave?.(document)
      } catch {
        flash(text('Автосохранение не поместилось в хранилище', 'Autosave did not fit in local storage'))
      }
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [autosave, document, flash, onSave, text])

  const exportPng = async (showGrid = document.showGrid ?? true, maxDimension = 1800, suffix = '') => {
    const columnSizes = document.columnSizesCm ?? Array.from({ length: document.columns }, () => document.blockSizeCm)
    const rowSizes = document.rowSizesCm ?? Array.from({ length: document.rows }, () => document.blockSizeCm)
    const totalWidth = columnSizes.reduce((sum, size) => sum + size, 0)
    const totalHeight = rowSizes.reduce((sum, size) => sum + size, 0)
    const scale = maxDimension / Math.max(totalWidth, totalHeight)
    const xPositions = columnSizes.map((_, index) => columnSizes.slice(0, index).reduce((sum, size) => sum + size, 0) * scale)
    const yPositions = rowSizes.map((_, index) => rowSizes.slice(0, index).reduce((sum, size) => sum + size, 0) * scale)
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(totalWidth * scale))
    canvas.height = Math.max(1, Math.round(totalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return
    const fabricImages = await Promise.all((document.fabricFills ?? []).map((source) => new Promise<HTMLImageElement | null>((resolve) => {
      if (!source) {
        resolve(null)
        return
      }
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = source
    })))
    document.cells.forEach((cell, index) => {
      if (cell.mergedInto !== undefined) return
      const row = Math.floor(index / document.columns)
      const column = index % document.columns
      const merged = document.cells.flatMap((candidate, candidateIndex) => candidate.mergedInto === index ? [candidateIndex] : [])
      const endRow = Math.max(row, ...merged.map((candidateIndex) => Math.floor(candidateIndex / document.columns)))
      const endColumn = Math.max(column, ...merged.map((candidateIndex) => candidateIndex % document.columns))
      const width = columnSizes.slice(column, endColumn + 1).reduce((sum, size) => sum + size, 0) * scale
      const height = rowSizes.slice(row, endRow + 1).reduce((sum, size) => sum + size, 0) * scale
      drawPattern(context, cell, document.palette, fabricImages, document.fabricPlacements ?? [], document.customPatterns ?? [], xPositions[column], yPositions[row], width, height, showGrid)
    })
    const link = window.document.createElement('a')
    link.download = `${document.name.trim() || text('квилт', 'quilt')}${suffix}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    flash(text('PNG сохранён', 'PNG saved'))
  }

  const randomize = () => {
    commit((current) => ({
      ...current,
      cells: current.cells.map(() => ({
        patternId: PATTERNS[1 + Math.floor(Math.random() * (PATTERNS.length - 1))].id,
        rotation: (Math.floor(Math.random() * 4) * 90) as QuiltCell['rotation'],
      })),
    }))
  }

  const randomizeColors = () => {
    commit((current) => randomizeUnlockedPalette(current, RANDOM_COLORS))
  }

  const createOmbrePalette = () => {
    commit((current) => {
      const start = current.palette[0].replace('#', '')
      const end = current.palette.at(-1)?.replace('#', '') ?? start
      const startChannels = [0, 2, 4].map((offset) => Number.parseInt(start.slice(offset, offset + 2), 16))
      const endChannels = [0, 2, 4].map((offset) => Number.parseInt(end.slice(offset, offset + 2), 16))
      const locks = current.paletteLocks ?? current.palette.map(() => false)
      return {
        ...current,
        palette: current.palette.map((color, index) => {
          if (locks[index] || current.palette.length < 2) return color
          const progress = index / (current.palette.length - 1)
          const channels = startChannels.map((channel, channelIndex) => Math.round(channel + (endChannels[channelIndex] - channel) * progress))
          return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
        }),
      }
    })
  }

  const setPaletteColor = (index: number, color: string) => {
    commit((current) => ({
      ...current,
      palette: current.palette.map((value, paletteIndex) => paletteIndex === index ? color : value),
    }))
  }

  const extractPaletteFromImage = (file: File) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      const canvas = window.document.createElement('canvas')
      const size = 96
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      context.drawImage(image, 0, 0, size, size)
      const pixels = context.getImageData(0, 0, size, size).data
      const counts: Record<string, number> = {}
      for (let index = 0; index < pixels.length; index += 16) {
        if (pixels[index + 3] < 180) continue
        const red = Math.min(Math.round(pixels[index] / 32) * 32, 255)
        const green = Math.min(Math.round(pixels[index + 1] / 32) * 32, 255)
        const blue = Math.min(Math.round(pixels[index + 2] / 32) * 32, 255)
        const key = `${red},${green},${blue}`
        counts[key] = (counts[key] ?? 0) + 1
      }
      const colors = Object.entries(counts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, document.palette.length)
        .map(([key]) => `#${key.split(',').map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`)
      if (colors.length > 0) {
        commit((current) => ({
          ...current,
          palette: current.palette.map((color, index) => colors[index] ?? color),
        }))
        flash(text('Палитра извлечена из изображения', 'Palette extracted from image'))
      }
      URL.revokeObjectURL(objectUrl)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      flash(text('Не удалось прочитать изображение', 'Could not read the image'))
    }
    image.src = objectUrl
  }

  const setFabricFillFromImage = (paletteIndex: number, file: File) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      const maximum = 512
      const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
      commit((current) => {
        const fills = current.fabricFills ?? current.palette.map(() => null)
        return {
          ...current,
          fabricFills: fills.map((fill, index) => index === paletteIndex ? dataUrl : fill),
        }
      })
      URL.revokeObjectURL(objectUrl)
      setEditingFabricIndex(paletteIndex)
      flash(text('Ткань добавлена к цвету', 'Fabric added to the color'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      flash(text('Не удалось прочитать ткань', 'Could not read the fabric image'))
    }
    image.src = objectUrl
  }

  const updateFabricPlacement = (paletteIndex: number, patch: Partial<FabricPlacement>) => {
    commit((current) => {
      const placements = current.fabricPlacements ?? current.palette.map(() => ({ zoom: 1, positionX: 50, positionY: 50 }))
      return {
        ...current,
        fabricPlacements: placements.map((placement, index) => index === paletteIndex ? { ...placement, ...patch } : placement),
      }
    })
  }

  const duplicateFabricFragment = (sourceIndex: number) => {
    const targetIndex = (document.fabricFills ?? []).findIndex((fill, index) => index !== sourceIndex && !fill)
    if (targetIndex < 0) {
      flash(text('Для нового фрагмента нужен свободный цвет палитры', 'A free palette color is needed for a new fragment'))
      return
    }
    commit((current) => {
      const fills = current.fabricFills ?? current.palette.map(() => null)
      const placements = current.fabricPlacements ?? current.palette.map(() => ({ zoom: 1, positionX: 50, positionY: 50 }))
      const sourcePlacement = placements[sourceIndex] ?? { zoom: 1, positionX: 50, positionY: 50 }
      return {
        ...current,
        fabricFills: fills.map((fill, index) => index === targetIndex ? fills[sourceIndex] : fill),
        fabricPlacements: placements.map((placement, index) => index === targetIndex
          ? { ...sourcePlacement, positionX: Math.min(100, sourcePlacement.positionX + 20) }
          : placement),
      }
    })
    setEditingFabricIndex(targetIndex)
    flash(text(`Создан независимый фрагмент для цвета ${targetIndex + 1}`, `Independent fragment created for color ${targetIndex + 1}`))
  }

  const togglePaletteLock = (index: number) => {
    commit((current) => {
      const locks = current.paletteLocks ?? current.palette.map(() => false)
      return {
        ...current,
        paletteLocks: locks.map((locked, paletteIndex) => paletteIndex === index ? !locked : locked),
      }
    })
  }

  const saveCurrent = () => {
    try {
      window.localStorage.setItem(LOCAL_DOCUMENT_KEY, JSON.stringify(document))
      setLastSavedAt(new Date())
      onSave?.(document)
      flash(text('Проект сохранён локально', 'Project saved locally'))
    } catch {
      flash(text('Проект слишком большой для локального хранилища — экспортируйте файл', 'The project is too large for local storage — export it to a file'))
    }
  }

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
    const link = window.document.createElement('a')
    link.download = `${document.name.trim() || text('квилт', 'quilt')}.quilt.json`
    link.href = URL.createObjectURL(blob)
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
    flash(text('Файл проекта сохранён', 'Project file saved'))
  }

  const importProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<QuiltDocument>
      const valid = typeof parsed.name === 'string'
        && Number.isInteger(parsed.rows)
        && Number.isInteger(parsed.columns)
        && Array.isArray(parsed.palette)
        && Array.isArray(parsed.cells)
        && parsed.cells.length === Number(parsed.rows) * Number(parsed.columns)
      if (!valid) throw new Error('invalid document')
      dispatch({ type: 'reset', next: migrateDocument(parsed) })
      setSelectedCells(new Set())
      flash(text('Проект импортирован', 'Project imported'))
    } catch {
      flash(text('Не удалось прочитать проект', 'Could not read the project'))
    } finally {
      if (importInput.current) importInput.current.value = ''
    }
  }

  const onCellPointerDown = (index: number, event: React.PointerEvent) => {
    event.preventDefault()
    if (event.altKey || tool === 'eyedropper') {
      setActivePattern(document.cells[index].patternId)
      setTool('paint')
      flash(text('Образец выбран', 'Sample selected'))
      return
    }
    if (tool === 'paint') {
      painting.current = true
      applyPattern(index)
      setSelectedCells(new Set([index]))
      return
    }
    selectionAnchor.current = index
    setSelectedCells((current) => {
      if (!event.shiftKey) return new Set([index])
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label={text('Лоскут', 'Loskut')}>
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>{text('Лоскут', 'Loskut')}</span>
        </div>
        <input
          className="document-name"
          aria-label={text('Название проекта', 'Project name')}
          value={document.name}
          onChange={(event) => commit((current) => ({ ...current, name: event.target.value }))}
        />
        <div className="preference-switches">
          <div className="segmented-switch" role="group" aria-label={text('Язык', 'Language')}>
            <button type="button" aria-pressed={language === 'ru'} className={language === 'ru' ? 'active' : ''} onClick={() => setLanguage('ru')}>RU</button>
            <button type="button" aria-pressed={language === 'en'} className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
          <div className="segmented-switch" role="group" aria-label={text('Единицы измерения', 'Measurement units')}>
            <button type="button" aria-pressed={measurementSystem === 'metric'} className={measurementSystem === 'metric' ? 'active' : ''} onClick={() => setMeasurementSystem('metric')}>cm</button>
            <button type="button" aria-pressed={measurementSystem === 'imperial'} className={measurementSystem === 'imperial' ? 'active' : ''} onClick={() => setMeasurementSystem('imperial')}>in</button>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length} title={text('Отменить (⌘Z)', 'Undo (⌘Z)')}>↶</button>
          <button className="icon-button" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length} title={text('Повторить (⇧⌘Z)', 'Redo (⇧⌘Z)')}>↷</button>
          <button className="secondary-button" onClick={() => importInput.current?.click()}>{text('Импорт', 'Import')}</button>
          <button className="secondary-button" onClick={exportProject}>{text('Файл проекта', 'Project file')}</button>
          <button className="secondary-button" onClick={saveCurrent}>{text('Сохранить', 'Save')}</button>
          <button className="secondary-button" onClick={() => void exportPng(false, 360, text('-миниатюра', '-thumbnail'))}>{text('Миниатюра', 'Thumbnail')}</button>
          <button className="primary-button" onClick={() => exportPng()}><span>↓</span> {text('Скачать PNG', 'Download PNG')}</button>
          <input ref={importInput} className="visually-hidden" tabIndex={-1} aria-hidden="true" type="file" accept=".json,application/json" onChange={(event) => event.target.files?.[0] && void importProject(event.target.files[0])} />
          {lastSavedAt && <span className="save-status">{text('Сохранено', 'Saved')} {lastSavedAt.toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      </header>

      <section className={activePanel === 'calculator' ? 'workspace calculator-active' : 'workspace'}>
        <nav className="rail" aria-label={text('Разделы редактора', 'Editor sections')}>
          {(['blocks', 'colors', 'grid', 'calculator'] as const).map((panel) => (
            <button
              key={panel}
              className={activePanel === panel ? 'rail-button active' : 'rail-button'}
              onClick={() => setActivePanel(panel)}
            >
              <span className="rail-icon">{panel === 'blocks' ? '◆' : panel === 'colors' ? '●' : panel === 'grid' ? '▦' : '∑'}</span>
              {panel === 'blocks' ? text('Блоки', 'Blocks') : panel === 'colors' ? text('Цвета', 'Colors') : panel === 'grid' ? text('Размер', 'Size') : text('Расход', 'Fabric')}
            </button>
          ))}
        </nav>

        <aside className="side-panel">
          {activePanel === 'blocks' && (
            <>
              <div className="panel-heading">
                <div><p className="eyebrow">{text('Библиотека', 'Library')}</p><h1>{text('Блоки квилта', 'Quilt blocks')}</h1></div>
                <button className="mini-button" onClick={randomize} title={text('Случайный дизайн', 'Random design')}>✦</button>
              </div>
              <p className="panel-copy">{text('Выберите блок и рисуйте им прямо по макету.', 'Choose a block and paint it directly onto the layout.')}</p>
              <div className="pattern-categories" role="tablist" aria-label={text('Категории блоков', 'Block categories')}>
                {PATTERN_CATEGORIES.map((category) => (
                  <button key={category} role="tab" aria-selected={patternCategory === category} className={patternCategory === category ? 'active' : ''} onClick={() => setPatternCategory(category)}>
                    {category === 'all' ? text('Все', 'All') : category === 'basic' ? text('Базовые', 'Basic') : category === 'stars' ? text('Звёзды', 'Stars') : category === 'triangles' ? text('Треугольники', 'Triangles') : text('Классика', 'Classic')}
                  </button>
                ))}
              </div>
              <div className="pattern-grid">
                {visiblePatterns.map((pattern) => (
                  <button
                    key={pattern.id}
                    className={activePattern === pattern.id && tool === 'paint' ? 'pattern-card active' : 'pattern-card'}
                    onClick={() => choosePattern(pattern.id)}
                    aria-label={text(`Применить блок «${patternName(pattern.id, pattern.name)}» к выделенным ячейкам`, `Apply “${patternName(pattern.id, pattern.name)}” to selected cells`)}
                  >
                    <PatternPreview patternId={pattern.id} palette={document.palette} patterns={document.customPatterns} fabricFills={document.fabricFills} fabricPlacements={document.fabricPlacements} className="pattern-thumbnail" />
                    <span>{patternName(pattern.id, pattern.name)}</span>
                  </button>
                ))}
              </div>
              <div className="block-actions">
                <button onClick={() => setBlockEditor('new')}>＋ {text('Новый блок', 'New block')}</button>
                <button onClick={() => setBlockEditor(patternById(activePattern, document.customPatterns))}>✎ {text('Редактировать копию', 'Edit a copy')}</button>
                <button onClick={cloneActiveBlock}>⧉ {text('Клонировать', 'Clone')}</button>
                <button onClick={() => setPrintPattern(patternById(activePattern, document.customPatterns))}>⌘ {text('Шаблон печати', 'Print template')}</button>
              </div>
              <div className="tip"><b>{text('Совет', 'Tip')}</b><span>{text('Зажмите Alt и нажмите на блок, чтобы взять его как образец.', 'Hold Alt and click a block to sample it.')}</span></div>
            </>
          )}

          {activePanel === 'colors' && (
            <>
              <div className="panel-heading">
                <div><p className="eyebrow">{text('Глобальная палитра', 'Global palette')}</p><h1>{text('Цвета', 'Colors')}</h1></div>
                <button className="mini-button" onClick={randomizeColors} title={text('Новая палитра', 'New palette')}>✦</button>
              </div>
              <p className="panel-copy">{text('Изменение цвета сразу обновит весь макет.', 'Changing a color updates the entire layout immediately.')}</p>
              <div className="color-list">
                {document.palette.map((color, index) => {
                  const locked = document.paletteLocks?.[index] ?? false
                  const fabric = document.fabricFills?.[index]
                  const colorLabel = COLOR_NAMES[index]
                    ? text(COLOR_NAMES[index][0], COLOR_NAMES[index][1])
                    : text(`Цвет ${index + 1}`, `Color ${index + 1}`)
                  return (
                    <div className="color-row" key={index}>
                      <label className="color-picker-label">
                        <input type="color" value={color} onChange={(event) => setPaletteColor(index, event.target.value)} aria-label={text(`Выбрать ${colorLabel.toLowerCase()}`, `Choose ${colorLabel.toLowerCase()}`)} />
                        <span className="color-chip" style={{ backgroundColor: color, backgroundImage: fabric ? `url(${fabric})` : undefined }} />
                        <span><b>{colorLabel}</b><small>{fabric ? `${text('Ткань', 'Fabric')} · ` : ''}{color.toUpperCase()}</small></span>
                      </label>
                      <button className={fabric ? 'lock-button active' : 'lock-button'} onClick={() => {
                        if (fabric) {
                          setEditingFabricIndex(index)
                        } else {
                          fabricTarget.current = index
                          fabricImageInput.current?.click()
                        }
                      }} aria-label={fabric ? text(`Настроить фрагмент ткани ${index + 1}`, `Adjust fabric fragment ${index + 1}`) : text(`Добавить ткань ${index + 1}`, `Add fabric ${index + 1}`)}>▧</button>
                      <button className={locked ? 'lock-button active' : 'lock-button'} onClick={() => togglePaletteLock(index)} aria-label={locked ? text(`Разблокировать цвет ${index + 1}`, `Unlock color ${index + 1}`) : text(`Зафиксировать цвет ${index + 1}`, `Lock color ${index + 1}`)}>{locked ? '●' : '○'}</button>
                    </div>
                  )
                })}
              </div>
              {editingFabricIndex !== null && editingFabricSource && editingFabricPlacement && (
                <div className="fabric-crop-editor">
                  <div
                    className="fabric-crop-preview"
                    role="img"
                    aria-label={text(`Предпросмотр фрагмента ткани для цвета ${editingFabricIndex + 1}`, `Fabric fragment preview for color ${editingFabricIndex + 1}`)}
                    style={{
                      backgroundImage: `url(${editingFabricSource})`,
                      backgroundSize: `${editingFabricPlacement.zoom * 100}%`,
                      backgroundPosition: `${editingFabricPlacement.positionX}% ${editingFabricPlacement.positionY}%`,
                    }}
                  />
                  <div className="fabric-crop-heading">
                    <b>{text(`Фрагмент для цвета ${editingFabricIndex + 1}`, `Fragment for color ${editingFabricIndex + 1}`)}</b>
                    <button onClick={() => setEditingFabricIndex(null)} aria-label={text('Закрыть настройку фрагмента', 'Close fragment settings')}>×</button>
                  </div>
                  <label>{text('Масштаб', 'Scale')}
                    <input type="range" min="1" max="4" step="0.05" value={editingFabricPlacement.zoom} onChange={(event) => updateFabricPlacement(editingFabricIndex, { zoom: Number(event.target.value) })} />
                  </label>
                  <label>{text('По горизонтали', 'Horizontal')}
                    <input type="range" min="0" max="100" value={editingFabricPlacement.positionX} onChange={(event) => updateFabricPlacement(editingFabricIndex, { positionX: Number(event.target.value) })} />
                  </label>
                  <label>{text('По вертикали', 'Vertical')}
                    <input type="range" min="0" max="100" value={editingFabricPlacement.positionY} onChange={(event) => updateFabricPlacement(editingFabricIndex, { positionY: Number(event.target.value) })} />
                  </label>
                  <div className="fabric-crop-actions">
                    <button onClick={() => duplicateFabricFragment(editingFabricIndex)}>＋ {text('Другой кусочек этой ткани', 'Another piece of this fabric')}</button>
                    <button onClick={() => {
                      commit((current) => ({
                        ...current,
                        fabricFills: (current.fabricFills ?? []).map((fill, index) => index === editingFabricIndex ? null : fill),
                      }))
                      setEditingFabricIndex(null)
                    }}>{text('Удалить ткань', 'Remove fabric')}</button>
                  </div>
                </div>
              )}
              <button className="wide-secondary" onClick={randomizeColors}>✦ {text('Создать новую палитру', 'Create a new palette')}</button>
              <button className="wide-secondary" onClick={createOmbrePalette}>◒ {text('Омбре между крайними цветами', 'Ombre between edge colors')}</button>
              <button className="wide-secondary" onClick={() => paletteImageInput.current?.click()}>▧ {text('Палитра из изображения', 'Palette from image')}</button>
              <input ref={paletteImageInput} className="visually-hidden" tabIndex={-1} aria-hidden="true" type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) extractPaletteFromImage(file)
                event.target.value = ''
              }} />
              <input ref={fabricImageInput} className="visually-hidden" tabIndex={-1} aria-hidden="true" type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) setFabricFillFromImage(fabricTarget.current, file)
                event.target.value = ''
              }} />
            </>
          )}

          {activePanel === 'grid' && (
            <>
              <div className="panel-heading"><div><p className="eyebrow">{text('Параметры', 'Settings')}</p><h1>{text('Макет квилта', 'Quilt layout')}</h1></div></div>
              <label className="select-field">{text('Тип сетки', 'Grid type')}
                <select value={document.gridType ?? 'rectangle'} onChange={(event) => commit((current) => ({ ...current, gridType: event.target.value as QuiltDocument['gridType'] }))}>
                  <option value="rectangle">{text('Прямоугольная', 'Rectangular')}</option>
                  <option value="on-point">{text('По диагонали', 'On point')}</option>
                  <option value="triangle">{text('Треугольная', 'Triangular')}</option>
                  <option value="free">{text('Свободное размещение', 'Free placement')}</option>
                </select>
              </label>
              <div className="field-grid">
                <label>{text('Столбцы', 'Columns')}<input type="number" min="1" max="50" value={document.columns} onChange={(event) => commit((current) => resizeDocument(current, current.rows, Number(event.target.value)))} /></label>
                <label>{text('Ряды', 'Rows')}<input type="number" min="1" max="50" value={document.rows} onChange={(event) => commit((current) => resizeDocument(current, Number(event.target.value), current.columns))} /></label>
                <label>{text('Блок', 'Block')}, {lengthUnit}<input type="number" min={toDisplayLength(0.5)} max={toDisplayLength(200)} step={measurementSystem === 'metric' ? 0.5 : 0.25} value={toDisplayLength(document.blockSizeCm)} onChange={(event) => {
                  const blockSizeCm = Math.min(200, Math.max(0.5, fromDisplayLength(Number(event.target.value))))
                  commit((current) => ({
                    ...current,
                    blockSizeCm,
                    rowSizesCm: current.rowSizesCm?.map(() => blockSizeCm),
                    columnSizesCm: current.columnSizesCm?.map(() => blockSizeCm),
                  }))
                }} /></label>
                <label>{text('Припуск', 'Seam allowance')}, {lengthUnit}<input type="number" min="0" max={toDisplayLength(3)} step={measurementSystem === 'metric' ? 0.1 : 0.125} value={toDisplayLength(document.seamAllowanceCm)} onChange={(event) => commit((current) => ({ ...current, seamAllowanceCm: Math.min(3, Math.max(0, fromDisplayLength(Number(event.target.value)))) }))} /></label>
                <label>{text('Ширина ткани', 'Fabric width')}, {lengthUnit}<input type="number" min={toDisplayLength(40)} max={toDisplayLength(300)} step={measurementSystem === 'metric' ? 1 : 0.25} value={toDisplayLength(document.fabricWidthCm ?? 110)} onChange={(event) => commit((current) => ({ ...current, fabricWidthCm: Math.min(300, Math.max(40, fromDisplayLength(Number(event.target.value)))) }))} /></label>
                <label>{text('Запас изнанки', 'Backing extra')}, {lengthUnit}<input type="number" min="0" max={toDisplayLength(100)} step={measurementSystem === 'metric' ? 1 : 0.25} value={toDisplayLength(document.backingExtraCm ?? 10)} onChange={(event) => commit((current) => ({ ...current, backingExtraCm: Math.min(100, Math.max(0, fromDisplayLength(Number(event.target.value)))) }))} /></label>
                <label>{text('Окантовка', 'Binding width')}, {lengthUnit}<input type="number" min={toDisplayLength(1)} max={toDisplayLength(30)} step={measurementSystem === 'metric' ? 0.1 : 0.125} value={toDisplayLength(document.bindingWidthCm ?? 6.35)} onChange={(event) => commit((current) => ({ ...current, bindingWidthCm: Math.min(30, Math.max(1, fromDisplayLength(Number(event.target.value)))) }))} /></label>
              </div>
              <div className="track-actions">
                <span>{selectedHeader
                  ? `${selectedHeader.kind === 'row' ? text('Ряд', 'Row') : text('Столбец', 'Column')} ${selectedHeader.index + 1}`
                  : text('Выберите номер у холста', 'Select a number beside the canvas')}</span>
                <button onClick={() => changeSelectedTrack('resize')}>{text('Размер', 'Size')}</button>
                <button onClick={() => changeSelectedTrack('insert-before')}>＋ {text('До', 'Before')}</button>
                <button onClick={() => changeSelectedTrack('insert-after')}>＋ {text('После', 'After')}</button>
                <button onClick={() => changeSelectedTrack('remove')}>{text('Удалить', 'Remove')}</button>
              </div>
              <label className="toggle-row">
                <input type="checkbox" checked={document.showGrid ?? true} onChange={(event) => commit((current) => ({ ...current, showGrid: event.target.checked }))} />
                {text('Показывать линии сетки', 'Show grid lines')}
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={autosave} onChange={(event) => {
                  setAutosave(event.target.checked)
                  window.localStorage.setItem(AUTOSAVE_KEY, String(event.target.checked))
                }} />
                {text('Автосохранение', 'Autosave')}
              </label>
              <label className="notes-field">{text('Заметки', 'Notes')}
                <textarea value={document.notes ?? ''} onChange={(event) => commit((current) => ({ ...current, notes: event.target.value }))} placeholder={text('Материалы, сборка, идеи…', 'Materials, assembly, ideas…')} />
              </label>
              <div className="estimate-card">
                <p>{text('Готовый размер', 'Finished size')}</p><strong>{formatLength(estimate.finishedWidthCm)} × {formatLength(estimate.finishedHeightCm)}</strong>
                <div><span>{estimate.blocks} {text('блоков', 'blocks')}</span><span>≈ {formatFabricLength(estimate.fabricMeters)} {text('ткани', 'of fabric')}*</span></div>
              </div>
              <p className="fine-print">{text('* Быстрая оценка. Подробный раскрой — во вкладке «Расход».', '* Quick estimate. See the Fabric tab for detailed cutting instructions.')}</p>
              <button className="danger-link" onClick={() => {
                if (!window.confirm(text('Сбросить весь квилт? Это действие можно отменить только до перезагрузки.', 'Reset the entire quilt? This can only be undone before reloading.'))) return
                const next = createDocument()
                dispatch({ type: 'reset', next })
                setSelectedCells(new Set([0]))
              }}>{text('Начать заново', 'Start over')}</button>
            </>
          )}

          {activePanel === 'calculator' && <FabricCalculatorPanel document={document} />}
        </aside>

        <section className="stage">
          <div className="context-toolbar">
            <button className={tool === 'eyedropper' ? 'tool-button active' : 'tool-button'} onClick={() => setTool('eyedropper')} title={text('Пипетка: взять блок с холста', 'Eyedropper: sample a block from the canvas')}>◉</button>
            <button className={tool === 'select' ? 'tool-button active' : 'tool-button'} onClick={() => setTool('select')} title={text('Выделение', 'Selection')}>↖ <span>{text('Выбрать', 'Select')}</span></button>
            <button className={tool === 'pan' ? 'tool-button active' : 'tool-button'} onClick={() => setTool('pan')} title={text('Перемещать холст', 'Pan canvas')}>✋</button>
            <button className="tool-button" onClick={() => selectPreset('odd')} title={text('Шахматное выделение', 'Checkerboard selection')}>▦</button>
            <button className="tool-button" onClick={() => selectPreset('even')} title={text('Обратное шахматное выделение', 'Inverse checkerboard selection')}>▧</button>
            <button className="tool-button" onClick={() => selectPreset('border')} title={text('Выделить край', 'Select border')}>□</button>
            <button className="tool-button" onClick={() => selectPreset('diagonal')} title={text('Выделить диагональ', 'Select diagonal')}>╱</button>
            <button className="tool-button" onClick={() => selectPreset('clear')} title={text('Снять выделение', 'Clear selection')}>×</button>
            <span className="toolbar-divider" />
            <button className="tool-button" disabled={!selectedIndices.length} onClick={rotateSelectionLeft} title={text('Повернуть влево', 'Rotate left')}>↺</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={rotateSelection} title={text('Повернуть вправо', 'Rotate right')}>↻</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={randomizeSelectionRotation} title={text('Случайный поворот', 'Random rotation')}>⤨</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={resetSelectionRotation} title={text('Сбросить поворот', 'Reset rotation')}>0°</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={() => mirrorSelection('x')} title={text('Отразить горизонтально', 'Flip horizontally')}>↔</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={() => mirrorSelection('y')} title={text('Отразить вертикально', 'Flip vertically')}>↕</button>
            <button className="tool-button" disabled={selectedIndices.length < 2} onClick={mergeSelection} title={text('Объединить ячейки', 'Merge cells')}>⊞</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={unmergeSelection} title={text('Разъединить ячейки', 'Unmerge cells')}>⊟</button>
            {document.gridType === 'free' && (
              <>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(-10, 0)} title={text('Сдвинуть влево', 'Move left')}>←</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(10, 0)} title={text('Сдвинуть вправо', 'Move right')}>→</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(0, -10)} title={text('Сдвинуть вверх', 'Move up')}>↑</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(0, 10)} title={text('Сдвинуть вниз', 'Move down')}>↓</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(0, 0, 0.9)} title={text('Уменьшить блок', 'Shrink block')}>−□</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(0, 0, 1.1)} title={text('Увеличить блок', 'Enlarge block')}>＋□</button>
              </>
            )}
            <button className="tool-button" disabled={!selectedIndices.length} onClick={copySelection} title={text('Копировать', 'Copy')}>⧉</button>
            <button className="tool-button" disabled={!selectedIndices.length || !copiedCell.current} onClick={pasteSelection} title={text('Вставить', 'Paste')}>▣</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={clearSelection} title={text('Очистить', 'Clear')}>⌫</button>
            <span className="toolbar-divider" />
            <button className="tool-button" onClick={() => selectPreset('all')}>{text('Всё', 'All')}</button>
            <div className="zoom-control">
              <button onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))} aria-label={text('Уменьшить', 'Zoom out')}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} aria-label={text('Увеличить', 'Zoom in')}>+</button>
            </div>
          </div>

          <div
            className={tool === 'pan' ? 'canvas-scroll panning' : 'canvas-scroll'}
            onPointerDown={(event) => {
              if (tool !== 'pan' || event.target !== event.currentTarget) return
              panStart.current = { x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y }
            }}
            onPointerMove={(event) => {
              const start = panStart.current
              if (!start) return
              setPan({ x: start.originX + event.clientX - start.x, y: start.originY + event.clientY - start.y })
            }}
          >
            <div className="canvas-wrap" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
              <div className="quilt-shadow">
                <div className="artboard-grid">
                  <button className="grid-corner" onClick={() => selectPreset('all')} title={text('Выбрать всё', 'Select all')}>∞</button>
                  <div className="column-headers" style={{ gridTemplateColumns: `repeat(${document.columns}, 1fr)` }}>
                    {Array.from({ length: document.columns }, (_, column) => (
                      <button key={column} onClick={() => selectColumn(column)} aria-label={text(`Выбрать столбец ${column + 1}`, `Select column ${column + 1}`)}>{column + 1}</button>
                    ))}
                  </div>
                  <div className="row-headers" style={{ gridTemplateRows: `repeat(${document.rows}, 1fr)` }}>
                    {Array.from({ length: document.rows }, (_, row) => (
                      <button key={row} onClick={() => selectRow(row)} aria-label={text(`Выбрать ряд ${row + 1}`, `Select row ${row + 1}`)}>{row + 1}</button>
                    ))}
                  </div>
                  <div
                    className={`${tool === 'paint' ? 'quilt-grid painting' : 'quilt-grid'}${document.showGrid === false ? ' hide-grid' : ''} grid-${document.gridType ?? 'rectangle'}`}
                    style={{
                      gridTemplateColumns: (document.columnSizesCm ?? Array.from({ length: document.columns }, () => document.blockSizeCm)).map((size) => `${size}fr`).join(' '),
                      gridTemplateRows: (document.rowSizesCm ?? Array.from({ length: document.rows }, () => document.blockSizeCm)).map((size) => `${size}fr`).join(' '),
                      aspectRatio: `${estimate.finishedWidthCm} / ${estimate.finishedHeightCm}`,
                    }}
                    aria-label={text(`Макет ${document.columns} на ${document.rows}`, `${document.columns} by ${document.rows} layout`)}
                  >
                    {document.cells.flatMap((cell, index) => {
                      if (cell.mergedInto !== undefined) return []
                      const row = Math.floor(index / document.columns)
                      const column = index % document.columns
                      const merged = document.cells.flatMap((candidate, candidateIndex) => candidate.mergedInto === index ? [candidateIndex] : [])
                      const endRow = Math.max(row, ...merged.map((candidateIndex) => Math.floor(candidateIndex / document.columns)))
                      const endColumn = Math.max(column, ...merged.map((candidateIndex) => candidateIndex % document.columns))
                      return [(
                        <button
                          className={`${selectedCells.has(index) ? 'quilt-cell selected' : 'quilt-cell'}${merged.length ? ' merged' : ''}`}
                          key={index}
                          style={{
                            gridRow: `${row + 1} / span ${endRow - row + 1}`,
                            gridColumn: `${column + 1} / span ${endColumn - column + 1}`,
                            transform: document.gridType === 'free' ? `translate(${cell.offsetX ?? 0}%, ${cell.offsetY ?? 0}%) scale(${cell.scale ?? 1})` : undefined,
                          }}
                          onPointerDown={(event) => onCellPointerDown(index, event)}
                          onPointerEnter={() => {
                            if (painting.current && tool === 'paint') applyPattern(index)
                            if (selectionAnchor.current !== null && tool === 'select') dragSelectionTo(index)
                          }}
                          aria-label={text(
                            `Блок ${index + 1}: ${patternName(cell.patternId, patternById(cell.patternId, document.customPatterns).name)}`,
                            `Block ${index + 1}: ${patternName(cell.patternId, patternById(cell.patternId, document.customPatterns).name)}`,
                          )}
                        >
                          <PatternPreview cell={cell} palette={document.palette} patterns={document.customPatterns} fabricFills={document.fabricFills} fabricPlacements={document.fabricPlacements} />
                        </button>
                      )]
                    })}
                  </div>
                </div>
              </div>
              <p className="canvas-caption">{document.name} · {formatLength(estimate.finishedWidthCm)} × {formatLength(estimate.finishedHeightCm)}</p>
            </div>
          </div>
        </section>
      </section>
      {blockEditor && (
        <BlockEditorModal
          pattern={blockEditor === 'new' ? undefined : blockEditor}
          palette={document.palette}
          onClose={() => setBlockEditor(null)}
          onSave={(pattern, palette) => {
            commit((current) => ({
              ...current,
              palette,
              paletteLocks: palette.map((_, index) => current.paletteLocks?.[index] ?? false),
              fabricFills: palette.map((_, index) => current.fabricFills?.[index] ?? null),
              fabricPlacements: palette.map((_, index) => current.fabricPlacements?.[index] ?? {
                zoom: 1,
                positionX: 50,
                positionY: 50,
              }),
              customPatterns: [...(current.customPatterns ?? []).filter((candidate) => candidate.id !== pattern.id), pattern],
            }))
            setActivePattern(pattern.id)
            setTool('paint')
            setBlockEditor(null)
            onSaveBlock?.(pattern.name, pattern.id)
            flash(text('Блок сохранён', 'Block saved'))
          }}
        />
      )}
      {printPattern && (
        <PrintBlockModal
          pattern={printPattern}
          palette={document.palette}
          blockSizeCm={document.blockSizeCm}
          onClose={() => setPrintPattern(null)}
        />
      )}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  )
}
