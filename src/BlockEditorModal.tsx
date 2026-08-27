import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { PATTERNS, type BlockPattern, type PatternShape } from './editorModel'
import { usePreferences } from './i18n'
import './block-editor.css'

export interface BlockEditorModalProps {
  pattern?: BlockPattern
  palette: readonly string[]
  onClose(): void
  onSave(pattern: BlockPattern, palette: readonly string[]): void
}

const COLOR_ROLES = [
  ['Фон', 'Background'],
  ['Акцент', 'Accent'],
  ['Контраст', 'Contrast'],
  ['Дополнительный', 'Secondary'],
] as const
const colorTag = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
const DEFAULT_DIVISIONS = 4

type LayoutMode = 'grid' | 'flying-geese' | 'template'
type GooseRegion = 'left' | 'body' | 'right'

const FLYING_GEESE_REGIONS = [
  { key: 'left', points: [[0, 0], [0, 1], [0.5, 0]], labelPosition: [13, 48] },
  { key: 'body', points: [[0, 1], [0.5, 0], [1, 1]], labelPosition: [50, 70] },
  { key: 'right', points: [[0.5, 0], [1, 0], [1, 1]], labelPosition: [87, 48] },
] as const satisfies readonly {
  key: GooseRegion
  points: PatternShape['points']
  labelPosition: readonly [number, number]
}[]

type GooseColors = [number, number, number]

type PatternWithDimensions = BlockPattern & {
  widthCm?: number
  heightCm?: number
}

function pointInPolygon(x: number, y: number, points: PatternShape['points']): boolean {
  let inside = false
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const [currentX, currentY] = points[current]
    const [previousX, previousY] = points[previous]
    const crosses = (currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX
    if (crosses) inside = !inside
  }
  return inside
}

function cellsFromPattern(pattern: BlockPattern | undefined, divisions: number, availableColors: number): number[] {
  if (!pattern) return Array(divisions * divisions).fill(0)

  return Array.from({ length: divisions * divisions }, (_, index) => {
    const row = Math.floor(index / divisions)
    const column = index % divisions
    const x = (column + 0.5) / divisions
    const y = (row + 0.5) / divisions
    let color = pattern.background
    for (const shape of pattern.shapes) {
      if (pointInPolygon(x, y, shape.points)) color = shape.color
    }
    return color >= 0 && color < availableColors ? color : 0
  })
}

function colorAtPoint(pattern: BlockPattern, x: number, y: number, availableColors: number): number {
  let color = pattern.background
  for (const shape of pattern.shapes) {
    if (pointInPolygon(x, y, shape.points)) color = shape.color
  }
  return color >= 0 && color < availableColors ? color : 0
}

function gooseColorsFromPattern(pattern: BlockPattern | undefined, availableColors: number): GooseColors {
  if (!pattern) return [0, availableColors > 1 ? 1 : 0, 0]
  return FLYING_GEESE_REGIONS.map(({ points }) => {
    const [x, y] = points.reduce<[number, number]>(
      ([totalX, totalY], [pointX, pointY]) => [totalX + pointX / 3, totalY + pointY / 3],
      [0, 0],
    )
    return colorAtPoint(pattern, x, y, availableColors)
  }) as GooseColors
}

function resizeCells(cells: readonly number[], from: number, to: number): number[] {
  return Array.from({ length: to * to }, (_, index) => {
    const row = Math.floor(index / to)
    const column = index % to
    const sourceRow = Math.min(from - 1, Math.floor(((row + 0.5) * from) / to))
    const sourceColumn = Math.min(from - 1, Math.floor(((column + 0.5) * from) / to))
    return cells[sourceRow * from + sourceColumn] ?? 0
  })
}

function normalized(value: number, divisions: number): number {
  return Number((value / divisions).toFixed(6))
}

function shapesFromCells(cells: readonly number[], divisions: number): PatternShape[] {
  return cells.flatMap((color, index) => {
    if (color === 0) return []
    const row = Math.floor(index / divisions)
    const column = index % divisions
    return [{
      color,
      points: [
        [normalized(column, divisions), normalized(row, divisions)],
        [normalized(column + 1, divisions), normalized(row, divisions)],
        [normalized(column + 1, divisions), normalized(row + 1, divisions)],
        [normalized(column, divisions), normalized(row + 1, divisions)],
      ],
    } satisfies PatternShape]
  })
}

function shapesFromGooseColors(colors: GooseColors): PatternShape[] {
  const background = colors[0]
  return FLYING_GEESE_REGIONS.flatMap(({ points }, index) => (
    index > 0 && colors[index] !== background
      ? [{ color: colors[index], points } satisfies PatternShape]
      : []
  ))
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function makePatternId(name: string, signature: string, sourceId?: string): BlockPattern['id'] {
  const slug = name
    .toLocaleLowerCase('ru')
    .normalize('NFKD')
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) || 'blok'
  const candidate = `custom-${slug}-${stableHash(signature)}`
  return (candidate === sourceId ? `${candidate}-copy` : candidate) as BlockPattern['id']
}

function editablePattern(pattern: BlockPattern): BlockPattern {
  return {
    ...pattern,
    shapes: pattern.shapes.map((shape) => ({
      ...shape,
      points: shape.points.map(([x, y]) => [x, y] as const),
    })),
  }
}


export function BlockEditorModal({ pattern, palette, onClose, onSave }: BlockEditorModalProps) {
  const {
    measurementSystem,
    text,
    patternName,
    lengthUnit,
    toDisplayLength,
    fromDisplayLength,
    formatLength,
  } = usePreferences()
  const source = pattern as PatternWithDimensions | undefined
  const sourceName = pattern && !pattern.source ? patternName(String(pattern.id), pattern.name) : pattern?.name
  const [name, setName] = useState(pattern
    ? text(`${sourceName} — копия`, `${sourceName} — copy`)
    : text('Новый блок', 'New block'))
  const [width, setWidth] = useState(String(toDisplayLength(source?.widthCm ?? 25)))
  const [height, setHeight] = useState(String(toDisplayLength(source?.heightCm ?? 25)))
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    String(pattern?.id) === 'flying-geese' ? 'flying-geese' : pattern ? 'template' : 'grid',
  )
  const [editorPalette, setEditorPalette] = useState(() => [...palette])
  const [newColor, setNewColor] = useState('#f4a261')
  const [template, setTemplate] = useState<BlockPattern>(() => editablePattern(
    pattern ?? PATTERNS.find(({ id }) => id === 'grandmothers-flower-garden') ?? PATTERNS[0],
  ))
  const [divisions, setDivisions] = useState(DEFAULT_DIVISIONS)
  const [showGrid, setShowGrid] = useState(true)
  const [activeColor, setActiveColor] = useState(palette[1] ? 1 : 0)
  const [cells, setCells] = useState(() => cellsFromPattern(pattern, DEFAULT_DIVISIONS, palette.length))
  const [gooseColors, setGooseColors] = useState<GooseColors>(
    () => gooseColorsFromPattern(pattern, palette.length),
  )
  const [saveAttempted, setSaveAttempted] = useState(false)
  const painting = useRef(false)
  const lastPaintedCell = useRef<number | null>(null)
  const dialog = useRef<HTMLFormElement>(null)
  const previousMeasurementSystem = useRef(measurementSystem)
  const previousFromDisplayLength = useRef(fromDisplayLength)

  const parsedWidth = Number(width.replace(',', '.'))
  const parsedHeight = Number(height.replace(',', '.'))
  const widthCm = fromDisplayLength(parsedWidth)
  const heightCm = fromDisplayLength(parsedHeight)
  const minimumSizeCm = 0.1
  const maximumSizeCm = 1000
  const validationError = useMemo(() => {
    if (!name.trim()) return text('Введите название блока.', 'Enter a block name.')
    if (!Number.isFinite(widthCm) || widthCm < minimumSizeCm || widthCm > maximumSizeCm) {
      return text(
        `Ширина должна быть от ${formatLength(minimumSizeCm)} до ${formatLength(maximumSizeCm)}.`,
        `Width must be between ${formatLength(minimumSizeCm)} and ${formatLength(maximumSizeCm)}.`,
      )
    }
    if (!Number.isFinite(heightCm) || heightCm < minimumSizeCm || heightCm > maximumSizeCm) {
      return text(
        `Высота должна быть от ${formatLength(minimumSizeCm)} до ${formatLength(maximumSizeCm)}.`,
        `Height must be between ${formatLength(minimumSizeCm)} and ${formatLength(maximumSizeCm)}.`,
      )
    }
    if (editorPalette.length === 0) {
      return text('Добавьте хотя бы один цвет в палитру квилта.', 'Add at least one color to the quilt palette.')
    }
    return ''
  }, [editorPalette.length, formatLength, heightCm, name, text, widthCm])
  const previewBackground = layoutMode === 'flying-geese'
    ? gooseColors[0]
    : layoutMode === 'template'
      ? template.background
      : 0
  const previewShapes = useMemo(
    () => layoutMode === 'flying-geese'
      ? shapesFromGooseColors(gooseColors)
      : layoutMode === 'template'
        ? template.shapes
        : shapesFromCells(cells, divisions),
    [cells, divisions, gooseColors, layoutMode, template.shapes],
  )


  useEffect(() => {
    if (previousMeasurementSystem.current === measurementSystem) return
    const convertFromPreviousUnit = previousFromDisplayLength.current
    setWidth((current) => {
      const value = Number(current.replace(',', '.'))
      return Number.isFinite(value) ? String(toDisplayLength(convertFromPreviousUnit(value))) : current
    })
    setHeight((current) => {
      const value = Number(current.replace(',', '.'))
      return Number.isFinite(value) ? String(toDisplayLength(convertFromPreviousUnit(value))) : current
    })
    previousMeasurementSystem.current = measurementSystem
    previousFromDisplayLength.current = fromDisplayLength
  }, [fromDisplayLength, measurementSystem, toDisplayLength])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const stopPainting = () => {
      painting.current = false
      lastPaintedCell.current = null
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerup', stopPainting)
    window.addEventListener('pointercancel', stopPainting)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerup', stopPainting)
      window.removeEventListener('pointercancel', stopPainting)
    }
  }, [onClose])

  const paintCell = (index: number) => {
    if (!editorPalette[activeColor]) return
    if (lastPaintedCell.current === index) return
    lastPaintedCell.current = index
    setCells((current) => current[index] === activeColor
      ? current
      : current.map((color, cellIndex) => cellIndex === index ? activeColor : color))
  }

  const paintGooseRegion = (index: number) => {
    if (!editorPalette[activeColor]) return
    setGooseColors((current) => current[index] === activeColor
      ? current
      : current.map((color, regionIndex) => regionIndex === index ? activeColor : color) as GooseColors)
  }

  const paintTemplateRegion = (index: number | 'background') => {
    if (!editorPalette[activeColor]) return
    setTemplate((current) => index === 'background'
      ? { ...current, background: activeColor }
      : {
          ...current,
          shapes: current.shapes.map((shape, shapeIndex) => (
            shapeIndex === index ? { ...shape, color: activeColor } : shape
          )),
        })
  }

  const startPainting = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) return
    painting.current = true
    lastPaintedCell.current = null
    event.currentTarget.setPointerCapture(event.pointerId)
    paintCell(index)
  }

  const continuePainting = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!painting.current) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('.block-editor-cell')
    if (!target || !event.currentTarget.contains(target)) return
    const index = Number(target.dataset.cellIndex)
    if (Number.isInteger(index)) paintCell(index)
  }

  const changeDivisions = (next: number) => {
    const safeNext = Math.max(1, Math.min(8, next))
    setCells((current) => resizeCells(current, divisions, safeNext))
    setDivisions(safeNext)
  }

  const handleSave = () => {
    setSaveAttempted(true)
    if (validationError) return

    const signature = JSON.stringify(layoutMode === 'flying-geese'
      ? { name: name.trim(), widthCm, heightCm, layoutMode, gooseColors }
      : layoutMode === 'template'
        ? { name: name.trim(), widthCm, heightCm, layoutMode, background: template.background, shapes: template.shapes }
        : { name: name.trim(), widthCm, heightCm, layoutMode, divisions, cells })
    const result = {
      id: makePatternId(name, signature, String(pattern?.id ?? '')),
      name: name.trim(),
      background: previewBackground,
      shapes: previewShapes,
      source: 'custom' as const,
      widthCm,
      heightCm,
      unsupportedReason: undefined,
    }
    onSave(result, editorPalette)
  }

  const gridStyle = { '--block-editor-divisions': divisions } as CSSProperties
  const previewWidthCm = Number.isFinite(widthCm) && widthCm > 0 ? widthCm : 1
  const previewHeightCm = Number.isFinite(heightCm) && heightCm > 0 ? heightCm : 1
  const previewLongSideCm = Math.max(previewWidthCm, previewHeightCm)
  const previewStyle = {
    '--block-editor-preview-width': previewWidthCm / previewLongSideCm,
    '--block-editor-preview-height': previewHeightCm / previewLongSideCm,
  } as CSSProperties

  return (
    <div
      className="block-editor-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        ref={dialog}
        className="block-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-editor-title"
        aria-describedby="block-editor-intro"
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        <header className="block-editor-header">
          <div>
            <p className="block-editor-eyebrow">{text('Мастерская блока', 'Block workshop')}</p>
            <h2 id="block-editor-title">
              {pattern ? text('Создать новый блок на основе выбранного', 'Create a new block from the selected one') : text('Создать свой блок', 'Create a custom block')}
            </h2>
            <p id="block-editor-intro">
              {text(
                'Выберите ткань и тип раскладки, создайте узор, затем задайте название и размер.',
                'Choose a fabric and layout, create the design, then name and size it.',
              )}
            </p>
          </div>
          <button
            className="block-editor-close"
            type="button"
            onClick={onClose}
            aria-label={text('Закрыть редактор', 'Close editor')}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="block-editor-body">
          <div className="block-editor-workspace">
            <section className="block-editor-step" aria-labelledby="block-editor-step-one">
              <div className="block-editor-step-heading">
                <span className="block-editor-step-number" aria-hidden="true">1</span>
                <div>
                  <h3 id="block-editor-step-one">{text('Выберите ткань или цвет', 'Choose a fabric or color')}</h3>
                  <p>{text('Этим цветом вы будете закрашивать клетки или детали.', 'You will paint cells or pieces with this color.')}</p>
                </div>
              </div>

              <fieldset className="block-editor-palette">
                <legend className="visually-hidden">{text('Ткань для рисования', 'Fabric to paint with')}</legend>
                <div className="block-editor-swatches">
                  {editorPalette.map((color, index) => {
                    const tag = colorTag(index)
                    const role = COLOR_ROLES[index]
                    return (
                      <button
                        className={`block-editor-swatch${activeColor === index ? ' block-editor-swatch--active' : ''}`}
                        type="button"
                        key={`${color}-${index}`}
                        onClick={() => setActiveColor(index)}
                        aria-pressed={activeColor === index}
                        aria-label={text(
                          `Выбрать цвет ${tag}${role ? `, ${role[0]}` : ''}`,
                          `Select color ${tag}${role ? `, ${role[1]}` : ''}`,
                        )}
                        autoFocus={activeColor === index}
                      >
                        <span className="block-editor-swatch-color" style={{ backgroundColor: color }} aria-hidden="true" />
                        <b>{tag}</b>
                        {activeColor === index && <span className="block-editor-selected-mark" aria-hidden="true">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <div className="block-editor-add-color">
                <label>
                  <span>{text('Новый цвет', 'New color')}</span>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(event) => setNewColor(event.target.value)}
                    aria-label={text('Выбрать новый цвет', 'Choose a new color')}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const existing = editorPalette.findIndex((color) => color.toLowerCase() === newColor.toLowerCase())
                    if (existing >= 0) {
                      setActiveColor(existing)
                      return
                    }
                    setEditorPalette((current) => [...current, newColor])
                    setActiveColor(editorPalette.length)
                  }}
                >
                  {text('Добавить цвет', 'Add color')}
                </button>
              </div>

              <p className="block-editor-selected-color" id="block-editor-selected-color" aria-live="polite">
                <span className="block-editor-selected-color-chip" style={{ backgroundColor: editorPalette[activeColor] ?? editorPalette[0] }} aria-hidden="true" />
                <span>
                  <small>{text('Выбрано для рисования', 'Selected for painting')}</small>
                  <strong>
                    {text('Цвет', 'Color')} {colorTag(activeColor)}
                    {COLOR_ROLES[activeColor] ? ` · ${text(COLOR_ROLES[activeColor][0], COLOR_ROLES[activeColor][1])}` : ''}
                  </strong>
                </span>
              </p>
            </section>

            <section className="block-editor-step block-editor-drawing-step" aria-labelledby="block-editor-step-two">
              <div className="block-editor-drawing-heading">
                <div className="block-editor-step-heading">
                  <span className="block-editor-step-number" aria-hidden="true">2</span>
                  <div>
                    <h3 id="block-editor-step-two">{text('Выберите раскладку и создайте узор', 'Choose a layout and create the design')}</h3>
                    <p id="block-editor-canvas-help">
                      {layoutMode === 'flying-geese'
                        ? text('Выберите цвет, затем нажмите на левую, центральную или правую область.', 'Choose a color, then select the left, body, or right region.')
                        : layoutMode === 'template'
                          ? text('Выберите цвет и нажимайте на детали орнамента. Геометрия исходного блока сохраняется точно.', 'Choose a color and click ornament pieces. The source block geometry is preserved exactly.')
                          : text('Нажимайте на клетки или ведите по ним, удерживая кнопку.', 'Click cells, or press and drag across them to paint.')}
                    </p>
                  </div>
                </div>
                <span className="block-editor-grid-count">
                  {layoutMode === 'flying-geese'
                    ? text('3 области', '3 regions')
                    : layoutMode === 'template'
                      ? `${template.shapes.length + 1} ${text('деталей', 'pieces')}`
                      : `${divisions} × ${divisions} ${text('клеток', 'cells')}`}
                </span>
              </div>

              <fieldset className="block-editor-layout-selector">
                <legend>{text('Раскладка', 'Layout')}</legend>
                <div>
                  <label>
                    <input
                      type="radio"
                      name="block-layout"
                      value="grid"
                      checked={layoutMode === 'grid'}
                      onChange={() => setLayoutMode('grid')}
                    />
                    <span>{text('Квадратная сетка', 'Square grid')}</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="block-layout"
                      value="template"
                      checked={layoutMode === 'template'}
                      onChange={() => setLayoutMode('template')}
                    />
                    <span>{text('Орнамент из библиотеки', 'Library ornament')}</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="block-layout"
                      value="flying-geese"
                      checked={layoutMode === 'flying-geese'}
                      onChange={() => setLayoutMode('flying-geese')}
                    />
                    <span>{text('Летящий гусь — 3 детали', 'Flying Geese — 3 pieces')}</span>
                  </label>
                </div>
              </fieldset>
              {layoutMode === 'template' && (
                <label className="block-editor-template-select">
                  <span>{text('Основа орнамента', 'Ornament template')}</span>
                  <select
                    value={template.id}
                    onChange={(event) => {
                      const selected = PATTERNS.find(({ id }) => String(id) === event.target.value)
                      if (selected) setTemplate(editablePattern(selected))
                    }}
                  >
                    {PATTERNS.filter(({ shapes }) => shapes.length > 0).map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {patternName(String(candidate.id), candidate.name)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {layoutMode === 'flying-geese' && (
                <p className="block-editor-goose-explanation">
                  {text(
                    'Один прямоугольный блок шьют из прямоугольника корпуса и двух угловых квадратов; в готовом виде это три треугольные области.',
                    'One rectangular unit is sewn from one body rectangle and two corner squares; the finished visual has three triangular regions.',
                  )}
                </p>
              )}

              {layoutMode === 'grid' ? (
                <>
                  <div
                    className={`block-editor-canvas${showGrid ? ' block-editor-canvas--grid' : ''}`}
                    style={gridStyle}
                    role="group"
                    aria-label={text('Холст блока', 'Block canvas')}
                    aria-describedby="block-editor-canvas-help block-editor-selected-color"
                    onPointerMove={continuePainting}
                  >
                    {cells.map((color, index) => (
                      <button
                        className="block-editor-cell"
                        type="button"
                        key={index}
                        data-cell-index={index}
                        style={{ backgroundColor: editorPalette[color] ?? editorPalette[0] }}
                        onPointerDown={(event) => startPainting(event, index)}
                        onClick={() => {
                          lastPaintedCell.current = null
                          paintCell(index)
                        }}
                        aria-label={text(
                          `Клетка ${Math.floor(index / divisions) + 1}, ${index % divisions + 1}. Сейчас цвет ${colorTag(color)}. Закрасить цветом ${colorTag(activeColor)}.`,
                          `Cell ${Math.floor(index / divisions) + 1}, ${index % divisions + 1}. Currently color ${colorTag(color)}. Paint with color ${colorTag(activeColor)}.`,
                        )}
                      />
                    ))}
                  </div>

                  <div className="block-editor-drawing-controls">
                    <div className="block-editor-compact-actions" aria-label={text('Действия с узором', 'Design actions')}>
                      <button
                        type="button"
                        onClick={() => setCells(Array(divisions * divisions).fill(editorPalette[activeColor] ? activeColor : 0))}
                      >
                        {text('Залить всё выбранным цветом', 'Fill all with selected color')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCells(Array(divisions * divisions).fill(0))}
                        aria-label={text('Очистить узор и вернуть все клетки к ткани A', 'Clear design and reset every cell to fabric A')}
                      >
                        {text('Очистить узор', 'Clear design')}
                      </button>
                    </div>
                    <div className="block-editor-grid-controls">
                      <label className="block-editor-inline-field">
                        <span>{text('Сетка', 'Grid')}</span>
                        <select
                          value={divisions}
                          onChange={(event) => changeDivisions(Number(event.target.value))}
                          aria-label={text('Изменить количество клеток в сетке', 'Change the number of cells in the grid')}
                        >
                          {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => (
                            <option key={value} value={value}>{value} × {value}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block-editor-toggle">
                        <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                        <span aria-hidden="true" />
                        {text('Линии сетки', 'Grid lines')}
                      </label>
                    </div>
                  </div>
                </>
              ) : layoutMode === 'template' ? (
                <div className="block-editor-template-editor">
                  <svg
                    className="block-editor-template-canvas"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    role="group"
                    aria-label={text('Редактор деталей орнамента', 'Ornament piece editor')}
                    aria-describedby="block-editor-canvas-help block-editor-selected-color"
                  >
                    <rect
                      width="100"
                      height="100"
                      fill={editorPalette[template.background] ?? editorPalette[0]}
                      role="button"
                      tabIndex={0}
                      onClick={() => paintTemplateRegion('background')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') paintTemplateRegion('background')
                      }}
                      aria-label={text(
                        `Фон. Сейчас цвет ${colorTag(template.background)}. Закрасить цветом ${colorTag(activeColor)}.`,
                        `Background. Currently color ${colorTag(template.background)}. Paint with color ${colorTag(activeColor)}.`,
                      )}
                    />
                    {template.shapes.map((shape, index) => (
                      <polygon
                        className="block-editor-template-region"
                        key={index}
                        points={shape.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
                        fill={editorPalette[shape.color] ?? editorPalette[0]}
                        role="button"
                        tabIndex={0}
                        onClick={() => paintTemplateRegion(index)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') paintTemplateRegion(index)
                        }}
                        aria-label={text(
                          `Деталь ${index + 1}. Сейчас цвет ${colorTag(shape.color)}. Закрасить цветом ${colorTag(activeColor)}.`,
                          `Piece ${index + 1}. Currently color ${colorTag(shape.color)}. Paint with color ${colorTag(activeColor)}.`,
                        )}
                      />
                    ))}
                  </svg>
                  <p>{text(
                    'Каждая фигура редактируется отдельно — треугольники, ромбы, шестиугольники и составные орнаменты не превращаются в квадраты.',
                    'Every shape is edited independently—triangles, diamonds, hexagons, and compound ornaments are not converted into squares.',
                  )}</p>
                  <button
                    className="block-editor-template-background"
                    type="button"
                    onClick={() => paintTemplateRegion('background')}
                  >
                    <span style={{ backgroundColor: editorPalette[template.background] ?? editorPalette[0] }} aria-hidden="true" />
                    {text('Покрасить фон выбранным цветом', 'Paint background with selected color')}
                  </button>
                </div>
              ) : (
                <div className="block-editor-goose-editor">
                  <svg
                    className="block-editor-goose-canvas"
                    viewBox="0 0 100 50"
                    role="group"
                    aria-label={text('Холст блока «Летящий гусь» с тремя областями', 'Flying Geese block canvas with three regions')}
                    aria-describedby="block-editor-canvas-help block-editor-selected-color"
                  >
                    {FLYING_GEESE_REGIONS.map(({ key, points, labelPosition }, index) => {
                      const regionName = key === 'left'
                        ? text('Левая область', 'Left region')
                        : key === 'body'
                          ? text('Корпус гуся', 'Goose body')
                          : text('Правая область', 'Right region')
                      const shortName = key === 'left'
                        ? text('Левая', 'Left')
                        : key === 'body'
                          ? text('Корпус', 'Body')
                          : text('Правая', 'Right')
                      const regionColorTag = colorTag(gooseColors[index])
                      return (
                        <g
                          className="block-editor-goose-region"
                          key={key}
                          role="button"
                          tabIndex={0}
                          onClick={() => paintGooseRegion(index)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            paintGooseRegion(index)
                          }}
                          aria-label={text(
                            `${regionName}. Сейчас цвет ${regionColorTag}. Закрасить цветом ${colorTag(activeColor)}.`,
                            `${regionName}. Currently color ${regionColorTag}. Paint with color ${colorTag(activeColor)}.`,
                          )}
                        >
                          <polygon
                            points={points.map(([x, y]) => `${x * 100},${y * 50}`).join(' ')}
                            fill={editorPalette[gooseColors[index]] ?? editorPalette[0]}
                          />
                          <text x={labelPosition[0]} y={labelPosition[1] / 2} aria-hidden="true">
                            <tspan x={labelPosition[0]}>{shortName}</tspan>
                            <tspan className="block-editor-goose-fabric-label" x={labelPosition[0]} dy="6">
                              {text('Цвет', 'Color')} {regionColorTag}
                            </tspan>
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                  <div className="block-editor-goose-region-key" aria-hidden="true">
                    {gooseColors.map((color, index) => (
                      <span key={FLYING_GEESE_REGIONS[index].key}>
                        <i style={{ backgroundColor: editorPalette[color] ?? editorPalette[0] }} />
                        {index === 0
                          ? text('Левая', 'Left')
                          : index === 1
                            ? text('Корпус', 'Body')
                            : text('Правая', 'Right')}
                        {' · '}{text('цвет', 'color')} {colorTag(color)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="block-editor-settings" aria-labelledby="block-editor-settings-title">
            <div className="block-editor-step-heading block-editor-settings-heading">
              <span className="block-editor-step-number" aria-hidden="true">3</span>
              <div>
                <h3 id="block-editor-settings-title">{text('Параметры блока', 'Block settings')}</h3>
                <p>{text('Назовите блок, задайте готовый размер и сохраните.', 'Name the block, set its finished size, and save it.')}</p>
              </div>
            </div>

            <div className="block-editor-settings-fields">
              <label className="block-editor-field block-editor-field--wide">
                <span>{text('Название нового блока', 'New block name')}</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  aria-invalid={saveAttempted && !name.trim()}
                  aria-describedby="block-editor-status"
                />
              </label>

              <div className="block-editor-dimensions">
                <label className="block-editor-field">
                  <span>{text('Готовая ширина', 'Finished width')}, {lengthUnit}</span>
                  <input
                    type="number"
                    min={String(toDisplayLength(minimumSizeCm))}
                    max={String(toDisplayLength(maximumSizeCm))}
                    step={measurementSystem === 'metric' ? '0.1' : '0.01'}
                    value={width}
                    onChange={(event) => setWidth(event.target.value)}
                    aria-invalid={saveAttempted && (!Number.isFinite(widthCm) || widthCm < minimumSizeCm || widthCm > maximumSizeCm)}
                    aria-describedby={`block-editor-status${layoutMode === 'flying-geese' ? ' block-editor-ratio-note' : ''}`}
                  />
                </label>
                <label className="block-editor-field">
                  <span>{text('Готовая высота', 'Finished height')}, {lengthUnit}</span>
                  <input
                    type="number"
                    min={String(toDisplayLength(minimumSizeCm))}
                    max={String(toDisplayLength(maximumSizeCm))}
                    step={measurementSystem === 'metric' ? '0.1' : '0.01'}
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                    aria-invalid={saveAttempted && (!Number.isFinite(heightCm) || heightCm < minimumSizeCm || heightCm > maximumSizeCm)}
                    aria-describedby={`block-editor-status${layoutMode === 'flying-geese' ? ' block-editor-ratio-note' : ''}`}
                  />
                </label>
                {layoutMode === 'flying-geese' && (
                  <p className="block-editor-ratio-note" id="block-editor-ratio-note">
                    {text(
                      'Рекомендуемая готовая пропорция: ширина 2 : высота 1. Значения не меняются автоматически.',
                      'Recommended finished ratio: width 2 : height 1. Values are not changed automatically.',
                    )}
                  </p>
                )}
              </div>
            </div>

            <section className="block-editor-preview-section" aria-labelledby="block-editor-preview-title">
              <div className="block-editor-section-title">
                <div>
                  <strong id="block-editor-preview-title">{text('Предпросмотр', 'Preview')}</strong>
                  <small>{text('Для проверки пропорций', 'For checking proportions')}</small>
                </div>
                <span>
                  {Number.isFinite(widthCm) && widthCm > 0 ? formatLength(widthCm) : '—'}
                  {' × '}
                  {Number.isFinite(heightCm) && heightCm > 0 ? formatLength(heightCm) : '—'}
                </span>
              </div>
              <div className="block-editor-preview-frame">
                <div className="block-editor-preview" style={previewStyle}>
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={text('Предпросмотр нового блока', 'New block preview')}
                  >
                    <rect width="100" height="100" fill={editorPalette[previewBackground] ?? editorPalette[0]} />
                    {previewShapes.map((shape, index) => (
                      <polygon
                        key={index}
                        points={shape.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
                        fill={editorPalette[shape.color] ?? editorPalette[0]}
                      />
                    ))}
                    {layoutMode === 'grid' && showGrid && Array.from({ length: divisions - 1 }, (_, index) => index + 1).flatMap((value) => [
                      <line key={`v-${value}`} x1={value * 100 / divisions} x2={value * 100 / divisions} y1="0" y2="100" />,
                      <line key={`h-${value}`} y1={value * 100 / divisions} y2={value * 100 / divisions} x1="0" x2="100" />,
                    ])}
                  </svg>
                </div>
              </div>
            </section>

            <p className="block-editor-save-note">
              <strong>{text('Будет создан новый блок.', 'A new block will be created.')}</strong>
              {pattern
                ? text(' Исходный блок останется без изменений.', ' The source block will stay unchanged.')
                : text(' Он появится в библиотеке этого квилта.', ' It will appear in this quilt’s library.')}
            </p>
          </aside>
        </div>

        <footer className="block-editor-footer">
          <p id="block-editor-status" className={`block-editor-status${saveAttempted && validationError ? ' block-editor-status--error' : ''}`} role="status">
            {saveAttempted && validationError
              ? validationError
              : pattern
                ? text('Шаг 3 из 3 · Исходный блок останется без изменений.', 'Step 3 of 3 · The source block will stay unchanged.')
                : text('Шаг 3 из 3 · Новый блок появится в библиотеке квилта.', 'Step 3 of 3 · The new block will appear in the quilt library.')}
          </p>
          <div className="block-editor-footer-actions">
            <button className="block-editor-secondary" type="button" onClick={onClose}>
              {text('Отмена', 'Cancel')}
            </button>
            <button className="block-editor-primary" type="submit">{text('Сохранить как новый блок', 'Save as new block')}</button>
          </div>
        </footer>
      </form>
    </div>
  )
}
