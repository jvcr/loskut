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

type PanelId = 'blocks' | 'colors' | 'grid' | 'calculator'
type PatternCategory = 'Все' | 'Базовые' | 'Звёзды' | 'Треугольники' | 'Классика'
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

const PANEL_LABELS: Record<PanelId, string> = {
  blocks: 'Блоки',
  colors: 'Цвета',
  grid: 'Размер',
  calculator: 'Расход',
}

const COLOR_NAMES = ['Фон', 'Акцент', 'Контраст', 'Дополнительный']
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
  const [history, dispatch] = useReducer(historyReducer, initialDocument, (document) => ({
    past: [],
    present: loadLocalDocument(document),
    future: [],
  }))
  const [patternCategory, setPatternCategory] = useState<PatternCategory>('Все')
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
  const visiblePatterns = useMemo(() => patternCategory === 'Все'
    ? patterns
    : patterns.filter((pattern) => (PATTERN_CATEGORY_BY_ID[pattern.id] ?? 'Базовые') === patternCategory),
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
      flash('Для объединения выделите прямоугольную область')
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
    const next = cloneCustomPattern(document, activePattern)
    const clone = next.customPatterns?.at(-1)
    commit(next)
    if (clone) {
      setActivePattern(clone.id)
      flash('Копия блока создана')
    }
  }

  const changeSelectedTrack = (action: 'insert-before' | 'insert-after' | 'remove' | 'resize') => {
    if (!selectedHeader) {
      flash('Сначала выберите заголовок ряда или столбца')
      return
    }
    const { kind, index } = selectedHeader
    if (action === 'resize') {
      const currentSize = kind === 'row'
        ? document.rowSizesCm?.[index] ?? document.blockSizeCm
        : document.columnSizesCm?.[index] ?? document.blockSizeCm
      const entered = window.prompt('Новый размер, см', String(currentSize))
      if (entered === null) return
      const size = Number(entered)
      if (!Number.isFinite(size) || size < 0.5 || size > 200) {
        flash('Введите размер от 0,5 до 200 см')
        return
      }
      commit((current) => kind === 'row' ? resizeRow(current, index, size) : resizeColumn(current, index, size))
      return
    }
    if (action === 'remove') {
      if ((kind === 'row' ? document.rows : document.columns) <= 1) {
        flash('Нельзя удалить последний ряд или столбец')
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
    flash('Блок скопирован')
  }, [document.cells, flash, selectedIndices])

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
        flash('Автосохранение не поместилось в хранилище')
      }
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [autosave, document, flash, onSave])

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
    link.download = `${document.name.trim() || 'квилт'}${suffix}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    flash('PNG сохранён')
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
        flash('Палитра извлечена из изображения')
      }
      URL.revokeObjectURL(objectUrl)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      flash('Не удалось прочитать изображение')
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
      flash('Ткань добавлена к цвету')
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      flash('Не удалось прочитать ткань')
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
      flash('Для нового фрагмента нужен свободный цвет палитры')
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
    flash(`Создан независимый фрагмент для цвета ${targetIndex + 1}`)
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
      flash('Проект сохранён локально')
    } catch {
      flash('Проект слишком большой для локального хранилища — экспортируйте файл')
    }
  }

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
    const link = window.document.createElement('a')
    link.download = `${document.name.trim() || 'квилт'}.quilt.json`
    link.href = URL.createObjectURL(blob)
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
    flash('Файл проекта сохранён')
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
      flash('Проект импортирован')
    } catch {
      flash('Не удалось прочитать проект')
    } finally {
      if (importInput.current) importInput.current.value = ''
    }
  }

  const onCellPointerDown = (index: number, event: React.PointerEvent) => {
    event.preventDefault()
    if (event.altKey || tool === 'eyedropper') {
      setActivePattern(document.cells[index].patternId)
      setTool('paint')
      flash('Образец выбран')
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
        <div className="brand" aria-label="Лоскут">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>Лоскут</span>
        </div>
        <input
          className="document-name"
          aria-label="Название проекта"
          value={document.name}
          onChange={(event) => commit((current) => ({ ...current, name: event.target.value }))}
        />
        <div className="topbar-actions">
          <button className="icon-button" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length} title="Отменить (⌘Z)">↶</button>
          <button className="icon-button" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length} title="Повторить (⇧⌘Z)">↷</button>
          <button className="secondary-button" onClick={() => importInput.current?.click()}>Импорт</button>
          <button className="secondary-button" onClick={exportProject}>Файл проекта</button>
          <button className="secondary-button" onClick={saveCurrent}>Сохранить</button>
          <button className="secondary-button" onClick={() => void exportPng(false, 360, '-thumbnail')}>Миниатюра</button>
          <button className="primary-button" onClick={() => exportPng()}><span>↓</span> Скачать PNG</button>
          <input ref={importInput} className="visually-hidden" tabIndex={-1} aria-hidden="true" type="file" accept=".json,application/json" onChange={(event) => event.target.files?.[0] && void importProject(event.target.files[0])} />
          {lastSavedAt && <span className="save-status">Сохранено {lastSavedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      </header>

      <section className={activePanel === 'calculator' ? 'workspace calculator-active' : 'workspace'}>
        <nav className="rail" aria-label="Разделы редактора">
          {(['blocks', 'colors', 'grid', 'calculator'] as const).map((panel) => (
            <button
              key={panel}
              className={activePanel === panel ? 'rail-button active' : 'rail-button'}
              onClick={() => setActivePanel(panel)}
            >
              <span className="rail-icon">{panel === 'blocks' ? '◆' : panel === 'colors' ? '●' : panel === 'grid' ? '▦' : '∑'}</span>
              {PANEL_LABELS[panel]}
            </button>
          ))}
        </nav>

        <aside className="side-panel">
          {activePanel === 'blocks' && (
            <>
              <div className="panel-heading">
                <div><p className="eyebrow">Библиотека</p><h1>Блоки квилта</h1></div>
                <button className="mini-button" onClick={randomize} title="Случайный дизайн">✦</button>
              </div>
              <p className="panel-copy">Выберите блок и рисуйте им прямо по макету.</p>
              <div className="pattern-categories" role="tablist" aria-label="Категории блоков">
                {(['Все', 'Базовые', 'Звёзды', 'Треугольники', 'Классика'] as const).map((category) => (
                  <button key={category} role="tab" aria-selected={patternCategory === category} className={patternCategory === category ? 'active' : ''} onClick={() => setPatternCategory(category)}>{category}</button>
                ))}
              </div>
              <div className="pattern-grid">
                {visiblePatterns.map((pattern) => (
                  <button
                    key={pattern.id}
                    className={activePattern === pattern.id && tool === 'paint' ? 'pattern-card active' : 'pattern-card'}
                    onClick={() => { setActivePattern(pattern.id); setTool('paint') }}
                  >
                    <PatternPreview patternId={pattern.id} palette={document.palette} patterns={document.customPatterns} fabricFills={document.fabricFills} fabricPlacements={document.fabricPlacements} className="pattern-thumbnail" />
                    <span>{pattern.name}</span>
                  </button>
                ))}
              </div>
              <div className="block-actions">
                <button onClick={() => setBlockEditor('new')}>＋ Новый блок</button>
                <button onClick={() => setBlockEditor(patternById(activePattern, document.customPatterns))}>✎ Редактировать копию</button>
                <button onClick={cloneActiveBlock}>⧉ Клонировать</button>
                <button onClick={() => setPrintPattern(patternById(activePattern, document.customPatterns))}>⌘ Шаблон печати</button>
              </div>
              <div className="tip"><b>Совет</b><span>Зажмите Alt и нажмите на блок, чтобы взять его как образец.</span></div>
            </>
          )}

          {activePanel === 'colors' && (
            <>
              <div className="panel-heading">
                <div><p className="eyebrow">Глобальная палитра</p><h1>Цвета</h1></div>
                <button className="mini-button" onClick={randomizeColors} title="Новая палитра">✦</button>
              </div>
              <p className="panel-copy">Изменение цвета сразу обновит весь макет.</p>
              <div className="color-list">
                {document.palette.map((color, index) => {
                  const locked = document.paletteLocks?.[index] ?? false
                  const fabric = document.fabricFills?.[index]
                  return (
                    <div className="color-row" key={index}>
                      <label className="color-picker-label">
                        <input type="color" value={color} onChange={(event) => setPaletteColor(index, event.target.value)} />
                        <span className="color-chip" style={{ backgroundColor: color, backgroundImage: fabric ? `url(${fabric})` : undefined }} />
                        <span><b>{COLOR_NAMES[index] ?? `Цвет ${index + 1}`}</b><small>{fabric ? 'Ткань · ' : ''}{color.toUpperCase()}</small></span>
                      </label>
                      <button className={fabric ? 'lock-button active' : 'lock-button'} onClick={() => {
                        if (fabric) {
                          setEditingFabricIndex(index)
                        } else {
                          fabricTarget.current = index
                          fabricImageInput.current?.click()
                        }
                      }} aria-label={fabric ? `Настроить фрагмент ткани ${index + 1}` : `Добавить ткань ${index + 1}`}>▧</button>
                      <button className={locked ? 'lock-button active' : 'lock-button'} onClick={() => togglePaletteLock(index)} aria-label={locked ? `Разблокировать цвет ${index + 1}` : `Зафиксировать цвет ${index + 1}`}>{locked ? '●' : '○'}</button>
                    </div>
                  )
                })}
              </div>
              {editingFabricIndex !== null && editingFabricSource && editingFabricPlacement && (
                <div className="fabric-crop-editor">
                  <div
                    className="fabric-crop-preview"
                    style={{
                      backgroundImage: `url(${editingFabricSource})`,
                      backgroundSize: `${editingFabricPlacement.zoom * 100}%`,
                      backgroundPosition: `${editingFabricPlacement.positionX}% ${editingFabricPlacement.positionY}%`,
                    }}
                  />
                  <div className="fabric-crop-heading">
                    <b>Фрагмент для цвета {editingFabricIndex + 1}</b>
                    <button onClick={() => setEditingFabricIndex(null)} aria-label="Закрыть настройку фрагмента">×</button>
                  </div>
                  <label>Масштаб
                    <input type="range" min="1" max="4" step="0.05" value={editingFabricPlacement.zoom} onChange={(event) => updateFabricPlacement(editingFabricIndex, { zoom: Number(event.target.value) })} />
                  </label>
                  <label>По горизонтали
                    <input type="range" min="0" max="100" value={editingFabricPlacement.positionX} onChange={(event) => updateFabricPlacement(editingFabricIndex, { positionX: Number(event.target.value) })} />
                  </label>
                  <label>По вертикали
                    <input type="range" min="0" max="100" value={editingFabricPlacement.positionY} onChange={(event) => updateFabricPlacement(editingFabricIndex, { positionY: Number(event.target.value) })} />
                  </label>
                  <div className="fabric-crop-actions">
                    <button onClick={() => duplicateFabricFragment(editingFabricIndex)}>＋ Другой кусочек этой ткани</button>
                    <button onClick={() => {
                      commit((current) => ({
                        ...current,
                        fabricFills: (current.fabricFills ?? []).map((fill, index) => index === editingFabricIndex ? null : fill),
                      }))
                      setEditingFabricIndex(null)
                    }}>Удалить ткань</button>
                  </div>
                </div>
              )}
              <button className="wide-secondary" onClick={randomizeColors}>✦ Создать новую палитру</button>
              <button className="wide-secondary" onClick={createOmbrePalette}>◒ Омбре между крайними цветами</button>
              <button className="wide-secondary" onClick={() => paletteImageInput.current?.click()}>▧ Палитра из изображения</button>
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
              <div className="panel-heading"><div><p className="eyebrow">Параметры</p><h1>Макет квилта</h1></div></div>
              <label className="select-field">Тип сетки
                <select value={document.gridType ?? 'rectangle'} onChange={(event) => commit((current) => ({ ...current, gridType: event.target.value as QuiltDocument['gridType'] }))}>
                  <option value="rectangle">Прямоугольная</option>
                  <option value="on-point">По диагонали</option>
                  <option value="triangle">Треугольная</option>
                  <option value="free">Свободное размещение</option>
                </select>
              </label>
              <div className="field-grid">
                <label>Столбцы<input type="number" min="1" max="50" value={document.columns} onChange={(event) => commit((current) => resizeDocument(current, current.rows, Number(event.target.value)))} /></label>
                <label>Ряды<input type="number" min="1" max="50" value={document.rows} onChange={(event) => commit((current) => resizeDocument(current, Number(event.target.value), current.columns))} /></label>
                <label>Блок, см<input type="number" min="0.5" max="200" step="0.5" value={document.blockSizeCm} onChange={(event) => {
                  const blockSizeCm = Math.max(0.5, Number(event.target.value))
                  commit((current) => ({
                    ...current,
                    blockSizeCm,
                    rowSizesCm: current.rowSizesCm?.map(() => blockSizeCm),
                    columnSizesCm: current.columnSizesCm?.map(() => blockSizeCm),
                  }))
                }} /></label>
                <label>Припуск, см<input type="number" min="0" max="3" step="0.1" value={document.seamAllowanceCm} onChange={(event) => commit((current) => ({ ...current, seamAllowanceCm: Math.max(0, Number(event.target.value)) }))} /></label>
                <label>Ширина ткани, см<input type="number" min="40" max="300" value={document.fabricWidthCm ?? 110} onChange={(event) => commit((current) => ({ ...current, fabricWidthCm: Math.max(40, Number(event.target.value)) }))} /></label>
                <label>Запас изнанки, см<input type="number" min="0" max="100" value={document.backingExtraCm ?? 10} onChange={(event) => commit((current) => ({ ...current, backingExtraCm: Math.max(0, Number(event.target.value)) }))} /></label>
                <label>Окантовка, см<input type="number" min="1" max="30" step="0.1" value={document.bindingWidthCm ?? 6.35} onChange={(event) => commit((current) => ({ ...current, bindingWidthCm: Math.max(1, Number(event.target.value)) }))} /></label>
              </div>
              <div className="track-actions">
                <span>{selectedHeader ? `${selectedHeader.kind === 'row' ? 'Ряд' : 'Столбец'} ${selectedHeader.index + 1}` : 'Выберите номер у холста'}</span>
                <button onClick={() => changeSelectedTrack('resize')}>Размер</button>
                <button onClick={() => changeSelectedTrack('insert-before')}>＋ До</button>
                <button onClick={() => changeSelectedTrack('insert-after')}>＋ После</button>
                <button onClick={() => changeSelectedTrack('remove')}>Удалить</button>
              </div>
              <label className="toggle-row">
                <input type="checkbox" checked={document.showGrid ?? true} onChange={(event) => commit((current) => ({ ...current, showGrid: event.target.checked }))} />
                Показывать линии сетки
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={autosave} onChange={(event) => {
                  setAutosave(event.target.checked)
                  window.localStorage.setItem(AUTOSAVE_KEY, String(event.target.checked))
                }} />
                Автосохранение
              </label>
              <label className="notes-field">Заметки
                <textarea value={document.notes ?? ''} onChange={(event) => commit((current) => ({ ...current, notes: event.target.value }))} placeholder="Материалы, сборка, идеи…" />
              </label>
              <div className="estimate-card">
                <p>Готовый размер</p><strong>{estimate.finishedWidthCm.toLocaleString('ru-RU')} × {estimate.finishedHeightCm.toLocaleString('ru-RU')} см</strong>
                <div><span>{estimate.blocks} блоков</span><span>≈ {estimate.fabricMeters.toLocaleString('ru-RU')} м ткани*</span></div>
              </div>
              <p className="fine-print">* Быстрая оценка. Подробный раскрой — во вкладке «Расход».</p>
              <button className="danger-link" onClick={() => {
                if (!window.confirm('Сбросить весь квилт? Это действие можно отменить только до перезагрузки.')) return
                const next = createDocument()
                dispatch({ type: 'reset', next })
                setSelectedCells(new Set([0]))
              }}>Начать заново</button>
            </>
          )}

          {activePanel === 'calculator' && <FabricCalculatorPanel document={document} />}
        </aside>

        <section className="stage">
          <div className="context-toolbar">
            <button className={tool === 'eyedropper' ? 'tool-button active' : 'tool-button'} onClick={() => setTool('eyedropper')} title="Пипетка: взять блок с холста">◉</button>
            <button className={tool === 'select' ? 'tool-button active' : 'tool-button'} onClick={() => setTool('select')} title="Выделение">↖ <span>Выбрать</span></button>
            <button className={tool === 'pan' ? 'tool-button active' : 'tool-button'} onClick={() => setTool('pan')} title="Перемещать холст">✋</button>
            <button className="tool-button" onClick={() => selectPreset('odd')} title="Шахматное выделение">▦</button>
            <button className="tool-button" onClick={() => selectPreset('even')} title="Обратное шахматное выделение">▧</button>
            <button className="tool-button" onClick={() => selectPreset('border')} title="Выделить край">□</button>
            <button className="tool-button" onClick={() => selectPreset('diagonal')} title="Выделить диагональ">╱</button>
            <button className="tool-button" onClick={() => selectPreset('clear')} title="Снять выделение">×</button>
            <span className="toolbar-divider" />
            <button className="tool-button" disabled={!selectedIndices.length} onClick={rotateSelectionLeft} title="Повернуть влево">↺</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={rotateSelection} title="Повернуть вправо">↻</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={randomizeSelectionRotation} title="Случайный поворот">⤨</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={resetSelectionRotation} title="Сбросить поворот">0°</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={() => mirrorSelection('x')} title="Отразить горизонтально">↔</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={() => mirrorSelection('y')} title="Отразить вертикально">↕</button>
            <button className="tool-button" disabled={selectedIndices.length < 2} onClick={mergeSelection} title="Объединить ячейки">⊞</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={unmergeSelection} title="Разъединить ячейки">⊟</button>
            {document.gridType === 'free' && (
              <>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(-10, 0)} title="Сдвинуть влево">←</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(10, 0)} title="Сдвинуть вправо">→</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(0, -10)} title="Сдвинуть вверх">↑</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(0, 10)} title="Сдвинуть вниз">↓</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(0, 0, 0.9)} title="Уменьшить блок">−□</button>
                <button className="tool-button" disabled={!selectedIndices.length} onClick={() => transformFreeSelection(0, 0, 1.1)} title="Увеличить блок">＋□</button>
              </>
            )}
            <button className="tool-button" disabled={!selectedIndices.length} onClick={copySelection} title="Копировать">⧉</button>
            <button className="tool-button" disabled={!selectedIndices.length || !copiedCell.current} onClick={pasteSelection} title="Вставить">▣</button>
            <button className="tool-button" disabled={!selectedIndices.length} onClick={clearSelection} title="Очистить">⌫</button>
            <span className="toolbar-divider" />
            <button className="tool-button" onClick={() => selectPreset('all')}>Всё</button>
            <div className="zoom-control">
              <button onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))} aria-label="Уменьшить">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} aria-label="Увеличить">+</button>
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
                  <button className="grid-corner" onClick={() => selectPreset('all')} title="Выбрать всё">∞</button>
                  <div className="column-headers" style={{ gridTemplateColumns: `repeat(${document.columns}, 1fr)` }}>
                    {Array.from({ length: document.columns }, (_, column) => (
                      <button key={column} onClick={() => selectColumn(column)} aria-label={`Выбрать столбец ${column + 1}`}>{column + 1}</button>
                    ))}
                  </div>
                  <div className="row-headers" style={{ gridTemplateRows: `repeat(${document.rows}, 1fr)` }}>
                    {Array.from({ length: document.rows }, (_, row) => (
                      <button key={row} onClick={() => selectRow(row)} aria-label={`Выбрать ряд ${row + 1}`}>{row + 1}</button>
                    ))}
                  </div>
                  <div
                    className={`${tool === 'paint' ? 'quilt-grid painting' : 'quilt-grid'}${document.showGrid === false ? ' hide-grid' : ''} grid-${document.gridType ?? 'rectangle'}`}
                    style={{
                      gridTemplateColumns: (document.columnSizesCm ?? Array.from({ length: document.columns }, () => document.blockSizeCm)).map((size) => `${size}fr`).join(' '),
                      gridTemplateRows: (document.rowSizesCm ?? Array.from({ length: document.rows }, () => document.blockSizeCm)).map((size) => `${size}fr`).join(' '),
                      aspectRatio: `${estimate.finishedWidthCm} / ${estimate.finishedHeightCm}`,
                    }}
                    aria-label={`Макет ${document.columns} на ${document.rows}`}
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
                          aria-label={`Блок ${index + 1}: ${patternById(cell.patternId, document.customPatterns).name}`}
                        >
                          <PatternPreview cell={cell} palette={document.palette} patterns={document.customPatterns} fabricFills={document.fabricFills} fabricPlacements={document.fabricPlacements} />
                        </button>
                      )]
                    })}
                  </div>
                </div>
              </div>
              <p className="canvas-caption">{document.name} · {estimate.finishedWidthCm} × {estimate.finishedHeightCm} см</p>
            </div>
          </div>
        </section>
      </section>
      {blockEditor && (
        <BlockEditorModal
          pattern={blockEditor === 'new' ? undefined : blockEditor}
          palette={document.palette}
          onClose={() => setBlockEditor(null)}
          onSave={(pattern) => {
            commit((current) => ({
              ...current,
              customPatterns: [...(current.customPatterns ?? []).filter((candidate) => candidate.id !== pattern.id), pattern],
            }))
            setActivePattern(pattern.id)
            setTool('paint')
            setBlockEditor(null)
            onSaveBlock?.(pattern.name, pattern.id)
            flash('Блок сохранён')
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
