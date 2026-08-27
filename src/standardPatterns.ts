import type { BlockPattern, PatternShape, Point } from './editorModel'

const rectangle = (color: number, x: number, y: number, width: number, height: number): PatternShape => ({
  color,
  points: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]],
})

const triangle = (color: number, first: Point, second: Point, third: Point): PatternShape => ({
  color,
  points: [first, second, third],
})

const THIRD = 1 / 3
const SIXTH = 1 / 6
const SEVENTH = 1 / 7

const DRESDEN_BLADE_COUNT = 12
const DRESDEN_INNER_RADIUS = 0.15
const DRESDEN_OUTER_RADIUS = 0.38
const DRESDEN_TIP_RADIUS = 0.46

const radialPoint = (radius: number, angle: number): Point => [
  0.5 + radius * Math.cos(angle),
  0.5 + radius * Math.sin(angle),
]

const dresdenPlateShapes = (): PatternShape[] => Array.from(
  { length: DRESDEN_BLADE_COUNT },
  (_, index) => {
    const angleStep = (Math.PI * 2) / DRESDEN_BLADE_COUNT
    const startAngle = -Math.PI / 2 + index * angleStep
    const endAngle = startAngle + angleStep
    const middleAngle = startAngle + angleStep / 2
    const innerStart = radialPoint(DRESDEN_INNER_RADIUS, startAngle)
    const outerStart = radialPoint(DRESDEN_OUTER_RADIUS, startAngle)
    const tip = radialPoint(DRESDEN_TIP_RADIUS, middleAngle)
    const outerEnd = radialPoint(DRESDEN_OUTER_RADIUS, endAngle)
    const innerEnd = radialPoint(DRESDEN_INNER_RADIUS, endAngle)
    const color = index % 3 + 1

    return [
      triangle(color, innerStart, outerStart, tip),
      triangle(color, innerStart, tip, outerEnd),
      triangle(color, innerStart, outerEnd, innerEnd),
    ]
  },
).flat()

const HEXAGON_SIDE = 1 / (3 * Math.sqrt(3))
const HEXAGON_HALF_HEIGHT = 1 / 6

const hexagonShapes = (color: number, centerX: number, centerY: number): PatternShape[] => [
  rectangle(
    color,
    centerX - HEXAGON_SIDE / 2,
    centerY - HEXAGON_HALF_HEIGHT,
    HEXAGON_SIDE,
    HEXAGON_HALF_HEIGHT * 2,
  ),
  triangle(
    color,
    [centerX - HEXAGON_SIDE, centerY],
    [centerX - HEXAGON_SIDE / 2, centerY - HEXAGON_HALF_HEIGHT],
    [centerX - HEXAGON_SIDE / 2, centerY + HEXAGON_HALF_HEIGHT],
  ),
  triangle(
    color,
    [centerX + HEXAGON_SIDE / 2, centerY - HEXAGON_HALF_HEIGHT],
    [centerX + HEXAGON_SIDE, centerY],
    [centerX + HEXAGON_SIDE / 2, centerY + HEXAGON_HALF_HEIGHT],
  ),
]

export const STANDARD_PATTERNS: readonly BlockPattern[] = [
  {
    id: 'nine-patch',
    name: 'Девять лоскутов',
    background: 0,
    shapes: [
      rectangle(1, 0, 0, THIRD, THIRD),
      rectangle(1, THIRD * 2, 0, THIRD, THIRD),
      rectangle(1, THIRD, THIRD, THIRD, THIRD),
      rectangle(1, 0, THIRD * 2, THIRD, THIRD),
      rectangle(1, THIRD * 2, THIRD * 2, THIRD, THIRD),
    ],
  },
  {
    id: 'four-patch',
    name: 'Четыре лоскута',
    background: 0,
    shapes: [
      rectangle(1, 0, 0, 0.5, 0.5),
      rectangle(1, 0.5, 0.5, 0.5, 0.5),
    ],
  },
  {
    id: 'log-cabin',
    name: 'Бревенчатая изба',
    background: 0,
    shapes: [
      rectangle(1, 0.4, 0.2, 0.2, 0.2),
      rectangle(1, 0.6, 0.2, 0.2, 0.4),
      rectangle(2, 0.4, 0.6, 0.4, 0.2),
      rectangle(2, 0.2, 0.2, 0.2, 0.6),
      rectangle(1, 0.2, 0, 0.6, 0.2),
      rectangle(1, 0.8, 0, 0.2, 0.8),
      rectangle(2, 0.2, 0.8, 0.8, 0.2),
      rectangle(2, 0, 0, 0.2, 1),
    ],
  },
  {
    id: 'rail-fence',
    name: 'Рельсы',
    background: 0,
    shapes: [
      rectangle(1, 0, 0, SIXTH, 0.5),
      rectangle(2, SIXTH, 0, SIXTH, 0.5),
      rectangle(1, 0.5, 0, 0.5, SIXTH),
      rectangle(2, 0.5, SIXTH, 0.5, SIXTH),
      rectangle(2, 0, THIRD * 2, 0.5, SIXTH),
      rectangle(1, 0, SIXTH * 5, 0.5, SIXTH),
      rectangle(2, THIRD * 2, 0.5, SIXTH, 0.5),
      rectangle(1, SIXTH * 5, 0.5, SIXTH, 0.5),
    ],
  },
  {
    id: 'flying-geese',
    name: 'Летящие гуси',
    background: 0,
    shapes: [
      triangle(1, [0, 1], [0.5, 0], [1, 1]),
    ],
  },
  {
    id: 'ohio-star',
    name: 'Звезда Огайо',
    background: 0,
    shapes: [
      rectangle(2, THIRD, THIRD, THIRD, THIRD),
      triangle(1, [THIRD, 0], [0.5, SIXTH], [THIRD, THIRD]),
      triangle(1, [THIRD * 2, 0], [THIRD * 2, THIRD], [0.5, SIXTH]),
      triangle(1, [THIRD * 2, THIRD], [SIXTH * 5, 0.5], [1, THIRD]),
      triangle(1, [THIRD * 2, THIRD * 2], [1, THIRD * 2], [SIXTH * 5, 0.5]),
      triangle(1, [THIRD * 2, 1], [0.5, SIXTH * 5], [THIRD * 2, THIRD * 2]),
      triangle(1, [THIRD, 1], [THIRD, THIRD * 2], [0.5, SIXTH * 5]),
      triangle(1, [0, THIRD * 2], [SIXTH, 0.5], [THIRD, THIRD * 2]),
      triangle(1, [0, THIRD], [THIRD, THIRD], [SIXTH, 0.5]),
    ],
  },
  {
    id: 'sawtooth-star',
    name: 'Зубчатая звезда',
    background: 0,
    shapes: [
      rectangle(2, 0.25, 0.25, 0.5, 0.5),
      triangle(1, [0.25, 0.25], [0.5, 0], [0.5, 0.25]),
      triangle(1, [0.5, 0], [0.75, 0.25], [0.5, 0.25]),
      triangle(1, [0.75, 0.25], [1, 0.5], [0.75, 0.5]),
      triangle(1, [1, 0.5], [0.75, 0.75], [0.75, 0.5]),
      triangle(1, [0.75, 0.75], [0.5, 1], [0.5, 0.75]),
      triangle(1, [0.5, 1], [0.25, 0.75], [0.5, 0.75]),
      triangle(1, [0.25, 0.75], [0, 0.5], [0.25, 0.5]),
      triangle(1, [0, 0.5], [0.25, 0.25], [0.25, 0.5]),
    ],
  },
  {
    id: 'churn-dash',
    name: 'Маслобойка',
    background: 0,
    shapes: [
      triangle(1, [THIRD, 0], [THIRD, THIRD], [0, THIRD]),
      triangle(1, [THIRD * 2, 0], [1, THIRD], [THIRD * 2, THIRD]),
      triangle(1, [1, THIRD * 2], [THIRD * 2, 1], [THIRD * 2, THIRD * 2]),
      triangle(1, [THIRD, THIRD * 2], [THIRD, 1], [0, THIRD * 2]),
      rectangle(1, THIRD, SIXTH, THIRD, SIXTH),
      rectangle(1, THIRD * 2, THIRD, SIXTH, THIRD),
      rectangle(1, THIRD, THIRD * 2, THIRD, SIXTH),
      rectangle(1, SIXTH, THIRD, SIXTH, THIRD),
      rectangle(2, THIRD, THIRD, THIRD, THIRD),
    ],
  },
  {
    id: 'bow-tie',
    name: 'Галстук-бабочка',
    background: 0,
    shapes: [
      rectangle(1, 0, 0, 0.5, 0.5),
      triangle(1, [0.5, 0.25], [0.75, 0.5], [0.5, 0.5]),
      rectangle(2, 0.5, 0.5, 0.5, 0.5),
      triangle(2, [0.5, 0.5], [0.5, 0.75], [0.25, 0.5]),
    ],
  },
  {
    id: 'friendship-star',
    name: 'Звезда дружбы',
    background: 0,
    shapes: [
      rectangle(2, THIRD, THIRD, THIRD, THIRD),
      triangle(1, [THIRD, 0], [THIRD * 2, 0], [THIRD * 2, THIRD]),
      triangle(1, [1, THIRD], [1, THIRD * 2], [THIRD * 2, THIRD * 2]),
      triangle(1, [THIRD * 2, 1], [THIRD, 1], [THIRD, THIRD * 2]),
      triangle(1, [0, THIRD * 2], [0, THIRD], [THIRD, THIRD]),
    ],
  },
  {
    id: 'bear-paw',
    name: 'Медвежья лапа',
    background: 0,
    shapes: [
      rectangle(1, SEVENTH, SEVENTH, SEVENTH * 2, SEVENTH * 2),
      rectangle(1, SEVENTH * 4, SEVENTH, SEVENTH * 2, SEVENTH * 2),
      rectangle(1, SEVENTH, SEVENTH * 4, SEVENTH * 2, SEVENTH * 2),
      rectangle(1, SEVENTH * 4, SEVENTH * 4, SEVENTH * 2, SEVENTH * 2),
      rectangle(1, SEVENTH * 3, SEVENTH * 3, SEVENTH, SEVENTH),
      triangle(1, [SEVENTH, SEVENTH], [SEVENTH * 2, 0], [SEVENTH * 2, SEVENTH]),
      triangle(1, [SEVENTH * 2, SEVENTH], [SEVENTH * 3, 0], [SEVENTH * 3, SEVENTH]),
      triangle(1, [0, SEVENTH], [SEVENTH, SEVENTH], [SEVENTH, SEVENTH * 2]),
      triangle(1, [0, SEVENTH * 2], [SEVENTH, SEVENTH * 2], [SEVENTH, SEVENTH * 3]),
      triangle(1, [SEVENTH * 4, 0], [SEVENTH * 4, SEVENTH], [SEVENTH * 5, SEVENTH]),
      triangle(1, [SEVENTH * 5, 0], [SEVENTH * 5, SEVENTH], [SEVENTH * 6, SEVENTH]),
      triangle(1, [SEVENTH * 6, SEVENTH], [1, SEVENTH], [SEVENTH * 6, SEVENTH * 2]),
      triangle(1, [SEVENTH * 6, SEVENTH * 2], [1, SEVENTH * 2], [SEVENTH * 6, SEVENTH * 3]),
      triangle(1, [SEVENTH, SEVENTH * 4], [SEVENTH, SEVENTH * 5], [0, SEVENTH * 5]),
      triangle(1, [SEVENTH, SEVENTH * 5], [SEVENTH, SEVENTH * 6], [0, SEVENTH * 6]),
      triangle(1, [SEVENTH, SEVENTH * 6], [SEVENTH * 2, SEVENTH * 6], [SEVENTH * 2, 1]),
      triangle(1, [SEVENTH * 2, SEVENTH * 6], [SEVENTH * 3, SEVENTH * 6], [SEVENTH * 3, 1]),
      triangle(1, [SEVENTH * 6, SEVENTH * 4], [1, SEVENTH * 5], [SEVENTH * 6, SEVENTH * 5]),
      triangle(1, [SEVENTH * 6, SEVENTH * 5], [1, SEVENTH * 6], [SEVENTH * 6, SEVENTH * 6]),
      triangle(1, [SEVENTH * 4, SEVENTH * 6], [SEVENTH * 5, SEVENTH * 6], [SEVENTH * 4, 1]),
      triangle(1, [SEVENTH * 5, SEVENTH * 6], [SEVENTH * 6, SEVENTH * 6], [SEVENTH * 5, 1]),
    ],
  },
  {
    id: 'basket',
    name: 'Корзина',
    background: 0,
    shapes: [
      triangle(1, [0.25, 0], [0.25, 0.25], [0.5, 0.25]),
      triangle(1, [0.5, 0.25], [0.75, 0], [0.75, 0.25]),
      triangle(1, [0, 0.25], [0.25, 0.25], [0.25, 0.5]),
      triangle(1, [0, 0.75], [0.25, 0.5], [0.25, 0.75]),
      rectangle(1, 0.5, 0.25, 0.25, 0.25),
      rectangle(1, 0.25, 0.5, 0.25, 0.25),
      rectangle(1, 0.5, 0.5, 0.25, 0.25),
      triangle(2, [0.75, 0.5], [0.75, 0.75], [1, 0.5]),
      triangle(2, [0.5, 0.75], [0.5, 1], [0.75, 0.75]),
    ],
  },
  {
    id: 'shoo-fly',
    name: 'Муха',
    background: 0,
    shapes: [
      rectangle(1, THIRD, THIRD, THIRD, THIRD),
      triangle(1, [THIRD, THIRD], [0, THIRD], [THIRD, 0]),
      triangle(1, [THIRD * 2, THIRD], [THIRD * 2, 0], [1, THIRD]),
      triangle(1, [THIRD, THIRD * 2], [THIRD, 1], [0, THIRD * 2]),
      triangle(1, [THIRD * 2, THIRD * 2], [1, THIRD * 2], [THIRD * 2, 1]),
    ],
  },
  {
    id: 'jacobs-ladder',
    name: 'Лестница Иакова',
    background: 0,
    shapes: [
      rectangle(1, 0, 0, SIXTH, SIXTH),
      rectangle(1, SIXTH, SIXTH, SIXTH, SIXTH),
      rectangle(1, THIRD * 2, 0, SIXTH, SIXTH),
      rectangle(1, SIXTH * 5, SIXTH, SIXTH, SIXTH),
      rectangle(1, THIRD, THIRD, SIXTH, SIXTH),
      rectangle(1, 0.5, 0.5, SIXTH, SIXTH),
      rectangle(1, 0, THIRD * 2, SIXTH, SIXTH),
      rectangle(1, SIXTH, SIXTH * 5, SIXTH, SIXTH),
      rectangle(1, THIRD * 2, THIRD * 2, SIXTH, SIXTH),
      rectangle(1, SIXTH * 5, SIXTH * 5, SIXTH, SIXTH),
      triangle(1, [THIRD * 2, 0], [THIRD * 2, THIRD], [THIRD, THIRD]),
      triangle(1, [THIRD, THIRD], [THIRD, THIRD * 2], [0, THIRD * 2]),
      triangle(1, [THIRD * 2, THIRD], [1, THIRD], [THIRD * 2, THIRD * 2]),
      triangle(1, [THIRD, THIRD * 2], [THIRD * 2, THIRD * 2], [THIRD, 1]),
    ],
  },
  {
    id: 'maple-leaf',
    name: 'Кленовый лист',
    background: 0,
    shapes: [
      rectangle(1, THIRD, THIRD, THIRD, THIRD),
      rectangle(1, THIRD * 2, THIRD, THIRD, THIRD),
      rectangle(1, THIRD, THIRD * 2, THIRD, THIRD),
      triangle(1, [THIRD, 0], [THIRD, THIRD], [THIRD * 2, THIRD]),
      triangle(1, [THIRD * 2, 0], [THIRD * 2, THIRD], [1, THIRD]),
      triangle(1, [0, THIRD], [THIRD, THIRD], [THIRD, THIRD * 2]),
      triangle(1, [0, THIRD * 2], [THIRD, THIRD * 2], [THIRD, 1]),
      triangle(1, [THIRD * 2, THIRD * 2], [13 / 18, THIRD * 2], [1, 17 / 18]),
      triangle(1, [THIRD * 2, THIRD * 2], [1, 17 / 18], [1, 1]),
      triangle(1, [THIRD * 2, THIRD * 2], [1, 1], [17 / 18, 1]),
      triangle(1, [THIRD * 2, THIRD * 2], [17 / 18, 1], [THIRD * 2, 13 / 18]),
    ],
  },
  {
    id: 'courthouse-steps',
    name: 'Ступени суда',
    background: 0,
    shapes: [
      rectangle(3, 0.4, 0.4, 0.2, 0.2),
      rectangle(1, 0.3, 0.3, 0.4, 0.1),
      rectangle(1, 0.3, 0.6, 0.4, 0.1),
      rectangle(2, 0.3, 0.4, 0.1, 0.2),
      rectangle(2, 0.6, 0.4, 0.1, 0.2),
      rectangle(1, 0.2, 0.2, 0.6, 0.1),
      rectangle(1, 0.2, 0.7, 0.6, 0.1),
      rectangle(2, 0.2, 0.3, 0.1, 0.4),
      rectangle(2, 0.7, 0.3, 0.1, 0.4),
      rectangle(1, 0.2, 0.1, 0.6, 0.1),
      rectangle(1, 0.2, 0.8, 0.6, 0.1),
      rectangle(2, 0.1, 0.1, 0.1, 0.8),
      rectangle(2, 0.8, 0.1, 0.1, 0.8),
      rectangle(1, 0.1, 0, 0.8, 0.1),
      rectangle(1, 0.1, 0.9, 0.8, 0.1),
      rectangle(2, 0, 0, 0.1, 1),
      rectangle(2, 0.9, 0, 0.1, 1),
    ],
  },
  {
    id: 'dutchmans-puzzle',
    name: 'Загадка голландца',
    background: 0,
    shapes: [
      triangle(2, [0, 0], [0.5, 0], [0.25, 0.25]),
      triangle(1, [0, 0.5], [0.5, 0.5], [0.25, 0.25]),
      triangle(2, [1, 0], [1, 0.5], [0.75, 0.25]),
      triangle(1, [0.5, 0], [0.5, 0.5], [0.75, 0.25]),
      triangle(2, [0.5, 1], [1, 1], [0.75, 0.75]),
      triangle(1, [0.5, 0.5], [1, 0.5], [0.75, 0.75]),
      triangle(2, [0, 0.5], [0, 1], [0.25, 0.75]),
      triangle(1, [0.5, 0.5], [0.5, 1], [0.25, 0.75]),
    ],
  },
  {
    id: 'card-trick',
    name: 'Карточный фокус',
    background: 0,
    shapes: [
      triangle(1, [0, THIRD], [THIRD, 0], [THIRD, THIRD]),
      triangle(2, [THIRD * 2, 0], [THIRD * 2, THIRD], [1, THIRD]),
      triangle(1, [THIRD * 2, THIRD * 2], [1, THIRD * 2], [THIRD * 2, 1]),
      triangle(2, [0, THIRD * 2], [THIRD, THIRD * 2], [THIRD, 1]),
      triangle(1, [THIRD, 0], [THIRD, THIRD], [THIRD * 2, THIRD]),
      triangle(2, [THIRD * 2, 0], [THIRD * 2, THIRD], [0.5, SIXTH]),
      triangle(2, [THIRD * 2, THIRD], [1, THIRD], [THIRD * 2, THIRD * 2]),
      triangle(1, [THIRD * 2, THIRD * 2], [1, THIRD * 2], [SIXTH * 5, 0.5]),
      triangle(1, [THIRD, THIRD * 2], [THIRD * 2, THIRD * 2], [THIRD * 2, 1]),
      triangle(2, [THIRD, THIRD * 2], [THIRD, 1], [0.5, SIXTH * 5]),
      triangle(2, [0, THIRD * 2], [THIRD, THIRD * 2], [THIRD, THIRD]),
      triangle(1, [0, THIRD], [THIRD, THIRD], [SIXTH, 0.5]),
      triangle(1, [THIRD, THIRD], [THIRD * 2, THIRD], [0.5, 0.5]),
      triangle(2, [THIRD * 2, THIRD], [THIRD * 2, THIRD * 2], [0.5, 0.5]),
      triangle(1, [THIRD, THIRD * 2], [THIRD * 2, THIRD * 2], [0.5, 0.5]),
      triangle(2, [THIRD, THIRD], [THIRD, THIRD * 2], [0.5, 0.5]),
    ],
  },
  {
    id: 'snails-trail',
    name: 'След улитки',
    background: 0,
    shapes: [
      rectangle(1, 3 / 8, 3 / 8, 1 / 8, 1 / 8),
      rectangle(2, 4 / 8, 3 / 8, 1 / 8, 1 / 8),
      rectangle(2, 3 / 8, 4 / 8, 1 / 8, 1 / 8),
      rectangle(1, 4 / 8, 4 / 8, 1 / 8, 1 / 8),
      triangle(2, [3 / 8, 3 / 8], [5 / 8, 3 / 8], [4 / 8, 2 / 8]),
      triangle(2, [3 / 8, 5 / 8], [5 / 8, 5 / 8], [4 / 8, 6 / 8]),
      triangle(1, [5 / 8, 3 / 8], [5 / 8, 5 / 8], [6 / 8, 4 / 8]),
      triangle(1, [3 / 8, 3 / 8], [3 / 8, 5 / 8], [2 / 8, 4 / 8]),
      triangle(2, [2 / 8, 2 / 8], [4 / 8, 2 / 8], [2 / 8, 4 / 8]),
      triangle(2, [6 / 8, 4 / 8], [6 / 8, 6 / 8], [4 / 8, 6 / 8]),
      triangle(1, [4 / 8, 2 / 8], [6 / 8, 2 / 8], [6 / 8, 4 / 8]),
      triangle(1, [2 / 8, 4 / 8], [4 / 8, 6 / 8], [2 / 8, 6 / 8]),
      triangle(1, [2 / 8, 2 / 8], [6 / 8, 2 / 8], [4 / 8, 0]),
      triangle(1, [2 / 8, 6 / 8], [6 / 8, 6 / 8], [4 / 8, 1]),
      triangle(2, [6 / 8, 2 / 8], [6 / 8, 6 / 8], [1, 4 / 8]),
      triangle(2, [2 / 8, 2 / 8], [2 / 8, 6 / 8], [0, 4 / 8]),
      triangle(1, [0, 0], [4 / 8, 0], [0, 4 / 8]),
      triangle(1, [1, 4 / 8], [1, 1], [4 / 8, 1]),
      triangle(2, [4 / 8, 0], [1, 0], [1, 4 / 8]),
      triangle(2, [0, 4 / 8], [4 / 8, 1], [0, 1]),
    ],
  },
  {
    id: 'storm-at-sea',
    name: 'Шторм на море',
    background: 0,
    shapes: [
      triangle(2, [0.5, 0.2], [0.8, 0.5], [0.5, 0.8]),
      triangle(2, [0.5, 0.2], [0.5, 0.8], [0.2, 0.5]),
      triangle(1, [0.25, 0], [0.5, 0.2], [0.75, 0]),
      triangle(1, [1, 0.25], [0.8, 0.5], [1, 0.75]),
      triangle(1, [0.75, 1], [0.5, 0.8], [0.25, 1]),
      triangle(1, [0, 0.75], [0.2, 0.5], [0, 0.25]),
      triangle(2, [0, 0], [0.2, 0], [0, 0.2]),
      triangle(2, [1, 0], [1, 0.2], [0.8, 0]),
      triangle(2, [1, 1], [0.8, 1], [1, 0.8]),
      triangle(2, [0, 1], [0, 0.8], [0.2, 1]),
    ],
  },
  {
    id: 'dresden-plate',
    name: 'Дрезденская тарелка',
    background: 0,
    shapes: dresdenPlateShapes(),
  },
  {
    id: 'grandmothers-flower-garden',
    name: 'Бабушкин цветник',
    background: 0,
    shapes: [
      ...hexagonShapes(2, 0.5, 0.5),
      ...hexagonShapes(1, 0.5, 0.5 - HEXAGON_HALF_HEIGHT * 2),
      ...hexagonShapes(3, 0.5 + HEXAGON_SIDE * 1.5, 0.5 - HEXAGON_HALF_HEIGHT),
      ...hexagonShapes(1, 0.5 + HEXAGON_SIDE * 1.5, 0.5 + HEXAGON_HALF_HEIGHT),
      ...hexagonShapes(3, 0.5, 0.5 + HEXAGON_HALF_HEIGHT * 2),
      ...hexagonShapes(1, 0.5 - HEXAGON_SIDE * 1.5, 0.5 + HEXAGON_HALF_HEIGHT),
      ...hexagonShapes(3, 0.5 - HEXAGON_SIDE * 1.5, 0.5 - HEXAGON_HALF_HEIGHT),
    ],
  },
]

export const PATTERN_CATEGORY_BY_ID: Record<string, 'Базовые' | 'Звёзды' | 'Треугольники' | 'Классика'> = {
  'nine-patch': 'Базовые',
  'four-patch': 'Базовые',
  'log-cabin': 'Классика',
  'rail-fence': 'Базовые',
  'flying-geese': 'Треугольники',
  'ohio-star': 'Звёзды',
  'sawtooth-star': 'Звёзды',
  'churn-dash': 'Классика',
  'bow-tie': 'Классика',
  'friendship-star': 'Звёзды',
  'bear-paw': 'Классика',
  basket: 'Классика',
  'shoo-fly': 'Классика',
  'jacobs-ladder': 'Классика',
  'maple-leaf': 'Классика',
  'courthouse-steps': 'Базовые',
  'dutchmans-puzzle': 'Треугольники',
  'card-trick': 'Классика',
  'snails-trail': 'Классика',
  'storm-at-sea': 'Треугольники',
  'dresden-plate': 'Звёзды',
  'grandmothers-flower-garden': 'Классика',
}
