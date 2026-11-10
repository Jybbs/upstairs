import type { Map } from 'maplibre-gl'

/**
 * The lines the map's credit adds beside the base map's own, each linking the
 * section of the Data page that lists its sources.
 */
export const CREDITS = [
  `<a href="${import.meta.env.BASE_URL}data/#orbits">Orbits from CelesTrak and Space-Track</a>`,
  `<a href="${import.meta.env.BASE_URL}data/#terrain">Terrain from Mapzen and its sources</a>`
]

/**
 * How long the credit stays open, and the events on the map that close it
 * sooner.
 */
export const HOLD = { events: ['keydown', 'pointerdown', 'wheel'], wait: 5000 }

/**
 * Keeps the map's compact credit open until the reader presses, scrolls, or
 * types on the map, or until `wait` milliseconds pass, whichever comes first.
 */
export const holdCredit = (map: Map, hold = HOLD) => {
  const credit = map.getContainer().querySelector('.maplibregl-ctrl-attrib')!
  const closed = new AbortController()
  const close  = () => closed.abort()
  const timer  = setTimeout(close, hold.wait)
  closed.signal.addEventListener('abort', () => {
    clearTimeout(timer)
    credit.classList.remove('maplibregl-compact-show')
    credit.removeAttribute('open')
  })
  for (const type of hold.events) {
    map.getCanvasContainer().addEventListener(type, close, { signal: closed.signal })
  }
}
