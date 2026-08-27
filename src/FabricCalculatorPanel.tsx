import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import {
  calculateDetailedFabric,
  type BackingEstimate,
  type BindingEstimate,
  type BlockBreakdown,
  type CutPieceInstruction,
  type CuttingSummary,
  type DetailedFabricEstimate,
  type FabricDiagnostic,
  type QuiltDocument,
} from './editorModel'
import './calculator.css'

export interface FabricCalculatorPanelProps {
  document: QuiltDocument
}

type TabId = 'blocks' | 'backing' | 'binding'

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'blocks', label: 'Блоки' },
  { id: 'backing', label: 'Изнанка' },
  { id: 'binding', label: 'Окантовка' },
]

const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const areaFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const purchaseFormatter = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function formatCm(value: number): string {
  return `${numberFormatter.format(value)} см`
}

function formatDimensions(width: number, height: number): string {
  return `${numberFormatter.format(width)} × ${numberFormatter.format(height)} см`
}

function formatArea(value: number): string {
  return `${areaFormatter.format(value)} см²`
}

function formatExactMetersFromCm(value: number): string {
  return `${numberFormatter.format(value / 100)} м`
}

function formatPurchaseMeters(value: number): string {
  return `${purchaseFormatter.format(value)} м`
}

function ColorSwatch({ color }: { color: string }) {
  return <span className="calculator-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
}

function Diagnostics({ diagnostics }: { diagnostics: readonly FabricDiagnostic[] }) {
  if (diagnostics.length === 0) return null
  const hasWarning = diagnostics.some((diagnostic) => diagnostic.severity === 'warning')
  return (
    <section
      className={`fabric-calculator__diagnostics${hasWarning ? ' has-warning' : ''}`}
      role={hasWarning ? 'alert' : 'status'}
      aria-live={hasWarning ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="calculator-diagnostics__heading">
        <span aria-hidden="true">{hasWarning ? '!' : 'i'}</span>
        <strong>{hasWarning ? 'Расчёт требует проверки' : 'Важные сведения о расчёте'}</strong>
      </div>
      <ul>
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}-${diagnostic.patternId ?? index}`}>
            <span className={`calculator-diagnostic__level is-${diagnostic.severity}`}>
              {diagnostic.severity === 'warning' ? 'Проверьте вручную' : 'Учтено моделью'}
            </span>
            <span>{diagnostic.message}</span>
            <small>{diagnostic.code}{diagnostic.patternId ? ` · ${diagnostic.patternId}` : ''}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DefinitionList({ rows }: { rows: readonly [string, string | number][] }) {
  return (
    <dl className="calculator-definition">
      {rows.map(([label, value]) => (
        <div className="calculator-definition__row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ShoppingList({ result }: { result: DetailedFabricEstimate }) {
  if (result.cutting.length === 0) {
    return (
      <section className="calculator-work-section" aria-labelledby="shopping-list-heading">
        <div className="calculator-work-section__heading">
          <div>
            <p className="calculator-section-kicker">Сначала купите</p>
            <h3 id="shopping-list-heading">Список покупок</h3>
          </div>
        </div>
        <p className="calculator-empty">Для верха пока нет рассчитанных тканей. Проверьте сообщения расчёта и геометрию блоков.</p>
      </section>
    )
  }

  return (
    <section className="calculator-work-section" aria-labelledby="shopping-list-heading">
      <div className="calculator-work-section__heading">
        <div>
          <p className="calculator-section-kicker">Сначала купите</p>
          <h3 id="shopping-list-heading">Список покупок</h3>
        </div>
        <span className="calculator-reserve">Запас {numberFormatter.format(result.purchaseReservePercent)}%</span>
      </div>
      <p className="calculator-work-section__intro">
        «Купить» — рекомендация модели с запасом и округлением до ближайшего дециметра ткани.
      </p>

      <ol className="calculator-shopping-list">
        {result.cutting.map((summary) => {
          const visibleArea = result.topByColor.find((estimate) => estimate.paletteIndex === summary.paletteIndex)?.visibleAreaCm2
          return (
            <li className="calculator-purchase" key={summary.paletteIndex}>
              <div className="calculator-purchase__identity">
                <ColorSwatch color={summary.color} />
                <div>
                  <b>Ткань {summary.paletteIndex + 1}</b>
                  <span>{summary.pieces} шт. деталей</span>
                </div>
              </div>
              <div className="calculator-purchase__amount">
                <span>Купить</span>
                <strong>{formatPurchaseMeters(summary.purchaseMeters)}</strong>
                <small>расчётная раскладка {formatExactMetersFromCm(summary.packedLengthCm)}</small>
              </div>
              <dl className="calculator-purchase__facts">
                {visibleArea !== undefined && (
                  <div><dt>В квилте</dt><dd>{formatArea(visibleArea)}</dd></div>
                )}
                <div><dt>Заготовки с припусками</dt><dd>{formatArea(summary.cuttingAreaCm2)}</dd></div>
              </dl>
            </li>
          )
        })}
      </ol>

      <aside className="calculator-other-purchases" aria-label="Другие материалы">
        <h4>Также понадобится</h4>
        <div>
          <span>Изнаночная ткань</span>
          <strong>{formatPurchaseMeters(result.backing.fabricMeters)}</strong>
          <small>{result.backing.panels} шт. полотнищ</small>
        </div>
        <div>
          <span>Окантовка</span>
          <strong>{formatPurchaseMeters(result.binding.fabricMeters)}</strong>
          <small>{result.binding.strips} шт. полос WOF</small>
        </div>
      </aside>
    </section>
  )
}

const SHAPE_LABELS: Record<CutPieceInstruction['shape'], string> = {
  square: 'Квадрат',
  rectangle: 'Прямоугольник',
  triangle: 'Треугольник',
  template: 'По шаблону',
}

function PieceFacts({ piece }: { piece: CutPieceInstruction }) {
  if (piece.shape === 'triangle') {
    return (
      <dl className="calculator-cut-step__facts">
        <div><dt>Заготовки</dt><dd>{piece.rectanglesToCut} шт. · {formatDimensions(piece.cutWidthCm, piece.cutHeightCm)}</dd></div>
        <div><dt>После диагонального разреза</dt><dd>{piece.pieces} шт.</dd></div>
        <div><dt>Готовая деталь</dt><dd>{formatDimensions(piece.finishedWidthCm, piece.finishedHeightCm)}</dd></div>
      </dl>
    )
  }

  if (piece.shape === 'template') {
    return (
      <dl className="calculator-cut-step__facts">
        <div><dt>Вырезать по шаблону</dt><dd>{piece.pieces} шт.</dd></div>
        <div><dt>Готовая деталь</dt><dd>{formatDimensions(piece.finishedWidthCm, piece.finishedHeightCm)}</dd></div>
        <div><dt>Габарит шаблона с припуском</dt><dd>{formatDimensions(piece.cutWidthCm, piece.cutHeightCm)}</dd></div>
      </dl>
    )
  }

  return (
    <dl className="calculator-cut-step__facts">
      <div><dt>Крой с припуском</dt><dd>{piece.pieces} шт. · {formatDimensions(piece.cutWidthCm, piece.cutHeightCm)}</dd></div>
      <div><dt>Готовая деталь</dt><dd>{formatDimensions(piece.finishedWidthCm, piece.finishedHeightCm)}</dd></div>
    </dl>
  )
}

function FabricCutGroup({
  summary,
  pieces,
  fabricWidthCm,
}: {
  summary: CuttingSummary
  pieces: readonly CutPieceInstruction[]
  fabricWidthCm: number
}) {
  return (
    <article className="calculator-cut-group">
      <header className="calculator-cut-group__heading">
        <div className="calculator-cut-group__identity">
          <ColorSwatch color={summary.color} />
          <div>
            <h4>Ткань {summary.paletteIndex + 1}</h4>
            <span>{summary.pieces} шт. деталей</span>
          </div>
        </div>
        <strong>{formatPurchaseMeters(summary.purchaseMeters)}</strong>
      </header>
      <dl className="calculator-cut-group__layout">
        <div><dt>Рабочая ширина (WOF)</dt><dd>{formatCm(fabricWidthCm)}</dd></div>
        <div><dt>Длина раскладки</dt><dd>{formatCm(summary.packedLengthCm)}</dd></div>
        <div><dt>Отход раскладки</dt><dd>{formatArea(summary.wasteAreaCm2)}</dd></div>
      </dl>
      {pieces.length > 0 ? (
        <ol className="calculator-cut-steps">
          {pieces.map((piece, index) => (
            <li key={`${piece.patternId}-${piece.shape}-${piece.paletteIndex}-${index}`}>
              <div className="calculator-cut-step__heading">
                <div>
                  <span className="calculator-shape-label">{SHAPE_LABELS[piece.shape]}</span>
                  <h5>{piece.patternName}</h5>
                </div>
              </div>
              <p>{piece.instruction}</p>
              <PieceFacts piece={piece} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="calculator-empty">Для этой ткани нет отдельных инструкций по деталям.</p>
      )}
    </article>
  )
}

function CuttingGuide({ result }: { result: DetailedFabricEstimate }) {
  if (result.cutting.length === 0) {
    return (
      <section className="calculator-work-section" aria-labelledby="cutting-guide-heading">
        <div className="calculator-work-section__heading">
          <div>
            <p className="calculator-section-kicker">Затем подготовьте детали</p>
            <h3 id="cutting-guide-heading">Как резать</h3>
          </div>
        </div>
        <p className="calculator-empty">Нет деталей для раскроя. Проверьте сообщения расчёта выше.</p>
      </section>
    )
  }

  return (
    <section className="calculator-work-section" aria-labelledby="cutting-guide-heading">
      <div className="calculator-work-section__heading">
        <div>
          <p className="calculator-section-kicker">Затем подготовьте детали</p>
          <h3 id="cutting-guide-heading">Как резать</h3>
        </div>
      </div>
      <div className="calculator-seam-banner">
        <span aria-hidden="true">↔</span>
        <div>
          <strong>Припуск уже включён: {formatCm(result.seamAllowanceCm)}</strong>
          <small>Все размеры кроя ниже указаны с припуском по каждой стороне.</small>
        </div>
      </div>
      <div className="calculator-cut-groups">
        {result.cutting.map((summary) => (
          <FabricCutGroup
            key={summary.paletteIndex}
            summary={summary}
            pieces={result.pieceInstructions.filter((piece) => piece.paletteIndex === summary.paletteIndex)}
            fabricWidthCm={result.fabricWidthCm}
          />
        ))}
      </div>
    </section>
  )
}

function Blocks({ blocks, palette }: { blocks: readonly BlockBreakdown[]; palette: readonly string[] }) {
  if (blocks.length === 0) return <p className="calculator-empty">В расчёте пока нет поддерживаемых блоков.</p>
  return (
    <ul className="calculator-block-list">
      {blocks.map((block) => (
        <li className="calculator-detail-card" key={block.patternId}>
          <div className="calculator-detail-card__heading">
            <h4>{block.patternName}</h4>
            <span>{block.count} шт. блоков</span>
          </div>
          <ul className="calculator-color-fractions">
            {block.colors.map((color) => (
              <li key={color.paletteIndex}>
                <ColorSwatch color={palette[color.paletteIndex] ?? 'var(--panel)'} />
                <span>Ткань {color.paletteIndex + 1}</span>
                <small>{numberFormatter.format(color.areaRatio * 100)}% · {formatArea(color.visibleAreaCm2)}</small>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function Backing({ estimate }: { estimate: BackingEstimate }) {
  return (
    <section className="calculator-detail-card">
      <div className="calculator-material-detail__buy">
        <span>Купить изнаночной ткани</span>
        <strong>{formatPurchaseMeters(estimate.fabricMeters)}</strong>
      </div>
      <DefinitionList rows={[
        ['Готовый квилт', formatDimensions(estimate.quiltWidthCm, estimate.quiltHeightCm)],
        ['Деталь с запасом', formatDimensions(estimate.cutWidthCm, estimate.cutHeightCm)],
        ['Полотнища', `${estimate.panels} шт.`],
        ['Ширина полотнища', formatCm(estimate.panelWidthCm)],
        ['Общая длина', formatCm(estimate.totalLengthCm)],
      ]} />
      <p className="calculator-note">Стачайте полотнища по длинной стороне, затем выровняйте до размера детали с запасом.</p>
    </section>
  )
}

function Binding({ estimate, fabricWidthCm }: { estimate: BindingEstimate; fabricWidthCm: number }) {
  return (
    <section className="calculator-detail-card">
      <div className="calculator-material-detail__buy">
        <span>Купить ткани для окантовки</span>
        <strong>{formatPurchaseMeters(estimate.fabricMeters)}</strong>
      </div>
      <DefinitionList rows={[
        ['Периметр квилта', formatCm(estimate.perimeterCm)],
        ['Нужная длина окантовки', formatCm(estimate.requiredLengthCm)],
        ['Крой полос WOF', `${estimate.strips} шт. × ${formatCm(estimate.stripWidthCm)}`],
        ['Рабочая ширина ткани', formatCm(fabricWidthCm)],
      ]} />
      <p className="calculator-note">WOF — полоса поперёк всей рабочей ширины ткани, от кромки до кромки.</p>
    </section>
  )
}

export function FabricCalculatorPanel({ document }: FabricCalculatorPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('blocks')
  const tabGroupId = useId()
  const result = useMemo(() => calculateDetailedFabric(document), [document])

  const selectTabFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1
    else return
    event.preventDefault()
    setActiveTab(TABS[nextIndex].id)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[nextIndex]?.focus()
  }

  return (
    <section className="fabric-calculator" aria-labelledby={`${tabGroupId}-heading`}>
      <header className="fabric-calculator__header">
        <p className="calculator-eyebrow">План материалов и кроя</p>
        <h2 className="fabric-calculator__heading" id={`${tabGroupId}-heading`}>Калькулятор ткани</h2>
        <p className="fabric-calculator__intro">Покупка и раскрой по вашему квилту — в порядке работы.</p>
      </header>

      <Diagnostics diagnostics={result.diagnostics} />
      <ShoppingList result={result} />
      <CuttingGuide result={result} />

      <section className="calculator-details" aria-labelledby={`${tabGroupId}-details-heading`}>
        <div className="calculator-details__heading">
          <p className="calculator-section-kicker">Сверить расчёт</p>
          <h3 id={`${tabGroupId}-details-heading`}>Подробности</h3>
        </div>
        <div className="fabric-calculator__tabs" role="tablist" aria-label="Подробности расчёта">
          {TABS.map((tab, index) => (
            <button
              className="fabric-calculator__tab"
              id={`${tabGroupId}-tab-${tab.id}`}
              key={tab.id}
              type="button"
              role="tab"
              aria-controls={`${tabGroupId}-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => selectTabFromKeyboard(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          className="fabric-calculator__tabpanel"
          id={`${tabGroupId}-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`${tabGroupId}-tab-${activeTab}`}
          tabIndex={0}
        >
          {activeTab === 'blocks' && <Blocks blocks={result.blockBreakdown} palette={document.palette} />}
          {activeTab === 'backing' && <Backing estimate={result.backing} />}
          {activeTab === 'binding' && <Binding estimate={result.binding} fabricWidthCm={result.fabricWidthCm} />}
        </div>
      </section>
    </section>
  )
}

export default FabricCalculatorPanel
