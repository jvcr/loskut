import { useEffect, useId, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import type { BlockPattern } from './editorModel'
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
  const [quantity, setQuantity] = useState(1)
  const [seamCm, setSeamCm] = useState(0.635)
  const [mirrored, setMirrored] = useState(false)
  const titleId = useId()
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
              <p className="calculator-eyebrow">Печать в масштабе 100%</p>
              <h2 id={titleId}>{pattern.name}</h2>
            </div>
            <button className="print-modal__close" type="button" onClick={onClose} aria-label="Закрыть" autoFocus>×</button>
          </header>

          <div className="print-modal__controls print-modal__chrome">
            <label>
              Количество
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
              Припуск, см
              <input
                type="number"
                min="0"
                step="0.001"
                value={seamCm}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setSeamCm(Number.isFinite(next) ? Math.max(0, next) : 0)
                }}
              />
            </label>
            <label className="print-modal__check">
              <input type="checkbox" checked={mirrored} onChange={(event) => setMirrored(event.target.checked)} />
              Отразить шаблон
            </label>
            <button className="calculator-primary" type="button" onClick={() => window.print()}>Печать</button>
          </div>

          <div className="print-modal__facts print-modal__chrome" aria-live="polite">
            <span><b>Готовый блок</b>{finishedSizeCm.toLocaleString('ru-RU')} × {finishedSizeCm.toLocaleString('ru-RU')} см</span>
            <span><b>Размер с припусками</b>{cutSizeCm.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} × {cutSizeCm.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} см</span>
            <span><b>Количество</b>{quantity}</span>
            <span>
              <b>Вместимость A4</b>
              {pageCapacity > 0 ? `до ${pageCapacity} шаблонов на листе` : 'шаблон крупнее печатной области'}
            </span>
          </div>

          <p className="print-modal__notice print-modal__chrome">
            Печатайте без масштабирования. Вместимость — ориентир для A4 с полями 1 см; диалог принтера может изменить доступную область.
          </p>

          <div className="print-modal__paper" style={templateStyle}>
            <aside className="print-calibration" aria-label={`Калибровочный квадрат ${CALIBRATION_SIZE_CM} сантиметров`}>
              <span>{CALIBRATION_SIZE_CM} × {CALIBRATION_SIZE_CM} см</span>
            </aside>
            <div className="print-block-sheet">
              {templates.map((index) => (
                <figure className="print-template" key={index}>
                  <div className="print-template__cut">
                    <svg
                      className={mirrored ? 'print-template__pattern is-mirrored' : 'print-template__pattern'}
                      viewBox="0 0 1 1"
                      role="img"
                      aria-label={`${pattern.name}, шаблон ${index + 1}`}
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
                  <figcaption>{pattern.name} · готовый {finishedSizeCm.toLocaleString('ru-RU')} см · крой {cutSizeCm.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} см</figcaption>
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
