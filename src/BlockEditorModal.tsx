import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  PATTERNS,
  type BlockEditorData,
  type BlockPattern,
  type PatternShape,
} from './editorModel'
import {
  createPrimitive,
  flipGroup,
  groupBounds,
  hasPolygonOverlap,
  moveGroup,
  resizeGroup,
  rotateGroup,
  splitGroup,
  type DraftGroup,
  type PrimitiveKind,
  type SplitKind,
} from './blockEditorGeometry'
import { usePreferences } from './i18n'
import './block-editor.css'

export interface BlockEditorModalProps {
  pattern?: BlockPattern
  palette: readonly string[]
  onClose(): void
  onSave(pattern: BlockPattern, palette: readonly string[]): void
}

type PatternWithDimensions = BlockPattern & { widthCm?: number; heightCm?: number }
type Symmetry = 'none' | 'mirror-x' | 'mirror-y' | 'rotate-4'

type EditorSnapshot = {
  background: number
  groups: DraftGroup[]
  palette: string[]
  gridDivisions: number
}

type EditorHistory = {
  past: EditorSnapshot[]
  present: EditorSnapshot
  future: EditorSnapshot[]
}

const PRIMITIVES: readonly { kind: PrimitiveKind; ru: string; en: string }[] = [
  { kind: 'square', ru: 'Квадрат', en: 'Square' },
  { kind: 'rectangle', ru: 'Прямоугольник', en: 'Rectangle' },
  { kind: 'hst', ru: 'HST', en: 'HST' },
  { kind: 'qst', ru: 'QST', en: 'QST' },
  { kind: 'flying-geese', ru: 'Летящий гусь', en: 'Flying Geese' },
  { kind: 'triangle', ru: 'Треугольник', en: 'Triangle' },
  { kind: 'diamond', ru: 'Ромб', en: 'Diamond' },
  { kind: 'hexagon', ru: 'Шестиугольник', en: 'Hexagon' },
]

const SPLITS: readonly { kind: SplitKind; ru: string; en: string; symbol: string }[] = [
  { kind: 'horizontal', ru: 'По горизонтали', en: 'Horizontal', symbol: '—' },
  { kind: 'vertical', ru: 'По вертикали', en: 'Vertical', symbol: '|' },
  { kind: 'diagonal-down', ru: 'Диагональ вниз', en: 'Diagonal down', symbol: '\\' },
  { kind: 'diagonal-up', ru: 'Диагональ вверх', en: 'Diagonal up', symbol: '/' },
  { kind: 'quarters', ru: 'На четверти', en: 'Quarters', symbol: '田' },
  { kind: 'four-triangles', ru: '4 треугольника', en: '4 triangles', symbol: '◇' },
]

const cloneGroup = (group: DraftGroup): DraftGroup => ({
  ...group,
  shapes: group.shapes.map((shape) => ({
    ...shape,
    points: shape.points.map(([x, y]) => [x, y] as const),
  })),
})

const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot => ({
  ...snapshot,
  palette: [...snapshot.palette],
  groups: snapshot.groups.map(cloneGroup),
})

const groupId = (): string => `piece-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function groupsFromPattern(pattern: BlockPattern | undefined): DraftGroup[] {
  if (!pattern) return []
  const assigned = new Set<number>()
  const groups = pattern.editor?.groups.flatMap((savedGroup): DraftGroup[] => {
    const shapes = savedGroup.shapeIndices.flatMap((index) => {
      const shape = pattern.shapes[index]
      if (!shape || assigned.has(index)) return []
      assigned.add(index)
      return [{ ...shape, points: shape.points.map(([x, y]) => [x, y] as const) }]
    })
    return shapes.length > 0 ? [{ id: savedGroup.id, shapes }] : []
  }) ?? []
  pattern.shapes.forEach((shape, index) => {
    if (!assigned.has(index)) groups.push({ id: `source-${index}`, shapes: [{ ...shape, points: shape.points.map(([x, y]) => [x, y] as const) }] })
  })
  return groups
}

function flattenGroups(groups: readonly DraftGroup[]): { shapes: PatternShape[]; editor: BlockEditorData } {
  const shapes: PatternShape[] = []
  const savedGroups = groups.map((group) => {
    const start = shapes.length
    shapes.push(...group.shapes.map((shape) => ({
      ...shape,
      points: shape.points.map(([x, y]) => [x, y] as const),
    })))
    return { id: group.id, shapeIndices: Array.from({ length: group.shapes.length }, (_, index) => start + index) }
  })
  return { shapes, editor: { version: 1, gridDivisions: 8, groups: savedGroups } }
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function makePatternId(name: string, signature: string, sourceId?: string): string {
  const slug = name.toLocaleLowerCase('ru').normalize('NFKD').replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 28) || 'blok'
  const candidate = `custom-${slug}-${stableHash(signature)}`
  return candidate === sourceId ? `${candidate}-copy` : candidate
}

function colorTag(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
}

function transformAroundCanvas(group: DraftGroup, symmetry: Symmetry): DraftGroup[] {
  if (symmetry === 'none') return [group]
  const map = (suffix: string, point: (x: number, y: number) => readonly [number, number]): DraftGroup => ({
    id: `${group.id}-${suffix}`,
    shapes: group.shapes.map((shape) => ({
      ...shape,
      points: shape.points.map(([x, y]) => point(x, y)),
    })),
  })
  if (symmetry === 'mirror-x') return [group, map('mx', (x, y) => [1 - x, y])]
  if (symmetry === 'mirror-y') return [group, map('my', (x, y) => [x, 1 - y])]
  return [
    group,
    map('r90', (x, y) => [1 - y, x]),
    map('r180', (x, y) => [1 - x, 1 - y]),
    map('r270', (x, y) => [y, 1 - x]),
  ]
}

export function BlockEditorModal({ pattern, palette, onClose, onSave }: BlockEditorModalProps) {
  const { measurementSystem, text, patternName, lengthUnit, toDisplayLength, fromDisplayLength, formatLength } = usePreferences()
  const source = pattern as PatternWithDimensions | undefined
  const sourceName = pattern && !pattern.source ? patternName(String(pattern.id), pattern.name) : pattern?.name
  const [name, setName] = useState(pattern ? text(`${sourceName} — копия`, `${sourceName} — copy`) : text('Новый блок', 'New block'))
  const [width, setWidth] = useState(String(toDisplayLength(source?.widthCm ?? 25)))
  const [height, setHeight] = useState(String(toDisplayLength(source?.heightCm ?? 25)))
  const initialSnapshot = useMemo<EditorSnapshot>(() => ({
    background: pattern?.background ?? 0,
    groups: groupsFromPattern(pattern),
    palette: [...palette],
    gridDivisions: pattern?.editor?.gridDivisions ?? 8,
  }), [palette, pattern])
  const [history, setHistory] = useState<EditorHistory>({ past: [], present: initialSnapshot, future: [] })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedShape, setSelectedShape] = useState<{ groupId: string; index: number } | null>(null)
  const [activeColor, setActiveColor] = useState(palette[1] ? 1 : 0)
  const [newColor, setNewColor] = useState('#f4a261')
  const [symmetry, setSymmetry] = useState<Symmetry>('none')
  const [showGrid, setShowGrid] = useState(true)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const dialog = useRef<HTMLFormElement>(null)
  const drag = useRef<null | { x: number; y: number; before: EditorSnapshot; ids: string[] }>(null)

  const snapshot = history.present
  const selectedGroups = snapshot.groups.filter(({ id }) => selectedIds.includes(id))
  const primarySelection = selectedGroups[0]
  const selectedBounds = primarySelection ? groupBounds(primarySelection) : null
  const parsedWidth = Number(width.replace(',', '.'))
  const parsedHeight = Number(height.replace(',', '.'))
  const widthCm = fromDisplayLength(parsedWidth)
  const heightCm = fromDisplayLength(parsedHeight)
  const overlap = useMemo(() => hasPolygonOverlap(snapshot.groups), [snapshot.groups])
  const validationError = !name.trim()
    ? text('Введите название блока.', 'Enter a block name.')
    : !Number.isFinite(widthCm) || widthCm < 0.1 || widthCm > 1000
      ? text('Проверьте готовую ширину блока.', 'Check the finished block width.')
      : !Number.isFinite(heightCm) || heightCm < 0.1 || heightCm > 1000
        ? text('Проверьте готовую высоту блока.', 'Check the finished block height.')
        : overlap
          ? text('Детали перекрываются. Раздвиньте их перед сохранением.', 'Pieces overlap. Separate them before saving.')
          : ''

  const commit = (change: EditorSnapshot | ((current: EditorSnapshot) => EditorSnapshot)) => {
    setHistory((current) => {
      const next = typeof change === 'function' ? change(cloneSnapshot(current.present)) : change
      return { past: [...current.past, cloneSnapshot(current.present)].slice(-50), present: next, future: [] }
    })
  }

  const undo = () => setHistory((current) => {
    const previous = current.past.at(-1)
    return previous ? { past: current.past.slice(0, -1), present: cloneSnapshot(previous), future: [cloneSnapshot(current.present), ...current.future] } : current
  })
  const redo = () => setHistory((current) => {
    const next = current.future[0]
    return next ? { past: [...current.past, cloneSnapshot(current.present)], present: cloneSnapshot(next), future: current.future.slice(1) } : current
  })

  const replaceSelected = (transform: (group: DraftGroup) => DraftGroup) => commit((current) => ({
    ...current,
    groups: current.groups.map((group) => selectedIds.includes(group.id) ? transform(group) : group),
  }))

  const addPrimitive = (kind: PrimitiveKind) => {
    const base = createPrimitive(kind, activeColor, groupId())
    const additions = transformAroundCanvas(base, symmetry)
    commit((current) => ({ ...current, groups: [...current.groups, ...additions] }))
    setSelectedIds(additions.map(({ id }) => id))
    setSelectedShape(null)
  }

  const applyTemplate = (candidate: BlockPattern) => {
    commit((current) => ({ ...current, background: candidate.background, groups: groupsFromPattern(candidate) }))
    setSelectedIds([])
    setSelectedShape(null)
  }

  const recolor = (color: number) => {
    setActiveColor(color)
    if (selectedIds.length === 0) return
    commit((current) => ({
      ...current,
      groups: current.groups.map((group) => {
        if (!selectedIds.includes(group.id)) return group
        return {
          ...group,
          shapes: group.shapes.map((shape, index) => (
            selectedShape && selectedIds.length === 1 && selectedShape.groupId === group.id && selectedShape.index !== index
              ? shape
              : { ...shape, color }
          )),
        }
      }),
    }))
  }

  const duplicate = () => {
    if (selectedGroups.length === 0) return
    const copies = selectedGroups.map((group) => moveGroup({ ...cloneGroup(group), id: groupId() }, 1 / snapshot.gridDivisions, 1 / snapshot.gridDivisions, snapshot.gridDivisions))
    commit((current) => ({ ...current, groups: [...current.groups, ...copies] }))
    setSelectedIds(copies.map(({ id }) => id))
  }

  const removeSelected = () => {
    if (selectedIds.length === 0) return
    commit((current) => ({ ...current, groups: current.groups.filter(({ id }) => !selectedIds.includes(id)) }))
    setSelectedIds([])
    setSelectedShape(null)
  }

  const splitSelection = (kind: SplitKind) => {
    if (!primarySelection) {
      const canvas: DraftGroup = { id: groupId(), shapes: [{ color: activeColor, points: [[0, 0], [1, 0], [1, 1], [0, 1]] }] }
      const split = splitGroup(canvas, kind)
      commit((current) => ({ ...current, groups: [...current.groups, split] }))
      setSelectedIds([split.id])
      return
    }
    const split = splitGroup(primarySelection, kind)
    commit((current) => ({ ...current, groups: current.groups.map((group) => group.id === primarySelection.id ? split : group) }))
  }

  const beginDrag = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const nextSelection = selectedIds.includes(id)
      ? selectedIds
      : event.shiftKey
        ? [...selectedIds, id]
        : [id]
    const shapeIndex = Number((event.target as SVGPolygonElement).dataset.shapeIndex)
    setSelectedShape(Number.isInteger(shapeIndex) ? { groupId: id, index: shapeIndex } : null)
    setSelectedIds(nextSelection)
    drag.current = { x: event.clientX, y: event.clientY, before: cloneSnapshot(snapshot), ids: nextSelection }
  }

  const dragSelection = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = (event.clientX - drag.current.x) / rect.width
    const dy = (event.clientY - drag.current.y) / rect.height
    const ids = drag.current.ids
    setHistory((current) => ({
      ...current,
      present: {
        ...drag.current!.before,
        groups: drag.current!.before.groups.map((group) => ids.includes(group.id)
          ? moveGroup(group, dx, dy, snapshot.gridDivisions)
          : group),
      },
    }))
  }

  const endDrag = () => {
    if (!drag.current) return
    const before = drag.current.before
    drag.current = null
    setHistory((current) => ({ past: [...current.past, before].slice(-50), present: current.present, future: [] }))
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedIds.length > 0) setSelectedIds([])
        else onClose()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedIds.length > 0 && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
          event.preventDefault()
          removeSelected()
        }
        return
      }
      const step = 1 / snapshot.gridDivisions
      const direction = event.key === 'ArrowLeft'
        ? [-step, 0]
        : event.key === 'ArrowRight'
          ? [step, 0]
          : event.key === 'ArrowUp'
            ? [0, -step]
            : event.key === 'ArrowDown'
              ? [0, step]
              : null
      if (direction && selectedIds.length > 0 && !['INPUT', 'SELECT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault()
        replaceSelected((group) => moveGroup(group, direction[0], direction[1], snapshot.gridDivisions))
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const handleSave = () => {
    setSaveAttempted(true)
    if (validationError) return
    const flattened = flattenGroups(snapshot.groups)
    flattened.editor.gridDivisions = snapshot.gridDivisions
    const signature = JSON.stringify({ name: name.trim(), widthCm, heightCm, background: snapshot.background, shapes: flattened.shapes, editor: flattened.editor })
    onSave({
      id: makePatternId(name, signature, String(pattern?.id ?? '')),
      name: name.trim(),
      background: snapshot.background,
      shapes: flattened.shapes,
      editor: flattened.editor,
      source: 'custom',
      widthCm,
      heightCm,
    } as BlockPattern, snapshot.palette)
  }

  return (
    <div className="block-editor-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form ref={dialog} className="block-editor-dialog block-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="block-builder-title" onSubmit={(event) => { event.preventDefault(); handleSave() }}>
        <header className="block-builder-header">
          <div>
            <p>{text('Конструктор лоскутного блока', 'Quilt block builder')}</p>
            <h2 id="block-builder-title">{pattern ? text('Новый блок на основе выбранного', 'New block from selection') : text('Создать свой блок', 'Create a custom block')}</h2>
          </div>
          <div className="block-builder-history" aria-label={text('История изменений', 'Edit history')}>
            <button type="button" onClick={undo} disabled={history.past.length === 0}>↶ {text('Отменить', 'Undo')}</button>
            <button type="button" onClick={redo} disabled={history.future.length === 0}>↷ {text('Вернуть', 'Redo')}</button>
          </div>
          <button className="block-editor-close" type="button" onClick={onClose} aria-label={text('Закрыть', 'Close')}>×</button>
        </header>

        <div className="block-builder-body">
          <aside className="block-builder-toolbar" aria-label={text('Инструменты блока', 'Block tools')}>
            <section>
              <h3>{text('Начать с блока', 'Start from block')}</h3>
              <div className="block-builder-templates">
                {PATTERNS.filter(({ shapes }) => shapes.length > 0).map((candidate) => (
                  <button type="button" key={candidate.id} onClick={() => applyTemplate(candidate)} title={patternName(String(candidate.id), candidate.name)}>
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      <rect width="100" height="100" fill={snapshot.palette[candidate.background] ?? snapshot.palette[0]} />
                      {candidate.shapes.map((shape, index) => <polygon key={index} points={shape.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} fill={snapshot.palette[shape.color] ?? snapshot.palette[0]} />)}
                    </svg>
                    <span>{patternName(String(candidate.id), candidate.name)}</span>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h3>{text('Добавить единицу', 'Add unit')}</h3>
              <div className="block-builder-primitives">
                {PRIMITIVES.map((primitive) => <button type="button" key={primitive.kind} onClick={() => addPrimitive(primitive.kind)}><span aria-hidden="true">◇</span>{text(primitive.ru, primitive.en)}</button>)}
              </div>
            </section>
          </aside>

          <main className="block-builder-canvas-shell">
            <div className="block-builder-canvas-topbar">
              <label>{text('Сетка', 'Grid')}<select value={snapshot.gridDivisions} onChange={(event) => commit((current) => ({ ...current, gridDivisions: Number(event.target.value) }))}>{[2, 3, 4, 6, 8, 10, 12, 16, 24].map((value) => <option key={value} value={value}>{value} × {value}</option>)}</select></label>
              <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />{text('Показывать сетку', 'Show grid')}</label>
              <label>{text('Повтор', 'Repeat')}<select value={symmetry} onChange={(event) => setSymmetry(event.target.value as Symmetry)}><option value="none">{text('Нет', 'None')}</option><option value="mirror-x">{text('Зеркало слева/справа', 'Mirror left/right')}</option><option value="mirror-y">{text('Зеркало сверху/снизу', 'Mirror top/bottom')}</option><option value="rotate-4">{text('4 поворота', '4 rotations')}</option></select></label>
            </div>
            <svg className="block-builder-canvas" viewBox="0 0 100 100" preserveAspectRatio="none" onPointerMove={dragSelection} onPointerUp={endDrag} onPointerCancel={endDrag} aria-label={text('Холст блока', 'Block canvas')}>
              <rect width="100" height="100" fill={snapshot.palette[snapshot.background] ?? snapshot.palette[0]} onPointerDown={() => setSelectedIds([])} />
              {showGrid && <g className="block-builder-grid" aria-hidden="true">{Array.from({ length: snapshot.gridDivisions - 1 }, (_, index) => index + 1).flatMap((value) => [<line key={`v-${value}`} x1={value * 100 / snapshot.gridDivisions} x2={value * 100 / snapshot.gridDivisions} y1="0" y2="100" />, <line key={`h-${value}`} y1={value * 100 / snapshot.gridDivisions} y2={value * 100 / snapshot.gridDivisions} x1="0" x2="100" />])}</g>}
              {snapshot.groups.map((group) => (
                <g className={`block-builder-group${selectedIds.includes(group.id) ? ' block-builder-selection' : ''}`} key={group.id} role="button" tabIndex={0} onPointerDown={(event) => beginDrag(event, group.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedIds(event.shiftKey ? [...selectedIds, group.id] : [group.id]) }}>
                  {group.shapes.map((shape, index) => <polygon className={`block-builder-shape${selectedShape?.groupId === group.id && selectedShape.index === index ? ' is-selected' : ''}`} data-shape-index={index} key={index} points={shape.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} fill={snapshot.palette[shape.color] ?? snapshot.palette[0]} />)}
                </g>
              ))}
            </svg>
            <p className={`block-builder-status${overlap ? ' is-error' : ''}`} role="status">{overlap ? text('Есть перекрывающиеся детали.', 'Some pieces overlap.') : selectedIds.length > 0 ? text(`Выбрано деталей: ${selectedIds.length}`, `Selected pieces: ${selectedIds.length}`) : text('Выберите деталь или добавьте новую.', 'Select a piece or add a new one.')}</p>
          </main>

          <aside className="block-builder-inspector">
            <section>
              <h3>{text('Цвета и ткани', 'Colors and fabrics')}</h3>
              <div className="block-builder-palette">{snapshot.palette.map((color, index) => <button className={`block-builder-swatch${activeColor === index ? ' is-active' : ''}`} type="button" key={`${color}-${index}`} onClick={() => recolor(index)} aria-label={text(`Цвет ${colorTag(index)}`, `Color ${colorTag(index)}`)}><span style={{ backgroundColor: color }} />{colorTag(index)}</button>)}</div>
              <div className="block-builder-add-color"><input type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} aria-label={text('Новый цвет', 'New color')} /><button type="button" onClick={() => { const existing = snapshot.palette.findIndex((color) => color.toLowerCase() === newColor.toLowerCase()); if (existing >= 0) recolor(existing); else { commit((current) => ({ ...current, palette: [...current.palette, newColor] })); setActiveColor(snapshot.palette.length) } }}>{text('Добавить цвет', 'Add color')}</button></div>
              <button type="button" className="block-builder-background" onClick={() => commit((current) => ({ ...current, background: activeColor }))}>{text('Назначить цвет фону', 'Apply color to background')}</button>
            </section>

            <section>
              <h3>{text('Разделить деталь', 'Split piece')}</h3>
              <div className="block-builder-splits">{SPLITS.map((split) => <button type="button" key={split.kind} onClick={() => splitSelection(split.kind)} title={text(split.ru, split.en)}><b>{split.symbol}</b><span>{text(split.ru, split.en)}</span></button>)}</div>
            </section>

            <section>
              <h3>{text('Выбранные детали', 'Selected pieces')}</h3>
              <div className="block-builder-actions">
                <button type="button" onClick={duplicate} disabled={!primarySelection}>{text('Дублировать', 'Duplicate')}</button>
                <button type="button" onClick={() => replaceSelected((group) => rotateGroup(group, 45))} disabled={!primarySelection}>{text('Повернуть 45°', 'Rotate 45°')}</button>
                <button type="button" onClick={() => replaceSelected((group) => rotateGroup(group, 90))} disabled={!primarySelection}>{text('Повернуть 90°', 'Rotate 90°')}</button>
                <button type="button" onClick={() => replaceSelected((group) => flipGroup(group, 'horizontal'))} disabled={!primarySelection}>{text('Отразить ↔', 'Flip ↔')}</button>
                <button type="button" onClick={() => replaceSelected((group) => flipGroup(group, 'vertical'))} disabled={!primarySelection}>{text('Отразить ↕', 'Flip ↕')}</button>
                <button type="button" onClick={removeSelected} disabled={!primarySelection}>{text('Удалить', 'Delete')}</button>
              </div>
              {selectedBounds && <div className="block-builder-measurements"><label>X<input type="number" min="0" max="1" step="any" value={selectedBounds.x.toFixed(3)} onChange={(event) => replaceSelected((group) => moveGroup(group, Number(event.target.value) - groupBounds(group).x, 0, snapshot.gridDivisions))} /></label><label>Y<input type="number" min="0" max="1" step="any" value={selectedBounds.y.toFixed(3)} onChange={(event) => replaceSelected((group) => moveGroup(group, 0, Number(event.target.value) - groupBounds(group).y, snapshot.gridDivisions))} /></label><label>{text('Ширина', 'Width')}<input type="number" min="0.01" max="1" step="any" value={selectedBounds.width.toFixed(3)} onChange={(event) => replaceSelected((group) => resizeGroup(group, Number(event.target.value), groupBounds(group).height, snapshot.gridDivisions))} /></label><label>{text('Высота', 'Height')}<input type="number" min="0.01" max="1" step="any" value={selectedBounds.height.toFixed(3)} onChange={(event) => replaceSelected((group) => resizeGroup(group, groupBounds(group).width, Number(event.target.value), snapshot.gridDivisions))} /></label></div>}
            </section>

            <section className="block-builder-block-info">
              <h3>{text('Параметры блока', 'Block settings')}</h3>
              <label>{text('Название', 'Name')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
              <div><label>{text('Ширина', 'Width')}, {lengthUnit}<input type="number" min="0.1" max="1000" step={measurementSystem === 'metric' ? '0.1' : '0.01'} value={width} onChange={(event) => setWidth(event.target.value)} /></label><label>{text('Высота', 'Height')}, {lengthUnit}<input type="number" min="0.1" max="1000" step={measurementSystem === 'metric' ? '0.1' : '0.01'} value={height} onChange={(event) => setHeight(event.target.value)} /></label></div>
              <small>{Number.isFinite(widthCm) && Number.isFinite(heightCm) ? `${formatLength(widthCm)} × ${formatLength(heightCm)}` : '—'}</small>
            </section>
          </aside>
        </div>

        <footer className="block-builder-footer">
          <p className={saveAttempted && validationError ? 'is-error' : ''}>{saveAttempted && validationError ? validationError : text('Каждый жест можно отменить. Исходный библиотечный блок не изменится.', 'Every gesture can be undone. The source library block stays unchanged.')}</p>
          <div><button className="block-editor-secondary" type="button" onClick={onClose}>{text('Отмена', 'Cancel')}</button><button className="block-editor-primary" type="submit">{text('Сохранить как новый блок', 'Save as new block')}</button></div>
        </footer>
      </form>
    </div>
  )
}
