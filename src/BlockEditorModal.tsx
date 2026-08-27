import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { BlockPattern, PatternShape } from './editorModel'
import './block-editor.css'

export interface BlockEditorModalProps {
  pattern?: BlockPattern
  palette: readonly string[]
  onClose(): void
  onSave(pattern: BlockPattern): void
}

const COLOR_TAGS = ['A', 'B', 'C', 'D'] as const
const DEFAULT_DIVISIONS = 4

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
    return color >= 0 && color < Math.min(COLOR_TAGS.length, availableColors) ? color : 0
  })
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


export function BlockEditorModal({ pattern, palette, onClose, onSave }: BlockEditorModalProps) {
  const source = pattern as PatternWithDimensions | undefined
  const [name, setName] = useState(pattern ? `${pattern.name} — копия` : 'Новый блок')
  const [width, setWidth] = useState(String(source?.widthCm ?? 25))
  const [height, setHeight] = useState(String(source?.heightCm ?? 25))
  const [divisions, setDivisions] = useState(DEFAULT_DIVISIONS)
  const [showGrid, setShowGrid] = useState(true)
  const [activeColor, setActiveColor] = useState(palette[1] ? 1 : 0)
  const [cells, setCells] = useState(() => cellsFromPattern(pattern, DEFAULT_DIVISIONS, palette.length))
  const [saveAttempted, setSaveAttempted] = useState(false)
  const painting = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLFormElement>(null)

  const widthCm = Number(width.replace(',', '.'))
  const heightCm = Number(height.replace(',', '.'))
  const validationError = useMemo(() => {
    if (!name.trim()) return 'Введите название блока.'
    if (!Number.isFinite(widthCm) || widthCm <= 0 || widthCm > 1000) return 'Ширина должна быть от 0,1 до 1000 см.'
    if (!Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 1000) return 'Высота должна быть от 0,1 до 1000 см.'
    if (palette.length === 0) return 'Добавьте хотя бы один цвет в палитру квилта.'
    return ''
  }, [heightCm, name, palette.length, widthCm])
  const previewShapes = useMemo(() => shapesFromCells(cells, divisions), [cells, divisions])

  useEffect(() => {
    nameInput.current?.focus()
    nameInput.current?.select()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
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
    const stopPainting = () => { painting.current = false }
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
    if (!palette[activeColor] && activeColor !== 0) return
    setCells((current) => current.map((color, cellIndex) => cellIndex === index ? activeColor : color))
  }

  const startPainting = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    painting.current = true
    paintCell(index)
  }

  const changeDivisions = (next: number) => {
    const safeNext = Math.max(1, Math.min(8, next))
    setCells((current) => resizeCells(current, divisions, safeNext))
    setDivisions(safeNext)
  }

  const handleSave = () => {
    setSaveAttempted(true)
    if (validationError) return

    const shapes = previewShapes
    const signature = JSON.stringify({ name: name.trim(), widthCm, heightCm, divisions, cells })
    const result = {
      id: makePatternId(name, signature, String(pattern?.id ?? '')),
      name: name.trim(),
      background: 0,
      shapes,
      source: 'custom' as const,
      widthCm,
      heightCm,
      unsupportedReason: undefined,
    }
    onSave(result)
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
            <p className="block-editor-eyebrow">Мастерская блока</p>
            <h2 id="block-editor-title">{pattern ? 'Создать на основе блока' : 'Создать свой блок'}</h2>
            <p id="block-editor-intro">Соберите раппорт по клеткам и сохраните его в библиотеку квилта.</p>
          </div>
          <button className="block-editor-close" type="button" onClick={onClose} aria-label="Закрыть редактор">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="block-editor-body">
          <div className="block-editor-workspace">
            <div className="block-editor-canvas-heading">
              <div>
                <strong>Схема блока</strong>
                <span>{divisions} × {divisions} клеток</span>
              </div>
              <div className="block-editor-compact-actions" aria-label="Заливка схемы">
                <button
                  type="button"
                  onClick={() => setCells(Array(divisions * divisions).fill(palette[activeColor] ? activeColor : 0))}
                >
                  Залить
                </button>
                <button type="button" onClick={() => setCells(Array(divisions * divisions).fill(0))}>Очистить</button>
              </div>
            </div>

            <div className={`block-editor-canvas${showGrid ? ' block-editor-canvas--grid' : ''}`} style={gridStyle}>
              {cells.map((color, index) => (
                <button
                  className="block-editor-cell"
                  type="button"
                  key={index}
                  style={{ backgroundColor: palette[color] ?? palette[0] }}
                  onPointerDown={(event) => startPainting(event, index)}
                  onPointerEnter={() => { if (painting.current) paintCell(index) }}
                  onClick={() => paintCell(index)}
                  aria-label={`Клетка ${Math.floor(index / divisions) + 1}, ${index % divisions + 1}: цвет ${COLOR_TAGS[color] ?? 'A'}`}
                />
              ))}
            </div>

            <fieldset className="block-editor-palette">
              <legend>Цвет ткани</legend>
              <div className="block-editor-swatches">
                {COLOR_TAGS.map((tag, index) => {
                  const color = palette[index]
                  return (
                    <button
                      className={`block-editor-swatch${activeColor === index ? ' block-editor-swatch--active' : ''}`}
                      type="button"
                      key={tag}
                      onClick={() => setActiveColor(index)}
                      disabled={!color}
                      aria-pressed={activeColor === index}
                      aria-label={color ? `Выбрать цвет ${tag}` : `Цвет ${tag} недоступен`}
                    >
                      <span className="block-editor-swatch-color" style={{ backgroundColor: color }} aria-hidden="true" />
                      <b>{tag}</b>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          </div>

          <aside className="block-editor-settings" aria-label="Параметры блока">
            <label className="block-editor-field block-editor-field--wide">
              <span>Название</span>
              <input
                ref={nameInput}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                aria-invalid={saveAttempted && !name.trim()}
                aria-describedby="block-editor-status"
              />
            </label>

            <div className="block-editor-dimensions">
              <label className="block-editor-field">
                <span>Ширина, см</span>
                <input
                  type="number"
                  min="0.1"
                  max="1000"
                  step="0.1"
                  value={width}
                  onChange={(event) => setWidth(event.target.value)}
                  aria-invalid={saveAttempted && (!Number.isFinite(widthCm) || widthCm <= 0 || widthCm > 1000)}
                  aria-describedby="block-editor-status"
                />
              </label>
              <label className="block-editor-field">
                <span>Высота, см</span>
                <input
                  type="number"
                  min="0.1"
                  max="1000"
                  step="0.1"
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  aria-invalid={saveAttempted && (!Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 1000)}
                  aria-describedby="block-editor-status"
                />
              </label>
            </div>

            <label className="block-editor-field block-editor-field--wide">
              <span>Деления сетки</span>
              <select value={divisions} onChange={(event) => changeDivisions(Number(event.target.value))}>
                {Array.from({ length: 8 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value} × {value}</option>
                ))}
              </select>
            </label>

            <label className="block-editor-toggle">
              <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
              <span aria-hidden="true" />
              Показывать линии построения
            </label>

            <div className="block-editor-preview-section">
              <div className="block-editor-section-title">
                <strong>Предпросмотр</strong>
                <span>{width || '—'} × {height || '—'} см</span>
              </div>
              <div className="block-editor-preview-frame">
                <div className="block-editor-preview" style={previewStyle}>
                  <svg viewBox="0 0 100 100" role="img" aria-label="Предпросмотр нового блока">
                    <rect width="100" height="100" fill={palette[0]} />
                    {previewShapes.map((shape, index) => (
                      <polygon
                        key={index}
                        points={shape.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
                        fill={palette[shape.color] ?? palette[0]}
                      />
                    ))}
                    {showGrid && Array.from({ length: divisions - 1 }, (_, index) => index + 1).flatMap((value) => [
                      <line key={`v-${value}`} x1={value * 100 / divisions} x2={value * 100 / divisions} y1="0" y2="100" />,
                      <line key={`h-${value}`} y1={value * 100 / divisions} y2={value * 100 / divisions} x1="0" x2="100" />,
                    ])}
                  </svg>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="block-editor-footer">
          <p id="block-editor-status" className={`block-editor-status${saveAttempted && validationError ? ' block-editor-status--error' : ''}`} role="status">
            {saveAttempted && validationError ? validationError : 'Блок сохранится как новый — исходный узор не изменится.'}
          </p>
          <div className="block-editor-footer-actions">
            <button className="block-editor-secondary" type="button" onClick={onClose}>Отмена</button>
            <button className="block-editor-primary" type="submit">Сохранить блок</button>
          </div>
        </footer>
      </form>
    </div>
  )
}
