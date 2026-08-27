import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { type BlockEditorData, type BlockPattern, type PatternShape } from './editorModel'
import { splitGroupsBySeam, type DraftGroup, type SeamPoint } from './blockEditorGeometry'
import { usePreferences } from './i18n'
import './block-editor.css'

export interface BlockEditorModalProps {
  pattern?: BlockPattern
  palette: readonly string[]
  onClose(): void
  onSave(pattern: BlockPattern, palette: readonly string[]): void
}

type PatternWithDimensions = BlockPattern & { widthCm?: number; heightCm?: number }
type Tool = 'seam' | 'color'
type Symmetry = 'none' | 'mirror-x' | 'mirror-y' | 'rotate-4'
type Snapshot = { background: number; groups: DraftGroup[]; palette: string[]; gridDivisions: number }
type History = { past: Snapshot[]; present: Snapshot; future: Snapshot[] }
type Preset = 'blank' | 'hst' | 'qst' | 'flying-geese' | 'nine-patch' | 'pinwheel'

const PRESETS: readonly { id: Preset; ru: string; en: string }[] = [
  { id: 'blank', ru: 'Пустой блок', en: 'Blank block' },
  { id: 'hst', ru: 'Два треугольника', en: 'Half-square triangles' },
  { id: 'qst', ru: 'Четыре треугольника', en: 'Quarter-square triangles' },
  { id: 'flying-geese', ru: 'Летящий гусь', en: 'Flying Geese' },
  { id: 'nine-patch', ru: 'Девять лоскутов', en: 'Nine Patch' },
  { id: 'pinwheel', ru: 'Вертушка', en: 'Pinwheel' },
]

const point = (x: number, y: number): readonly [number, number] => [x, y]
const shape = (color: number, points: readonly (readonly [number, number])[]): PatternShape => ({ color, points })
const region = (id: string, color: number, points: readonly (readonly [number, number])[]): DraftGroup => ({ id, shapes: [shape(color, points)] })
const squarePoints = (left: number, top: number, right: number, bottom: number) => [point(left, top), point(right, top), point(right, bottom), point(left, bottom)] as const

function presetGroups(preset: Preset): DraftGroup[] {
  if (preset === 'blank') return [region('region-1', 0, squarePoints(0, 0, 1, 1))]
  if (preset === 'hst') return [
    region('region-1', 1, [point(0, 0), point(1, 0), point(1, 1)]),
    region('region-2', 0, [point(0, 0), point(1, 1), point(0, 1)]),
  ]
  if (preset === 'qst') return [
    region('region-1', 1, [point(0, 0), point(1, 0), point(0.5, 0.5)]),
    region('region-2', 2, [point(1, 0), point(1, 1), point(0.5, 0.5)]),
    region('region-3', 1, [point(1, 1), point(0, 1), point(0.5, 0.5)]),
    region('region-4', 0, [point(0, 1), point(0, 0), point(0.5, 0.5)]),
  ]
  if (preset === 'flying-geese') return [
    region('region-1', 0, [point(0, 0), point(0.5, 0), point(0, 1)]),
    region('region-2', 1, [point(0, 1), point(0.5, 0), point(1, 1)]),
    region('region-3', 0, [point(0.5, 0), point(1, 0), point(1, 1)]),
  ]
  if (preset === 'nine-patch') {
    return Array.from({ length: 9 }, (_, index) => {
      const row = Math.floor(index / 3)
      const column = index % 3
      return region(`region-${index + 1}`, (row + column) % 2 === 0 ? 1 : 0, squarePoints(column / 3, row / 3, (column + 1) / 3, (row + 1) / 3))
    })
  }
  const center = point(0.5, 0.5)
  const boundary = [point(0, 0), point(0.5, 0), point(1, 0), point(1, 0.5), point(1, 1), point(0.5, 1), point(0, 1), point(0, 0.5)]
  return boundary.map((start, index) => region(`region-${index + 1}`, index % 2 === 0 ? 1 : 0, [start, boundary[(index + 1) % boundary.length], center]))
}

function cloneGroup(group: DraftGroup): DraftGroup {
  return { ...group, shapes: group.shapes.map((item) => ({ ...item, points: item.points.map(([x, y]) => [x, y] as const) })) }
}

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return { ...snapshot, palette: [...snapshot.palette], groups: snapshot.groups.map(cloneGroup) }
}

function groupsFromPattern(pattern: BlockPattern | undefined): DraftGroup[] {
  if (!pattern) return presetGroups('blank')
  return pattern.shapes.map((item, index) => ({
    id: pattern.editor?.groups.find((group) => group.shapeIndices.includes(index))?.id ?? `region-${index + 1}`,
    shapes: [{ ...item, points: item.points.map(([x, y]) => [x, y] as const) }],
  }))
}

function flattenGroups(groups: readonly DraftGroup[], gridDivisions: number): { shapes: PatternShape[]; editor: BlockEditorData } {
  const shapes = groups.flatMap((group) => group.shapes.map((item) => ({ ...item, points: item.points.map(([x, y]) => [x, y] as const) })))
  let index = 0
  const savedGroups = groups.map((group) => {
    const shapeIndices = Array.from({ length: group.shapes.length }, () => index++)
    return { id: group.id, shapeIndices }
  })
  return { shapes, editor: { version: 1, gridDivisions, groups: savedGroups } }
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

function symmetricSeams(start: SeamPoint, end: SeamPoint, symmetry: Symmetry): [SeamPoint, SeamPoint][] {
  const transform = (pointValue: SeamPoint, kind: Symmetry, turns = 0): SeamPoint => {
    if (kind === 'mirror-x') return { x: 1 - pointValue.x, y: pointValue.y }
    if (kind === 'mirror-y') return { x: pointValue.x, y: 1 - pointValue.y }
    let result = pointValue
    for (let index = 0; index < turns; index += 1) result = { x: 1 - result.y, y: result.x }
    return result
  }
  if (symmetry === 'none') return [[start, end]]
  if (symmetry === 'mirror-x' || symmetry === 'mirror-y') return [[start, end], [transform(start, symmetry), transform(end, symmetry)]]
  return [0, 1, 2, 3].map((turns) => [transform(start, 'rotate-4', turns), transform(end, 'rotate-4', turns)])
}

export function BlockEditorModal({ pattern, palette, onClose, onSave }: BlockEditorModalProps) {
  const { measurementSystem, text, patternName, lengthUnit, toDisplayLength, fromDisplayLength, formatLength } = usePreferences()
  const source = pattern as PatternWithDimensions | undefined
  const sourceName = pattern && !pattern.source ? patternName(String(pattern.id), pattern.name) : pattern?.name
  const [name, setName] = useState(pattern ? text(`${sourceName} — копия`, `${sourceName} — copy`) : text('Новый блок', 'New block'))
  const [width, setWidth] = useState(String(toDisplayLength(source?.widthCm ?? 25)))
  const [height, setHeight] = useState(String(toDisplayLength(source?.heightCm ?? 25)))
  const initialSnapshot = useMemo<Snapshot>(() => ({ background: pattern?.background ?? 0, groups: groupsFromPattern(pattern), palette: [...palette], gridDivisions: pattern?.editor?.gridDivisions ?? 8 }), [palette, pattern])
  const [history, setHistory] = useState<History>({ past: [], present: initialSnapshot, future: [] })
  const [tool, setTool] = useState<Tool>('seam')
  const [symmetry, setSymmetry] = useState<Symmetry>('none')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeColor, setActiveColor] = useState(palette[1] ? 1 : 0)
  const [newColor, setNewColor] = useState('#f4a261')
  const [showGrid, setShowGrid] = useState(true)
  const [seamStart, setSeamStart] = useState<SeamPoint | null>(null)
  const [seamEnd, setSeamEnd] = useState<SeamPoint | null>(null)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const canvas = useRef<SVGSVGElement>(null)

  const snapshot = history.present
  const parsedWidth = Number(width.replace(',', '.'))
  const parsedHeight = Number(height.replace(',', '.'))
  const widthCm = fromDisplayLength(parsedWidth)
  const heightCm = fromDisplayLength(parsedHeight)
  const validationError = !name.trim()
    ? text('Введите название блока.', 'Enter a block name.')
    : !Number.isFinite(widthCm) || widthCm < 0.1 || widthCm > 1000
      ? text('Проверьте готовую ширину.', 'Check the finished width.')
      : !Number.isFinite(heightCm) || heightCm < 0.1 || heightCm > 1000
        ? text('Проверьте готовую высоту.', 'Check the finished height.')
        : snapshot.groups.length === 0
          ? text('В блоке должна остаться хотя бы одна деталь.', 'The block must contain at least one region.')
          : ''

  const commit = (change: Snapshot | ((current: Snapshot) => Snapshot)) => setHistory((current) => {
    const next = typeof change === 'function' ? change(cloneSnapshot(current.present)) : change
    return { past: [...current.past, cloneSnapshot(current.present)].slice(-50), present: next, future: [] }
  })
  const undo = () => setHistory((current) => {
    const previous = current.past.at(-1)
    return previous ? { past: current.past.slice(0, -1), present: cloneSnapshot(previous), future: [cloneSnapshot(current.present), ...current.future] } : current
  })
  const redo = () => setHistory((current) => {
    const next = current.future[0]
    return next ? { past: [...current.past, cloneSnapshot(current.present)], present: cloneSnapshot(next), future: current.future.slice(1) } : current
  })

  const canvasPoint = (event: ReactPointerEvent<SVGSVGElement>): SeamPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    const step = 1 / snapshot.gridDivisions
    return {
      x: Math.max(0, Math.min(1, Math.round(((event.clientX - rect.left) / rect.width) / step) * step)),
      y: Math.max(0, Math.min(1, Math.round(((event.clientY - rect.top) / rect.height) / step) * step)),
    }
  }

  const startSeam = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool !== 'seam') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = canvasPoint(event)
    setSeamStart(start)
    setSeamEnd(start)
  }
  const previewSeam = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === 'seam' && seamStart) setSeamEnd(canvasPoint(event))
  }
  const finishSeam = () => {
    if (!seamStart || !seamEnd) return
    commit((current) => {
      let groups = current.groups
      for (const [start, end] of symmetricSeams(seamStart, seamEnd, symmetry)) groups = splitGroupsBySeam(groups, start, end)
      return { ...current, groups }
    })
    setSeamStart(null)
    setSeamEnd(null)
  }

  const applyPreset = (preset: Preset) => {
    commit((current) => ({ ...current, groups: presetGroups(preset), background: 0 }))
    setSelectedId(null)
  }
  const recolor = (index: number) => {
    setActiveColor(index)
    if (!selectedId) return
    commit((current) => ({ ...current, groups: current.groups.map((group) => group.id === selectedId ? { ...group, shapes: group.shapes.map((item) => ({ ...item, color: index })) } : group) }))
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (seamStart) { setSeamStart(null); setSeamEnd(null) }
        else if (selectedId) setSelectedId(null)
        else onClose()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); event.shiftKey ? redo() : undo()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); redo()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const handleSave = () => {
    setSaveAttempted(true)
    if (validationError) return
    const flattened = flattenGroups(snapshot.groups, snapshot.gridDivisions)
    const signature = JSON.stringify({ name: name.trim(), widthCm, heightCm, background: snapshot.background, ...flattened })
    onSave({ id: makePatternId(name, signature, String(pattern?.id ?? '')), name: name.trim(), background: snapshot.background, shapes: flattened.shapes, editor: flattened.editor, source: 'custom', widthCm, heightCm }, snapshot.palette)
  }

  return (
    <div className="block-editor-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="block-editor-dialog seam-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="seam-editor-title" onSubmit={(event) => { event.preventDefault(); handleSave() }}>
        <header className="seam-editor-header">
          <div><p>{text('Чертёж блока', 'Block drafting')}</p><h2 id="seam-editor-title">{pattern ? text('Создать копию блока', 'Create a block copy') : text('Новый лоскутный блок', 'New quilt block')}</h2></div>
          <div className="seam-editor-history"><button type="button" onClick={undo} disabled={!history.past.length}>↶ {text('Отменить', 'Undo')}</button><button type="button" onClick={redo} disabled={!history.future.length}>↷ {text('Вернуть', 'Redo')}</button></div>
          <button className="block-editor-close" type="button" onClick={onClose} aria-label={text('Закрыть', 'Close')}>×</button>
        </header>

        <div className="seam-editor-body">
          <aside className="seam-editor-sidebar">
            <section><h3>{text('Основа блока', 'Block foundation')}</h3><p>{text('Выберите готовое разбиение или начните с цельного квадрата.', 'Choose a starting partition or begin with a whole square.')}</p><div className="seam-editor-presets">{PRESETS.map((preset) => { const preview = presetGroups(preset.id); return <button className="seam-editor-preset" type="button" key={preset.id} onClick={() => applyPreset(preset.id)}><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill={snapshot.palette[0]} />{preview.flatMap((group) => group.shapes.map((item, index) => <polygon key={`${group.id}-${index}`} points={item.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} fill={snapshot.palette[item.color] ?? snapshot.palette[0]} />))}</svg><span>{text(preset.ru, preset.en)}</span></button> })}</div></section>
            <section><h3>{text('Инструмент', 'Tool')}</h3><div className="seam-editor-tools"><button className={`seam-editor-tool${tool === 'seam' ? ' is-active' : ''}`} type="button" onClick={() => setTool('seam')} aria-pressed={tool === 'seam'}><b>╱</b><span>{text('Провести шов', 'Draw seam')}</span></button><button className={`seam-editor-tool${tool === 'color' ? ' is-active' : ''}`} type="button" onClick={() => setTool('color')} aria-pressed={tool === 'color'}><b>●</b><span>{text('Выбрать деталь', 'Select region')}</span></button></div></section>
          </aside>

          <main className="seam-editor-canvas-panel">
            <div className="seam-editor-topbar"><label>{text('Сетка', 'Grid')}<select value={snapshot.gridDivisions} onChange={(event) => commit((current) => ({ ...current, gridDivisions: Number(event.target.value) }))}>{[2, 3, 4, 6, 8, 10, 12, 16, 24].map((value) => <option key={value} value={value}>{value} × {value}</option>)}</select></label><label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />{text('Показывать', 'Show')}</label><label>{text('Симметрия шва', 'Seam symmetry')}<select value={symmetry} onChange={(event) => setSymmetry(event.target.value as Symmetry)}><option value="none">{text('Нет', 'None')}</option><option value="mirror-x">{text('Зеркало ↔', 'Mirror ↔')}</option><option value="mirror-y">{text('Зеркало ↕', 'Mirror ↕')}</option><option value="rotate-4">{text('4 поворота', '4 rotations')}</option></select></label></div>
            <svg ref={canvas} className="seam-editor-canvas" viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={startSeam} onPointerMove={previewSeam} onPointerUp={finishSeam} onPointerCancel={() => { setSeamStart(null); setSeamEnd(null) }} aria-label={text('Чертёж блока: проведите шов между точками сетки', 'Block drafting canvas: draw a seam between grid points')}>
              <rect width="100" height="100" fill={snapshot.palette[snapshot.background] ?? snapshot.palette[0]} />
              {snapshot.groups.map((group) => group.shapes.map((item, index) => <polygon className={`seam-editor-region${selectedId === group.id ? ' seam-editor-region--selected' : ''}`} key={`${group.id}-${index}`} points={item.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} fill={snapshot.palette[item.color] ?? snapshot.palette[0]} role="button" tabIndex={0} onPointerDown={(event) => { if (tool === 'color') { event.stopPropagation(); setSelectedId(group.id) } }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(group.id) }} aria-label={text(`Деталь, цвет ${colorTag(item.color)}`, `Region, color ${colorTag(item.color)}`)} />))}
              {showGrid && <g className="seam-editor-grid" aria-hidden="true">{Array.from({ length: snapshot.gridDivisions - 1 }, (_, index) => index + 1).flatMap((value) => [<line key={`v-${value}`} x1={value * 100 / snapshot.gridDivisions} x2={value * 100 / snapshot.gridDivisions} y1="0" y2="100" />, <line key={`h-${value}`} y1={value * 100 / snapshot.gridDivisions} y2={value * 100 / snapshot.gridDivisions} x1="0" x2="100" />])}</g>}
              {seamStart && seamEnd && <><line className="seam-editor-seam-preview" x1={seamStart.x * 100} y1={seamStart.y * 100} x2={seamEnd.x * 100} y2={seamEnd.y * 100} /><circle className="seam-editor-snap-point" cx={seamStart.x * 100} cy={seamStart.y * 100} r="1.4" /><circle className="seam-editor-snap-point" cx={seamEnd.x * 100} cy={seamEnd.y * 100} r="1.4" /></>}
            </svg>
            <p className="seam-editor-status" role="status">{tool === 'seam' ? text('Проведите линию от одной точки сетки к другой. Все пересечённые детали разделятся.', 'Draw from one grid point to another. Every crossed region will split.') : selectedId ? text('Деталь выбрана — назначьте ей цвет.', 'Region selected—assign a color.') : text('Нажмите на деталь для перекраски.', 'Select a region to recolor it.')}</p>
          </main>

          <aside className="seam-editor-inspector">
            <section><h3>{text('Цвет детали', 'Region color')}</h3><div className="seam-editor-palette">{snapshot.palette.map((color, index) => <button className={`seam-editor-swatch${activeColor === index ? ' is-active' : ''}`} type="button" key={`${color}-${index}`} onClick={() => recolor(index)} aria-label={text(`Цвет ${colorTag(index)}`, `Color ${colorTag(index)}`)}><span style={{ backgroundColor: color }} />{colorTag(index)}</button>)}</div><div className="seam-editor-add-color"><input type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} aria-label={text('Новый цвет', 'New color')} /><button type="button" onClick={() => { const existing = snapshot.palette.findIndex((color) => color.toLowerCase() === newColor.toLowerCase()); if (existing >= 0) recolor(existing); else { commit((current) => ({ ...current, palette: [...current.palette, newColor] })); setActiveColor(snapshot.palette.length) } }}>{text('Добавить цвет', 'Add color')}</button></div><button className="seam-editor-background" type="button" onClick={() => commit((current) => ({ ...current, background: activeColor }))}>{text('Назначить цвет фону', 'Apply color to background')}</button></section>
            <section><h3>{text('Параметры блока', 'Block settings')}</h3><div className="seam-editor-fields"><label>{text('Название', 'Name')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label><div><label>{text('Ширина', 'Width')}, {lengthUnit}<input type="number" min="0.1" max="1000" step={measurementSystem === 'metric' ? '0.1' : '0.01'} value={width} onChange={(event) => setWidth(event.target.value)} /></label><label>{text('Высота', 'Height')}, {lengthUnit}<input type="number" min="0.1" max="1000" step={measurementSystem === 'metric' ? '0.1' : '0.01'} value={height} onChange={(event) => setHeight(event.target.value)} /></label></div><small>{Number.isFinite(widthCm) && Number.isFinite(heightCm) ? `${formatLength(widthCm)} × ${formatLength(heightCm)}` : '—'}</small></div></section>
          </aside>
        </div>

        <footer className="seam-editor-footer"><p className={saveAttempted && validationError ? 'is-error' : ''}>{saveAttempted && validationError ? validationError : text('Швы образуют реальные независимые детали без наложений.', 'Seams create real independent regions without overlaps.')}</p><div><button className="block-editor-secondary" type="button" onClick={onClose}>{text('Отмена', 'Cancel')}</button><button className="block-editor-primary" type="submit">{text('Сохранить новый блок', 'Save new block')}</button></div></footer>
      </form>
    </div>
  )
}
