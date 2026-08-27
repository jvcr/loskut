import { memo, useId } from 'react'
import { patternById, type BlockPattern, type FabricPlacement, type PatternId, type QuiltCell } from './editorModel'

interface PatternPreviewProps {
  cell?: QuiltCell
  patternId?: PatternId
  palette: readonly string[]
  patterns?: readonly BlockPattern[]
  fabricFills?: readonly (string | null)[]
  fabricPlacements?: readonly FabricPlacement[]
  className?: string
}

export const PatternPreview = memo(function PatternPreview({
  cell,
  patternId,
  palette,
  patterns = [],
  fabricFills = [],
  fabricPlacements = [],
  className,
}: PatternPreviewProps) {
  const pattern = patternById(cell?.patternId ?? patternId ?? 'solid', patterns)
  const rotation = cell?.rotation ?? 0
  const mirrorX = cell?.mirrorX ? -1 : 1
  const mirrorY = cell?.mirrorY ? -1 : 1
  const patternPrefix = useId().replaceAll(':', '')
  const fills = palette.map((color, index) => fabricFills[index] ? `url(#${patternPrefix}-${index})` : color)

  return (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-label={pattern.name}>
      <defs>
        {fabricFills.map((image, index) => {
          if (!image) return null
          const placement = fabricPlacements[index] ?? { zoom: 1, positionX: 50, positionY: 50 }
          const width = 100 * placement.zoom
          const x = -(placement.zoom - 1) * placement.positionX
          const y = -(placement.zoom - 1) * placement.positionY
          return (
            <pattern key={index} id={`${patternPrefix}-${index}`} patternUnits="userSpaceOnUse" width="100" height="100">
              <image href={image} x={x} y={y} width={width} height={width} preserveAspectRatio="xMidYMid slice" />
            </pattern>
          )
        })}
      </defs>
      <rect width="100" height="100" fill={fills[pattern.background] ?? palette[0]} />
      <g transform={`translate(50 50) scale(${mirrorX} ${mirrorY}) rotate(${rotation}) translate(-50 -50)`}>
        {pattern.shapes.map((shape, index) => (
          <polygon
            key={index}
            points={shape.points.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
            fill={fills[shape.color] ?? palette[0]}
          />
        ))}
      </g>
    </svg>
  )
})
