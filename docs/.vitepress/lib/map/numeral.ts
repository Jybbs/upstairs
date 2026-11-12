/**
 * The numeral the sky gathers into, the face it is set in, the share of its
 * room it fills, and the least spacing in pixels between two satellites in it.
 */
export const NUMERAL = {
  face  : '700 100px "Averia Serif Libre", serif',
  least : 5,
  share : 0.9,
  text  : '404'
} as const

/**
 * A room of the frame in pixels.
 */
export interface Room {
  height : number
  left   : number
  top    : number
  width  : number
}

/**
 * Returns the points of a staggered grid over a shape `width` by `height`
 * pixels, read through `inside`, spaced so `count` points just cover it and
 * ordered from the left.
 */
export const slotsOf = (
  count  : number,
  height : number,
  width  : number,
  inside : (x: number, y: number) => boolean
) => {
  let area = 0
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) if (inside(x, y)) area += 4
  const spacing                   = Math.sqrt(area / Math.max(count, 1) * 2 / Math.sqrt(3))
  const step                      = Math.max(NUMERAL.least, spacing)
  const slots: [number, number][] = []
  for (let row = 0, y = step / 2; y < height; y += step * Math.sqrt(3) / 2, row++) {
    for (let x = row % 2 ? step : step / 2; x < width; x += step) if (inside(x, y)) slots.push([x, y])
  }
  return slots.sort(([a], [b]) => a - b)
}

/**
 * Returns the points `count` satellites take inside the numeral, set as large
 * as `NUMERAL.share` of `room` allows and centered in it.
 */
export const numeralIn = (room: Room, count: number): [number, number][] => {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  context.font  = NUMERAL.face
  const sized   = context.measureText(NUMERAL.text)
  const tall    = sized.actualBoundingBoxAscent + sized.actualBoundingBoxDescent
  const scale   = NUMERAL.share * Math.min(room.width / sized.width, room.height / tall)
  const width   = Math.ceil(sized.width * scale)
  const height  = Math.ceil(tall * scale)
  context.canvas.width  = width
  context.canvas.height = height
  context.font          = NUMERAL.face
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.fillText(NUMERAL.text, 0, sized.actualBoundingBoxAscent)
  const { data } = context.getImageData(0, 0, width, height)
  const left     = room.left + (room.width - width) / 2
  const top      = room.top + (room.height - height) / 2
  return slotsOf(count, height, width, (x, y) => data[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 127)
    .map(([x, y]) => [left + x, top + y])
}
