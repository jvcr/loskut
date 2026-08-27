import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import {
  calculateDetailedFabric,
  patternById,
  type BackingEstimate,
  type BindingEstimate,
  type BlockBreakdown,
  type CutPieceInstruction,
  type CuttingSummary,
  type DetailedFabricEstimate,
  type FabricDiagnostic,
  type QuiltDocument,
} from './editorModel'
import { usePreferences } from './i18n'
import './calculator.css'

export interface FabricCalculatorPanelProps {
  document: QuiltDocument
}

type TabId = 'blocks' | 'backing' | 'binding'

const TAB_IDS: readonly TabId[] = ['blocks', 'backing', 'binding']

function ColorSwatch({ color }: { color: string }) {
  return <span className="calculator-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
}

function Diagnostics({ diagnostics, document }: { diagnostics: readonly FabricDiagnostic[]; document: QuiltDocument }) {
  const { patternName, text } = usePreferences()
  if (diagnostics.length === 0) return null
  const hasWarning = diagnostics.some((diagnostic) => diagnostic.severity === 'warning')
  const messageFor = (diagnostic: FabricDiagnostic) => {
    if (!diagnostic.patternId) return diagnostic.message
    const sourceName = patternById(diagnostic.patternId, document.customPatterns).name
    const displayName = patternName(diagnostic.patternId, sourceName)
    return diagnostic.message.startsWith(`${sourceName}:`)
      ? `${displayName}${diagnostic.message.slice(sourceName.length)}`
      : diagnostic.message
  }
  return (
    <section
      className={`fabric-calculator__diagnostics${hasWarning ? ' has-warning' : ''}`}
      role={hasWarning ? 'alert' : 'status'}
      aria-live={hasWarning ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="calculator-diagnostics__heading">
        <span aria-hidden="true">{hasWarning ? '!' : 'i'}</span>
        <strong>{hasWarning
          ? text('Расчёт требует проверки', 'The estimate needs review')
          : text('Важные сведения о расчёте', 'Important estimate details')}</strong>
      </div>
      <ul>
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}-${diagnostic.patternId ?? index}`}>
            <span className={`calculator-diagnostic__level is-${diagnostic.severity}`}>
              {diagnostic.severity === 'warning'
                ? text('Проверьте вручную', 'Check manually')
                : text('Учтено моделью', 'Included in estimate')}
            </span>
            <span>{messageFor(diagnostic)}</span>
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
  const { formatArea, formatFabricLength, formatLength, text } = usePreferences()
  if (result.cutting.length === 0) {
    return (
      <section className="calculator-work-section" aria-labelledby="shopping-list-heading">
        <div className="calculator-work-section__heading">
          <div>
            <p className="calculator-section-kicker">{text('Сначала купите', 'First, buy')}</p>
            <h3 id="shopping-list-heading">{text('Список покупок', 'Shopping list')}</h3>
          </div>
        </div>
        <p className="calculator-empty">{text(
          'Для верха пока нет рассчитанных тканей. Проверьте сообщения расчёта и геометрию блоков.',
          'No fabrics have been calculated for the quilt top yet. Check the estimate messages and block geometry.',
        )}</p>
      </section>
    )
  }

  return (
    <section className="calculator-work-section" aria-labelledby="shopping-list-heading">
      <div className="calculator-work-section__heading">
        <div>
          <p className="calculator-section-kicker">{text('Сначала купите', 'First, buy')}</p>
          <h3 id="shopping-list-heading">{text('Список покупок', 'Shopping list')}</h3>
        </div>
        <span className="calculator-reserve">{text('Запас', 'Reserve')} {result.purchaseReservePercent}%</span>
      </div>
      <p className="calculator-work-section__intro">{text(
        '«Купить» — рекомендация модели с запасом и округлением до доступной длины ткани.',
        '“Buy” is the model recommendation including reserve and purchase-length rounding.',
      )}</p>

      <ol className="calculator-shopping-list">
        {result.cutting.map((summary) => {
          const visibleArea = result.topByColor.find((estimate) => estimate.paletteIndex === summary.paletteIndex)?.visibleAreaCm2
          return (
            <li className="calculator-purchase" key={summary.paletteIndex}>
              <div className="calculator-purchase__identity">
                <ColorSwatch color={summary.color} />
                <div>
                  <b>{text('Ткань', 'Fabric')} {summary.paletteIndex + 1}</b>
                  <span>{summary.pieces} {text('шт. деталей', 'pieces')}</span>
                </div>
              </div>
              <div className="calculator-purchase__amount">
                <span>{text('Купить', 'Buy')}</span>
                <strong>{formatFabricLength(summary.purchaseMeters)}</strong>
                <small>{text('расчётная раскладка', 'packed layout')} {formatLength(summary.packedLengthCm)}</small>
              </div>
              <dl className="calculator-purchase__facts">
                {visibleArea !== undefined && (
                  <div><dt>{text('В квилте', 'In quilt')}</dt><dd>{formatArea(visibleArea)}</dd></div>
                )}
                <div><dt>{text('Заготовки с припусками', 'Blanks with seam allowance')}</dt><dd>{formatArea(summary.cuttingAreaCm2)}</dd></div>
              </dl>
            </li>
          )
        })}
      </ol>

      <aside className="calculator-other-purchases" aria-label={text('Другие материалы', 'Other materials')}>
        <h4>{text('Также понадобится', 'You will also need')}</h4>
        <div>
          <span>{text('Изнаночная ткань', 'Backing fabric')}</span>
          <strong>{formatFabricLength(result.backing.fabricMeters)}</strong>
          <small>{result.backing.panels} {text('шт. полотнищ', 'panels')}</small>
        </div>
        <div>
          <span>{text('Окантовка', 'Binding')}</span>
          <strong>{formatFabricLength(result.binding.fabricMeters)}</strong>
          <small>{result.binding.strips} {text('шт. полос WOF', 'WOF strips')}</small>
        </div>
      </aside>
    </section>
  )
}

function PieceFacts({ piece }: { piece: CutPieceInstruction }) {
  const { formatLength, text } = usePreferences()
  const formatDimensions = (widthCm: number, heightCm: number) => `${formatLength(widthCm)} × ${formatLength(heightCm)}`

  if (piece.shape === 'triangle') {
    return (
      <dl className="calculator-cut-step__facts">
        <div><dt>{text('Заготовки', 'Blanks')}</dt><dd>{piece.rectanglesToCut} {text('шт.', 'pcs.')} · {formatDimensions(piece.cutWidthCm, piece.cutHeightCm)}</dd></div>
        <div><dt>{text('После диагонального разреза', 'After diagonal cutting')}</dt><dd>{piece.pieces} {text('шт.', 'pcs.')}</dd></div>
        <div><dt>{text('Готовая деталь', 'Finished piece')}</dt><dd>{formatDimensions(piece.finishedWidthCm, piece.finishedHeightCm)}</dd></div>
      </dl>
    )
  }

  if (piece.shape === 'template') {
    return (
      <dl className="calculator-cut-step__facts">
        <div><dt>{text('Вырезать по шаблону', 'Cut with template')}</dt><dd>{piece.pieces} {text('шт.', 'pcs.')}</dd></div>
        <div><dt>{text('Готовая деталь', 'Finished piece')}</dt><dd>{formatDimensions(piece.finishedWidthCm, piece.finishedHeightCm)}</dd></div>
        <div><dt>{text('Габарит шаблона с припуском', 'Template size with seam allowance')}</dt><dd>{formatDimensions(piece.cutWidthCm, piece.cutHeightCm)}</dd></div>
      </dl>
    )
  }

  return (
    <dl className="calculator-cut-step__facts">
      <div><dt>{text('Крой с припуском', 'Cut with seam allowance')}</dt><dd>{piece.pieces} {text('шт.', 'pcs.')} · {formatDimensions(piece.cutWidthCm, piece.cutHeightCm)}</dd></div>
      <div><dt>{text('Готовая деталь', 'Finished piece')}</dt><dd>{formatDimensions(piece.finishedWidthCm, piece.finishedHeightCm)}</dd></div>
    </dl>
  )
}

function FabricCutGroup({
  summary,
  pieces,
  fabricWidthCm,
  seamAllowanceCm,
}: {
  summary: CuttingSummary
  pieces: readonly CutPieceInstruction[]
  fabricWidthCm: number
  seamAllowanceCm: number
}) {
  const { formatArea, formatFabricLength, formatLength, patternName, text } = usePreferences()
  const formatDimensions = (widthCm: number, heightCm: number) => `${formatLength(widthCm)} × ${formatLength(heightCm)}`
  const shapeLabel = (shape: CutPieceInstruction['shape']) => ({
    square: text('Квадрат', 'Square'),
    rectangle: text('Прямоугольник', 'Rectangle'),
    triangle: text('Треугольник', 'Triangle'),
    template: text('По шаблону', 'Template'),
  })[shape]
  const cuttingInstruction = (piece: CutPieceInstruction) => {
    const dimensions = formatDimensions(piece.cutWidthCm, piece.cutHeightCm)
    const localizedPatternName = patternName(piece.patternId, piece.patternName)
    if (piece.shape === 'triangle') {
      return piece.pieces % 2 === 0
        ? text(
          `Выкроить ${piece.rectanglesToCut} прямоугольных заготовок ${dimensions}; разрезать каждую по диагонали — получится ${piece.pieces} треугольных деталей.`,
          `Cut ${piece.rectanglesToCut} rectangular blanks at ${dimensions}; cut each diagonally to make ${piece.pieces} triangular pieces.`,
        )
        : text(
          `Выкроить ${piece.rectanglesToCut} прямоугольных заготовок ${dimensions}; разрезать каждую по диагонали, использовать ${piece.pieces} из ${piece.rectanglesToCut * 2} треугольных деталей.`,
          `Cut ${piece.rectanglesToCut} rectangular blanks at ${dimensions}; cut each diagonally and use ${piece.pieces} of the ${piece.rectanglesToCut * 2} triangular pieces.`,
        )
    }
    if (piece.shape === 'template') {
      return text(
        `Подготовить ${piece.rectanglesToCut} прямоугольных заготовок ${dimensions}; выкроить ${piece.pieces} деталей по шаблону «${localizedPatternName}» с припуском ${formatLength(seamAllowanceCm)}.`,
        `Prepare ${piece.rectanglesToCut} rectangular blanks at ${dimensions}; cut ${piece.pieces} pieces with the “${localizedPatternName}” template, including a ${formatLength(seamAllowanceCm)} seam allowance.`,
      )
    }
    return text(
      `Выкроить ${piece.pieces} ${piece.shape === 'square' ? 'квадратных' : 'прямоугольных'} деталей ${dimensions}.`,
      `Cut ${piece.pieces} ${piece.shape === 'square' ? 'square' : 'rectangular'} pieces at ${dimensions}.`,
    )
  }

  return (
    <article className="calculator-cut-group">
      <header className="calculator-cut-group__heading">
        <div className="calculator-cut-group__identity">
          <ColorSwatch color={summary.color} />
          <div>
            <h4>{text('Ткань', 'Fabric')} {summary.paletteIndex + 1}</h4>
            <span>{summary.pieces} {text('шт. деталей', 'pieces')}</span>
          </div>
        </div>
        <strong>{formatFabricLength(summary.purchaseMeters)}</strong>
      </header>
      <dl className="calculator-cut-group__layout">
        <div><dt>{text('Рабочая ширина (WOF)', 'Usable width (WOF)')}</dt><dd>{formatLength(fabricWidthCm)}</dd></div>
        <div><dt>{text('Длина раскладки', 'Packed length')}</dt><dd>{formatLength(summary.packedLengthCm)}</dd></div>
        <div><dt>{text('Отход раскладки', 'Layout waste')}</dt><dd>{formatArea(summary.wasteAreaCm2)}</dd></div>
      </dl>
      {pieces.length > 0 ? (
        <ol className="calculator-cut-steps">
          {pieces.map((piece, index) => (
            <li key={`${piece.patternId}-${piece.shape}-${piece.paletteIndex}-${index}`}>
              <div className="calculator-cut-step__heading">
                <div>
                  <span className="calculator-shape-label">{shapeLabel(piece.shape)}</span>
                  <h5>{patternName(piece.patternId, piece.patternName)}</h5>
                </div>
              </div>
              <p>{cuttingInstruction(piece)}</p>
              <PieceFacts piece={piece} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="calculator-empty">{text(
          'Для этой ткани нет отдельных инструкций по деталям.',
          'There are no individual piece instructions for this fabric.',
        )}</p>
      )}
    </article>
  )
}

function CuttingGuide({ result }: { result: DetailedFabricEstimate }) {
  const { formatLength, text } = usePreferences()
  if (result.cutting.length === 0) {
    return (
      <section className="calculator-work-section" aria-labelledby="cutting-guide-heading">
        <div className="calculator-work-section__heading">
          <div>
            <p className="calculator-section-kicker">{text('Затем подготовьте детали', 'Then prepare the pieces')}</p>
            <h3 id="cutting-guide-heading">{text('Как резать', 'Cutting guide')}</h3>
          </div>
        </div>
        <p className="calculator-empty">{text(
          'Нет деталей для раскроя. Проверьте сообщения расчёта выше.',
          'There are no pieces to cut. Check the estimate messages above.',
        )}</p>
      </section>
    )
  }

  return (
    <section className="calculator-work-section" aria-labelledby="cutting-guide-heading">
      <div className="calculator-work-section__heading">
        <div>
          <p className="calculator-section-kicker">{text('Затем подготовьте детали', 'Then prepare the pieces')}</p>
          <h3 id="cutting-guide-heading">{text('Как резать', 'Cutting guide')}</h3>
        </div>
      </div>
      <div className="calculator-seam-banner">
        <span aria-hidden="true">↔</span>
        <div>
          <strong>{text('Припуск уже включён:', 'Seam allowance included:')} {formatLength(result.seamAllowanceCm)}</strong>
          <small>{text(
            'Все размеры кроя ниже указаны с припуском по каждой стороне.',
            'All cutting dimensions below include seam allowance on every side.',
          )}</small>
        </div>
      </div>
      <div className="calculator-cut-groups">
        {result.cutting.map((summary) => (
          <FabricCutGroup
            key={summary.paletteIndex}
            summary={summary}
            pieces={result.pieceInstructions.filter((piece) => piece.paletteIndex === summary.paletteIndex)}
            fabricWidthCm={result.fabricWidthCm}
            seamAllowanceCm={result.seamAllowanceCm}
          />
        ))}
      </div>
    </section>
  )
}

function Blocks({ blocks, palette }: { blocks: readonly BlockBreakdown[]; palette: readonly string[] }) {
  const { formatArea, language, patternName, text } = usePreferences()
  if (blocks.length === 0) return <p className="calculator-empty">{text(
    'В расчёте пока нет поддерживаемых блоков.',
    'There are no supported blocks in the estimate yet.',
  )}</p>
  return (
    <ul className="calculator-block-list">
      {blocks.map((block) => (
        <li className="calculator-detail-card" key={block.patternId}>
          <div className="calculator-detail-card__heading">
            <h4>{patternName(block.patternId, block.patternName)}</h4>
            <span>{block.count} {text('шт. блоков', 'blocks')}</span>
          </div>
          <ul className="calculator-color-fractions">
            {block.colors.map((color) => (
              <li key={color.paletteIndex}>
                <ColorSwatch color={palette[color.paletteIndex] ?? 'var(--panel)'} />
                <span>{text('Ткань', 'Fabric')} {color.paletteIndex + 1}</span>
                <small>{(color.areaRatio * 100).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 })}% · {formatArea(color.visibleAreaCm2)}</small>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function Backing({ estimate }: { estimate: BackingEstimate }) {
  const { formatFabricLength, formatLength, text } = usePreferences()
  const formatDimensions = (widthCm: number, heightCm: number) => `${formatLength(widthCm)} × ${formatLength(heightCm)}`
  return (
    <section className="calculator-detail-card">
      <div className="calculator-material-detail__buy">
        <span>{text('Купить изнаночной ткани', 'Buy backing fabric')}</span>
        <strong>{formatFabricLength(estimate.fabricMeters)}</strong>
      </div>
      <DefinitionList rows={[
        [text('Готовый квилт', 'Finished quilt'), formatDimensions(estimate.quiltWidthCm, estimate.quiltHeightCm)],
        [text('Деталь с запасом', 'Backing piece with extra'), formatDimensions(estimate.cutWidthCm, estimate.cutHeightCm)],
        [text('Полотнища', 'Panels'), `${estimate.panels} ${text('шт.', 'pcs.')}`],
        [text('Ширина полотнища', 'Panel width'), formatLength(estimate.panelWidthCm)],
        [text('Общая длина', 'Total length'), formatLength(estimate.totalLengthCm)],
      ]} />
      <p className="calculator-note">{text(
        'Стачайте полотнища по длинной стороне, затем выровняйте до размера детали с запасом.',
        'Join the panels along their long edges, then trim to the backing-piece size with extra.',
      )}</p>
    </section>
  )
}

function Binding({ estimate, fabricWidthCm }: { estimate: BindingEstimate; fabricWidthCm: number }) {
  const { formatFabricLength, formatLength, text } = usePreferences()
  return (
    <section className="calculator-detail-card">
      <div className="calculator-material-detail__buy">
        <span>{text('Купить ткани для окантовки', 'Buy binding fabric')}</span>
        <strong>{formatFabricLength(estimate.fabricMeters)}</strong>
      </div>
      <DefinitionList rows={[
        [text('Периметр квилта', 'Quilt perimeter'), formatLength(estimate.perimeterCm)],
        [text('Нужная длина окантовки', 'Required binding length'), formatLength(estimate.requiredLengthCm)],
        [text('Крой полос WOF', 'Cut WOF strips'), `${estimate.strips} ${text('шт.', 'pcs.')} × ${formatLength(estimate.stripWidthCm)}`],
        [text('Рабочая ширина ткани', 'Usable fabric width'), formatLength(fabricWidthCm)],
      ]} />
      <p className="calculator-note">{text(
        'WOF — полоса поперёк всей рабочей ширины ткани, от кромки до кромки.',
        'WOF is a strip cut across the full usable fabric width, from selvage to selvage.',
      )}</p>
    </section>
  )
}

export function FabricCalculatorPanel({ document }: FabricCalculatorPanelProps) {
  const { language, text } = usePreferences()
  const [activeTab, setActiveTab] = useState<TabId>('blocks')
  const tabGroupId = useId()
  const result = useMemo(() => calculateDetailedFabric(document, language), [document, language])
  const tabs: readonly { id: TabId; label: string }[] = TAB_IDS.map((id) => ({
    id,
    label: id === 'blocks'
      ? text('Блоки', 'Blocks')
      : id === 'backing'
        ? text('Изнанка', 'Backing')
        : text('Окантовка', 'Binding'),
  }))

  const selectTabFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return
    event.preventDefault()
    setActiveTab(tabs[nextIndex].id)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[nextIndex]?.focus()
  }

  return (
    <section className="fabric-calculator" aria-labelledby={`${tabGroupId}-heading`}>
      <header className="fabric-calculator__header">
        <p className="calculator-eyebrow">{text('План материалов и кроя', 'Materials and cutting plan')}</p>
        <h2 className="fabric-calculator__heading" id={`${tabGroupId}-heading`}>{text('Калькулятор ткани', 'Fabric calculator')}</h2>
        <p className="fabric-calculator__intro">{text(
          'Покупка и раскрой по вашему квилту — в порядке работы.',
          'Fabric purchases and cutting for your quilt, in working order.',
        )}</p>
      </header>

      <Diagnostics diagnostics={result.diagnostics} document={document} />
      <ShoppingList result={result} />
      <CuttingGuide result={result} />

      <section className="calculator-details" aria-labelledby={`${tabGroupId}-details-heading`}>
        <div className="calculator-details__heading">
          <p className="calculator-section-kicker">{text('Сверить расчёт', 'Review the estimate')}</p>
          <h3 id={`${tabGroupId}-details-heading`}>{text('Подробности', 'Details')}</h3>
        </div>
        <div className="fabric-calculator__tabs" role="tablist" aria-label={text('Подробности расчёта', 'Estimate details')}>
          {tabs.map((tab, index) => (
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
