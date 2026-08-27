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
import type { FlyingGeeseMethod } from './cuttingRecipes'
import { usePreferences } from './i18n'
import './calculator.css'

export interface FabricCalculatorPanelProps {
  document: QuiltDocument
}

type TabId = 'blocks' | 'backing' | 'binding'

const TAB_IDS: readonly TabId[] = ['blocks', 'backing', 'binding']

const FLYING_GEESE_PATTERN_IDS: Record<string, true> = {
  'flying-geese': true,
  'sawtooth-star': true,
  'dutchmans-puzzle': true,
}

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
        'Количество ткани рассчитано по фактическим заготовкам для выбранных методов сборки; «Купить» включает отходы раскладки, запас и округление до доступной длины.',
        'Fabric quantities are based on the actual blanks required by the selected construction methods; “Buy” includes layout offcuts, reserve, and purchase-length rounding.',
      )}</p>

      <ol className="calculator-shopping-list">
        {result.cutting.map((summary) => {
          const visibleArea = result.topByColor.find((estimate) => estimate.paletteIndex === summary.paletteIndex)?.visibleAreaCm2
          const blankCount = result.pieceInstructions
            .filter((piece) => piece.paletteIndex === summary.paletteIndex)
            .reduce((total, piece) => total + piece.rectanglesToCut, 0)
          return (
            <li className="calculator-purchase" key={summary.paletteIndex}>
              <div className="calculator-purchase__identity">
                <ColorSwatch color={summary.color} />
                <div>
                  <b>{text('Ткань', 'Fabric')} {summary.paletteIndex + 1}</b>
                  <span>{blankCount} {text('шт. заготовок для кроя', 'cut blanks')}</span>
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

type ConstructionMethod = DetailedFabricEstimate['constructionMethods'][number]['method']

function ConstructionMethods({ result }: { result: DetailedFabricEstimate }) {
  const { patternName, text } = usePreferences()
  if (result.constructionMethods.length === 0) return null

  const methodName = (method: ConstructionMethod) => ({
    direct: text('Прямой крой', 'Direct cutting'),
    'strip-piecing': text('Сборка из полос', 'Strip piecing'),
    'hst-two-at-a-time': text('HST: две за раз', 'HST: two at a time'),
    'qst-two-at-a-time': text('QST: две за раз', 'QST: two at a time'),
    'flying-geese-sew-and-flip': text('«Летящие гуси»: по одному', 'Flying Geese: one at a time'),
    'flying-geese-no-waste': text('«Летящие гуси»: четыре без отходов', 'Flying Geese: four at a time, no waste'),
    template: text('Крой по шаблону', 'Template cutting'),
    'paper-piecing': text('Шитьё по бумажной основе', 'Foundation paper piecing'),
    'english-paper-piecing': text('Английская техника по бумаге', 'English paper piecing'),
  })[method]

  const methodExplanation = (method: ConstructionMethod) => ({
    direct: text(
      'Детали выкраиваются сразу по указанным размерам заготовок.',
      'Pieces are cut directly at the listed blank dimensions.',
    ),
    'strip-piecing': text(
      'Полосы сшиваются в набор, который затем разрезается поперёк на элементы блока.',
      'Strips are joined into a set, then subcut into block units.',
    ),
    'hst-two-at-a-time': text(
      'Из пары квадратов получают две одинаковые HST-детали.',
      'A pair of squares makes two matching HST units.',
    ),
    'qst-two-at-a-time': text(
      'Два этапа диагонального шитья дают парные QST-детали.',
      'Two diagonal sewing stages make matching QST units.',
    ),
    'flying-geese-sew-and-flip': text(
      'Один прямоугольник корпуса и два угловых квадрата дают одного «гуся». Метод подходит для любого количества и смешанных углов.',
      'One body rectangle and two corner squares make one goose. This works for any quantity and mixed corner fabrics.',
    ),
    'flying-geese-no-waste': text(
      'Один большой квадрат корпуса и четыре малых угловых квадрата дают сразу четырёх «гусей» формата 2:1 без отходов. Количество округляется до партий по четыре.',
      'One large body square and four small corner squares make four 2:1 geese with no waste. Quantities round up to batches of four.',
    ),
    template: text(
      'Полноразмерный шаблон с припуском задаёт окончательную линию кроя внутри заготовки-конверта.',
      'A full-size template with seam allowance defines the final cut inside each envelope blank.',
    ),
    'paper-piecing': text(
      'Заготовка-конверт даёт запас для шитья по бумажной основе и последующего подравнивания.',
      'Each envelope blank provides excess for foundation paper piecing and final trimming.',
    ),
    'english-paper-piecing': text(
      'Ткань оборачивается вокруг бумажных шаблонов, затем подготовленные детали сшиваются вручную.',
      'Fabric is wrapped around paper templates before the prepared pieces are joined by hand.',
    ),
  })[method]

  const methodSteps = (method: ConstructionMethod): readonly string[] => ({
    direct: [
      text('Выкроите заготовки по указанным размерам.', 'Cut the blanks at the listed dimensions.'),
      text('Разложите детали по схеме блока и сшейте их с указанным припуском.', 'Arrange the pieces as shown in the block and sew with the stated seam allowance.'),
    ],
    'strip-piecing': [
      text('Сшейте выкроенные полосы вдоль длинных сторон в набор.', 'Join the cut strips along their long edges to make a strip set.'),
      text('Заутюжьте швы и разрежьте набор поперёк на элементы блока.', 'Press the seams and subcut the set into block units.'),
      text('Соберите элементы по схеме блока.', 'Assemble the units as shown in the block.'),
    ],
    'hst-two-at-a-time': [
      text('Сложите два квадрата лицевыми сторонами вместе и отметьте диагональ.', 'Place two squares right sides together and mark a diagonal.'),
      text('Проложите строчки по обе стороны от линии, разрежьте по линии и разутюжьте.', 'Sew on both sides of the line, cut on the line, and press open.'),
      text('Подравняйте две HST-детали до готового размера.', 'Trim the two HST units to size.'),
    ],
    'qst-two-at-a-time': [
      text('Сначала получите пары HST: прошейте по обе стороны диагонали, разрежьте и разутюжьте.', 'First make HST pairs: sew on both sides of a diagonal, cut, and press.'),
      text('Сложите HST лицевыми сторонами вместе, совместив швы, и отметьте вторую диагональ.', 'Pair the HSTs right sides together with opposing seams and mark the second diagonal.'),
      text('Снова прошейте с обеих сторон, разрежьте по линии, разутюжьте и подравняйте QST.', 'Sew on both sides again, cut on the line, press, and trim the QST units.'),
    ],
    'flying-geese-sew-and-flip': [
      text('Выкроите прямоугольники корпуса и угловые квадраты по размерам ниже.', 'Cut the body rectangles and corner squares at the sizes listed below.'),
      text('Проведите диагональ на изнанке одного углового квадрата.', 'Draw a diagonal on the wrong side of one corner square.'),
      text('Положите квадрат лицом к лицу на один конец прямоугольника корпуса.', 'Place the square right sides together on one end of the body rectangle.'),
      text('Проложите строчку точно ПО отмеченной диагонали.', 'Sew directly ON the marked diagonal.'),
      text('Только после шитья обрежьте внешний угол, оставив припуск на шов.', 'Only after sewing, trim away the outer corner, leaving the seam allowance.'),
      text('Заутюжьте получившийся треугольник наружу.', 'Press the resulting triangle open.'),
      text('Повторите те же действия со вторым квадратом на другом конце прямоугольника.', 'Repeat with the second square on the other end of the rectangle.'),
    ],
    'flying-geese-no-waste': [
      text('Проведите диагональ на изнанке каждого из четырёх малых угловых квадратов.', 'Mark a diagonal on the wrong side of each of the four small corner squares.'),
      text('Положите два малых квадрата лицом к лицу на противоположные углы большого квадрата корпуса.', 'Place two small squares right sides together on opposite corners of the large body square.'),
      text('Проложите строчки с обеих сторон отмеченной линии.', 'Sew on both sides of the marked line.'),
      text('Разрежьте по линии и заутюжьте треугольники наружу.', 'Cut on the line and press the triangles open.'),
      text('Добавьте по одному из оставшихся квадратов к каждой получившейся детали.', 'Add one remaining square to each resulting unit.'),
      text('Снова прошейте с обеих сторон диагонали, разрежьте по линии и заутюжьте.', 'Sew on both sides of the diagonal again, cut on the line, and press.'),
      text('Подравняйте четыре готовых «летящих гуся».', 'Trim the four finished Flying Geese units.'),
    ],
    template: [
      text('Поместите полноразмерный шаблон с припуском внутри каждой заготовки-конверта.', 'Place the full-size template with seam allowance inside each envelope blank.'),
      text('Выкроите деталь по шаблону и соберите блок по схеме.', 'Cut the piece to the template and assemble the block as shown.'),
    ],
    'paper-piecing': [
      text('Расположите заготовки на бумажной основе в порядке нумерации.', 'Place the blanks on the paper foundation in numbered order.'),
      text('Пришейте и отогните каждую следующую деталь, затем подравняйте готовый элемент по шаблону.', 'Sew and flip each following piece, then trim the completed unit to the template.'),
    ],
    'english-paper-piecing': [
      text('Оберните ткань вокруг бумажных шаблонов и закрепите припуски.', 'Wrap the fabric around the paper templates and secure the seam allowances.'),
      text('Сшейте подготовленные детали вручную потайными стежками.', 'Join the prepared pieces by hand with concealed stitches.'),
    ],
  })[method]

  return (
    <section className="calculator-methods" aria-labelledby="construction-methods-heading">
      <div className="calculator-methods__heading">
        <div>
          <p className="calculator-section-kicker">{text('Рецепт кроя', 'Cutting recipe')}</p>
          <h4 id="construction-methods-heading">{text('Методы сборки', 'Construction methods')}</h4>
        </div>
        <p>{text(
          'Эти способы определяют размеры и количество заготовок ниже.',
          'These methods determine the blank sizes and quantities below.',
        )}</p>
      </div>
      <ul className="calculator-method-grid">
        {result.constructionMethods.map((summary) => (
          <li className="calculator-method-card" key={`${summary.patternId}-${summary.method}`}>
            <h5>{patternName(summary.patternId, summary.patternName)}</h5>
            <span className="calculator-method-card__method">{methodName(summary.method)}</span>
            <a href={summary.sourceUrl} target="_blank" rel="noopener noreferrer">
              {text('Источник метода', 'Method source')}
              <span aria-hidden="true">↗</span>
            </a>
            <details className="calculator-method-disclosure">
              <summary>{text('Как сшить', 'How to sew')}</summary>
              <p>{methodExplanation(summary.method)}</p>
              <ol>
                {methodSteps(summary.method).map((step, index) => <li key={index}>{step}</li>)}
              </ol>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PieceFacts({ piece }: { piece: CutPieceInstruction }) {
  const { formatLength, text } = usePreferences()
  const formatDimensions = (widthCm: number, heightCm: number) => `${formatLength(widthCm)} × ${formatLength(heightCm)}`

  return (
    <dl className="calculator-cut-step__facts">
      <div><dt>{text('Заготовки для кроя', 'Cut blanks')}</dt><dd>{piece.rectanglesToCut} {text('шт.', 'pcs.')}</dd></div>
      <div><dt>{text('Размер заготовки', 'Blank dimensions')}</dt><dd>{formatDimensions(piece.cutWidthCm, piece.cutHeightCm)}</dd></div>
      <div><dt>{text('Получится деталей', 'Resulting pieces')}</dt><dd>{piece.pieces} {text('шт.', 'pcs.')}</dd></div>
      {piece.requiredPieces !== piece.pieces && (
        <div>
          <dt>{text('Нужно для квилта', 'Needed for quilt')}</dt>
          <dd>
            {piece.requiredPieces} {text('шт.', 'pcs.')}
            {' · '}
            {text('останется', 'extra')} {piece.pieces - piece.requiredPieces}
          </dd>
        </div>
      )}
      <div><dt>{text('Готовый размер', 'Finished dimensions')}</dt><dd>{formatDimensions(piece.finishedWidthCm, piece.finishedHeightCm)}</dd></div>
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
  const { formatArea, formatFabricLength, formatLength, patternName, text } = usePreferences()
  const formatDimensions = (widthCm: number, heightCm: number) => `${formatLength(widthCm)} × ${formatLength(heightCm)}`
  const roleLabel = (role: CutPieceInstruction['role']) => ({
    square: text('Квадратная заготовка', 'Square blank'),
    rectangle: text('Прямоугольная заготовка', 'Rectangle blank'),
    strip: text('Полоса', 'Strip'),
    'hst-square': text('Квадраты для HST', 'HST squares'),
    'qst-square': text('Квадраты для QST', 'QST squares'),
    'goose-body': text('Корпус «летящего гуся»', 'Flying Geese body'),
    'goose-corner': text('Угловые квадраты', 'Corner squares'),
    template: text('Деталь по шаблону', 'Template piece'),
    blade: text('Лопасть', 'Blade'),
    hexagon: text('Шестиугольник', 'Hexagon'),
  })[role]
  const cuttingInstruction = (piece: CutPieceInstruction) => {
    const dimensions = formatDimensions(piece.cutWidthCm, piece.cutHeightCm)

    if (
      piece.patternId === 'card-trick'
      && piece.partnerPaletteIndex === undefined
      && piece.method === 'hst-two-at-a-time'
    ) {
      return text(
        `Выкроить ${piece.rectanglesToCut} родительских квадратов ${dimensions}; каждый разрезать один раз по диагонали.`,
        `Cut ${piece.rectanglesToCut} parent squares at ${dimensions}; cut each once on the diagonal.`,
      )
    }
    if (
      piece.patternId === 'card-trick'
      && piece.partnerPaletteIndex === undefined
      && piece.method === 'qst-two-at-a-time'
    ) {
      return text(
        `Выкроить ${piece.rectanglesToCut} родительских квадратов ${dimensions}; каждый разрезать по обеим диагоналям.`,
        `Cut ${piece.rectanglesToCut} parent squares at ${dimensions}; cut each on both diagonals.`,
      )
    }
    if (piece.method === 'hst-two-at-a-time') {
      return text(
        `Выкроить ${piece.rectanglesToCut} квадратных заготовок HST ${dimensions}.`,
        `Cut ${piece.rectanglesToCut} HST square blanks at ${dimensions}.`,
      )
    }
    if (piece.method === 'qst-two-at-a-time') {
      return text(
        `Выкроить ${piece.rectanglesToCut} квадратных заготовок QST ${dimensions}.`,
        `Cut ${piece.rectanglesToCut} QST square blanks at ${dimensions}.`,
      )
    }
    if (piece.method === 'flying-geese-sew-and-flip' && piece.role === 'goose-body') {
      return text(
        `Выкроить ${piece.rectanglesToCut} прямоугольных заготовок корпуса ${dimensions}.`,
        `Cut ${piece.rectanglesToCut} body rectangles at ${dimensions}.`,
      )
    }
    if (piece.method === 'flying-geese-sew-and-flip' && piece.role === 'goose-corner') {
      return text(
        `Выкроить ${piece.rectanglesToCut} угловых квадратов ${dimensions}.`,
        `Cut ${piece.rectanglesToCut} corner squares at ${dimensions}.`,
      )
    }
    if (piece.method === 'flying-geese-no-waste' && piece.role === 'goose-body') {
      return text(
        `Выкроить ${piece.rectanglesToCut} больших квадратов корпуса ${dimensions}.`,
        `Cut ${piece.rectanglesToCut} large body squares at ${dimensions}.`,
      )
    }
    if (piece.method === 'flying-geese-no-waste' && piece.role === 'goose-corner') {
      return text(
        `Выкроить ${piece.rectanglesToCut} малых угловых квадратов ${dimensions}.`,
        `Cut ${piece.rectanglesToCut} small corner squares at ${dimensions}.`,
      )
    }
    if (piece.method === 'strip-piecing') {
      return text(
        `Выкроить ${piece.rectanglesToCut} полос-заготовок ${dimensions}.`,
        `Cut ${piece.rectanglesToCut} strip blanks at ${dimensions}.`,
      )
    }
    if (
      piece.method === 'template'
      || piece.method === 'paper-piecing'
      || piece.method === 'english-paper-piecing'
    ) {
      return text(
        `Выкроить ${piece.rectanglesToCut} консервативных заготовок-конвертов ${dimensions}.`,
        `Cut ${piece.rectanglesToCut} conservative envelope blanks at ${dimensions}.`,
      )
    }

    const blankKind = piece.role === 'square'
      ? text('квадратных заготовок', 'square blanks')
      : piece.role === 'strip'
        ? text('полос-заготовок', 'strip blanks')
        : text('прямоугольных заготовок', 'rectangular blanks')
    return text(
      `Выкроить ${piece.rectanglesToCut} ${blankKind} ${dimensions}.`,
      `Cut ${piece.rectanglesToCut} ${blankKind} at ${dimensions}.`,
    )
  }

  return (
    <article className="calculator-cut-group">
      <header className="calculator-cut-group__heading">
        <div className="calculator-cut-group__identity">
          <ColorSwatch color={summary.color} />
          <div>
            <h4>{text('Ткань', 'Fabric')} {summary.paletteIndex + 1}</h4>
            <span>{pieces.reduce((total, piece) => total + piece.rectanglesToCut, 0)} {text('шт. заготовок для кроя', 'cut blanks')}</span>
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
                  <span className="calculator-shape-label">{roleLabel(piece.role)}</span>
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
      <ConstructionMethods result={result} />
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

function FlyingGeeseMethodSelector({
  id,
  value,
  onChange,
}: {
  id: string
  value: FlyingGeeseMethod
  onChange: (method: FlyingGeeseMethod) => void
}) {
  const { text } = usePreferences()
  const options: readonly {
    id: FlyingGeeseMethod
    title: string
    description: string
  }[] = [
    {
      id: 'sew-and-flip',
      title: text('По одному', 'One at a time'),
      description: text(
        'Подходит для любого количества и углов из разных тканей.',
        'Works for any quantity and mixed corner fabrics.',
      ),
    },
    {
      id: 'no-waste',
      title: text('Четыре за раз, без отходов', 'Four at a time, no waste'),
      description: text(
        'Эффективно для деталей 2:1; количество округляется до партий по четыре.',
        'Efficient for 2:1 units; quantities round up to batches of four.',
      ),
    },
  ]

  return (
    <section className="calculator-geese-method" aria-labelledby={`${id}-heading`}>
      <div className="calculator-geese-method__heading">
        <p className="calculator-section-kicker">{text('Выберите способ', 'Choose a method')}</p>
        <h3 id={`${id}-heading`}>{text('Как собрать «летящих гусей»', 'How to make Flying Geese')}</h3>
      </div>
      <fieldset>
        <legend className="visually-hidden">{text('Метод сборки «летящих гусей»', 'Flying Geese construction method')}</legend>
        <div className="calculator-geese-method__options">
          {options.map((option) => (
            <label
              className={value === option.id ? 'is-selected' : undefined}
              key={option.id}
            >
              <input
                type="radio"
                name={`${id}-option`}
                value={option.id}
                checked={value === option.id}
                onChange={() => onChange(option.id)}
              />
              <span>
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="calculator-geese-method__note">{text(
        'Выбор сразу обновляет раскрой, расход ткани и количество для покупки.',
        'Your choice immediately updates cuts, fabric area, and purchase quantities.',
      )}</p>
    </section>
  )
}

export function FabricCalculatorPanel({ document }: FabricCalculatorPanelProps) {
  const { language, text } = usePreferences()
  const [activeTab, setActiveTab] = useState<TabId>('blocks')
  const [flyingGeeseMethod, setFlyingGeeseMethod] = useState<FlyingGeeseMethod>('sew-and-flip')
  const tabGroupId = useId()
  const hasFlyingGeeseConstruction = useMemo(
    () => document.cells.some((cell) => Boolean(FLYING_GEESE_PATTERN_IDS[cell.patternId])),
    [document.cells],
  )
  const result = useMemo(
    () => calculateDetailedFabric(document, language, { flyingGeeseMethod }),
    [document, language, flyingGeeseMethod],
  )
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
          `Покупка и раскрой по вашему квилту — в порядке работы. Итоги покупки включают отходы, необходимые для выбранных методов сборки, и запас ${result.purchaseReservePercent}%.`,
          `Fabric purchases and cutting for your quilt, in working order. Purchase totals include offcuts required by the selected construction methods and a ${result.purchaseReservePercent}% reserve.`,
        )}</p>
      </header>

      {hasFlyingGeeseConstruction && (
        <FlyingGeeseMethodSelector
          id={`${tabGroupId}-flying-geese-method`}
          value={flyingGeeseMethod}
          onChange={setFlyingGeeseMethod}
        />
      )}

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
