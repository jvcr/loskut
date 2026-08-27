import { useEffect, useId, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import type { BlockPattern } from './editorModel'
import { usePreferences } from './i18n'
import './calculator.css'

export interface PrintBlockModalProps {
  pattern: BlockPattern
  palette: readonly string[]
  blockSizeCm: number
  onClose(): void
}

const PRINTABLE_WIDTH_CM = 19
const PRINTABLE_HEIGHT_CM = 27
const TEMPLATE_GAP_CM = 0.4
const CALIBRATION_SIZE_CM = 5


export function PrintBlockModal({ pattern, palette, blockSizeCm, onClose }: PrintBlockModalProps) {
  const {
    measurementSystem,
    text,
    patternName,
    lengthUnit,
    toDisplayLength,
    fromDisplayLength,
    formatLength,
  } = usePreferences()
  const [quantity, setQuantity] = useState(1)
  const [seamCm, setSeamCm] = useState(0.635)
  const [mirrored, setMirrored] = useState(false)
  const titleId = useId()
  const displayPatternName = pattern.source ? pattern.name : patternName(String(pattern.id), pattern.name)
  const finishedSizeCm = Number.isFinite(blockSizeCm) && blockSizeCm >= 0 ? blockSizeCm : 0
  const cutSizeCm = finishedSizeCm + seamCm * 2
  const columnsPerPage = Math.max(0, Math.floor((PRINTABLE_WIDTH_CM + TEMPLATE_GAP_CM) / (cutSizeCm + TEMPLATE_GAP_CM)))
  const rowsPerPage = Math.max(0, Math.floor((PRINTABLE_HEIGHT_CM + TEMPLATE_GAP_CM) / (cutSizeCm + TEMPLATE_GAP_CM)))
  const pageCapacity = columnsPerPage * rowsPerPage
  const templateStyle = {
    '--print-cut-size': `${cutSizeCm}cm`,
    '--print-seam': `${seamCm}cm`,
  } as CSSProperties
  const templates = useMemo(() => Array.from({ length: quantity }, (_, index) => index), [quantity])
  const finishedDimensions = `${formatLength(finishedSizeCm, 3)} × ${formatLength(finishedSizeCm, 3)}`
  const cutDimensions = `${formatLength(cutSizeCm, 3)} × ${formatLength(cutSizeCm, 3)}`
  const calibrationDimensions = `${formatLength(CALIBRATION_SIZE_CM, 3)} × ${formatLength(CALIBRATION_SIZE_CM, 3)}`

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const closeFromOverlay = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="print-modal" role="presentation">
      <div className="print-modal__overlay" onMouseDown={closeFromOverlay}>
        <section className="print-modal__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <header className="print-modal__header print-modal__chrome">
            <div>
              <p className="calculator-eyebrow">{text('Печать в масштабе 100%', 'Print at 100% scale')}</p>
              <h2 id={titleId}>{displayPatternName}</h2>
            </div>
            <button
              className="print-modal__close"
              type="button"
              onClick={onClose}
              aria-label={text('Закрыть', 'Close')}
              autoFocus
            >
              ×
            </button>
          </header>

          <div className="print-modal__controls print-modal__chrome">
            <label>
              {text('Количество', 'Quantity')}
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setQuantity(Number.isFinite(next) ? Math.max(1, Math.round(next)) : 1)
                }}
              />
            </label>
            <label>
              {text('Припуск', 'Seam allowance')}, {lengthUnit}
              <input
                type="number"
                min="0"
                step={measurementSystem === 'metric' ? '0.01' : '0.001'}
                value={toDisplayLength(seamCm)}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setSeamCm(Number.isFinite(next) ? Math.max(0, fromDisplayLength(next)) : 0)
                }}
              />
            </label>
            <label className="print-modal__check">
              <input type="checkbox" checked={mirrored} onChange={(event) => setMirrored(event.target.checked)} />
              {text('Отразить шаблон', 'Mirror template')}
            </label>
            <button className="calculator-primary" type="button" onClick={() => window.print()}>
              {text('Печать', 'Print')}
            </button>
          </div>

          <div className="print-modal__facts print-modal__chrome" aria-live="polite">
            <span><b>{text('Готовый блок', 'Finished block')}</b>{finishedDimensions}</span>
            <span><b>{text('Размер с припусками', 'Size with seam allowances')}</b>{cutDimensions}</span>
            <span><b>{text('Количество', 'Quantity')}</b>{quantity}</span>
            <span>
              <b>{text('Вместимость A4', 'A4 capacity')}</b>
              {pageCapacity > 0
                ? text(`до ${pageCapacity} шаблонов на листе`, `up to ${pageCapacity} templates per sheet`)
                : text('шаблон крупнее печатной области', 'template exceeds the printable area')}
            </span>
          </div>

          <p className="print-modal__notice print-modal__chrome">
            {text(
              `Печатайте без масштабирования. Вместимость — ориентир для A4 с полями ${formatLength(1)}; диалог принтера может изменить доступную область.`,
              `Print without scaling. Capacity is an estimate for A4 with ${formatLength(1)} margins; the print dialog may change the available area.`,
            )}
          </p>

          <div className="print-modal__paper" style={templateStyle}>
            <aside
              className="print-calibration"
              aria-label={text(
                `Калибровочный квадрат ${formatLength(CALIBRATION_SIZE_CM, 3)}`,
                `${formatLength(CALIBRATION_SIZE_CM, 3)} calibration square`,
              )}
            >
              <span>{calibrationDimensions}</span>
            </aside>
            <div className="print-block-sheet">
              {templates.map((index) => (
                <figure className="print-template" key={index}>
                  <div className="print-template__cut">
                    <svg
                      className={mirrored ? 'print-template__pattern is-mirrored' : 'print-template__pattern'}
                      viewBox="0 0 1 1"
                      role="img"
                      aria-label={text(
                        `${displayPatternName}, шаблон ${index + 1}`,
                        `${displayPatternName}, template ${index + 1}`,
                      )}
                    >
                      <rect width="1" height="1" fill={palette[pattern.background] ?? palette[0] ?? 'var(--calculator-print-paper)'} />
                      {pattern.shapes.map((shape, shapeIndex) => (
                        <polygon
                          key={shapeIndex}
                          points={shape.points.map(([x, y]) => `${x},${y}`).join(' ')}
                          fill={palette[shape.color] ?? palette[0] ?? 'var(--calculator-print-paper)'}
                        />
                      ))}
                    </svg>
                    <span className="print-template__seam" aria-hidden="true" />
                    <span className="print-template__label">{index + 1} / {quantity}</span>
                  </div>
                  <figcaption>
                    {displayPatternName}
                    {' · '}
                    {text('готовый', 'finished')} {formatLength(finishedSizeCm, 3)}
                    {' · '}
                    {text('крой', 'cut')} {formatLength(cutSizeCm, 3)}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default PrintBlockModal
