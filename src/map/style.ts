import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

/** Elevation bands in meters, each with the color of everything above its floor. */
export const BANDS: readonly (readonly [floor: number, color: string])[] = [
  [-11000, '#8e9cc0'],
  [-4000,  '#9eabcb'],
  [-2000,  '#adb9d4'],
  [-500,   '#bcc6dd'],
  [-100,   '#ccd4e6'],
  [-30,    '#dbe1ee'],
  [0,      '#f0eee6'],
  [200,    '#e9e6dc'],
  [500,    '#e1ddd0'],
  [1000,   '#d7d2c3'],
  [2000,   '#ccc6b6'],
  [3500,   '#bfb8a7'],
]

const EDGE = 0.5

/**
 * Turns the bands into a ramp of hard steps, as color relief only interpolates.
 */
export const reliefRamp = (bands = BANDS): ExpressionSpecification => {
  const stops = bands.flatMap(([floor, color], index) => {
    const next = bands[index + 1]?.[0] ?? 9000
    return [floor, color, next - EDGE, color]
  })
  return ['interpolate', ['linear'], ['elevation'], ...stops] as unknown as ExpressionSpecification
}

export const styleOf = (demTiles: string, contourTiles: string): StyleSpecification => ({
  version : 8,
  sources : {
    dem      : { type: 'raster-dem', tiles: [demTiles], encoding: 'terrarium', tileSize: 256, maxzoom: 13 },
    contours : { type: 'vector', tiles: [contourTiles], maxzoom: 15 },
    base     : { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers : [
    { id: 'ground', type: 'background', paint: { 'background-color': '#f0eee6' } },
    { id: 'relief', type: 'color-relief', source: 'dem', paint: { 'color-relief-color': reliefRamp() } },
    {
      id: 'lakes', type: 'fill', source: 'base', 'source-layer': 'water',
      filter : ['==', ['get', 'class'], 'lake'],
      paint  : { 'fill-color': '#ccd4e6' },
    },
    {
      id: 'contours', type: 'line', source: 'contours', 'source-layer': 'contours',
      filter : ['>', ['get', 'ele'], 0],
      paint  : { 'line-color': '#8d8671', 'line-opacity': ['match', ['get', 'level'], 1, 0.4, 0.2], 'line-width': 0.6 },
    },
    {
      id: 'soundings', type: 'line', source: 'contours', 'source-layer': 'contours',
      filter : ['<', ['get', 'ele'], 0],
      paint  : { 'line-color': '#5f6f9c', 'line-opacity': ['match', ['get', 'level'], 1, 0.35, 0.18], 'line-width': 0.6 },
    },
    {
      id: 'borders', type: 'line', source: 'base', 'source-layer': 'boundary',
      filter : ['all', ['<=', ['coalesce', ['get', 'admin_level'], 99], 4], ['!=', ['get', 'maritime'], 1]],
      paint  : { 'line-color': '#6b6459', 'line-opacity': 0.4, 'line-width': 0.8, 'line-dasharray': [4, 3] },
    },
    {
      id: 'coast', type: 'line', source: 'base', 'source-layer': 'water',
      paint : { 'line-color': '#27365e', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1.1] },
    },
  ],
})
