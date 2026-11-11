import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

import type { Scheme } from '../site/palette.ts'

const EDGE = 0.5
/**
 * The floor of each elevation band in meters, from the deepest sea to the
 * highest land, each scheme giving one color per band.
 */
export const FLOORS = [-11000, -4000, -2000, -500, -100, -30, 0, 200, 500, 1000, 2000, 3500] as const
const SHALLOWS = FLOORS.indexOf(0) - 1

/**
 * Turns the bands into a ramp of hard steps, as color relief only interpolates.
 */
export const reliefRamp = (
  colors : readonly string[],
  floors : readonly number[] = FLOORS
): ExpressionSpecification => {
  const stops = floors.flatMap((floor, index) => {
    const next = floors[index + 1] ?? 9000
    return [floor, colors[index], next - EDGE, colors[index]]
  })
  return ['interpolate', ['linear'], ['elevation'], ...stops] as unknown as ExpressionSpecification
}

export const styleOf = (contourTiles: string, demTiles: string, scheme: Scheme): StyleSpecification => ({
  version: 8,

  layers: [
    { id: 'ground', paint: { 'background-color': scheme.page }, type: 'background' },
    {
      id     : 'relief',
      paint  : { 'color-relief-color': reliefRamp(scheme.bands) },
      source : 'dem',
      type   : 'color-relief'
    },
    {
      filter         : ['==', ['get', 'class'], 'lake'],
      id             : 'lakes',
      paint          : { 'fill-color': scheme.bands[SHALLOWS] },
      source         : 'base',
      'source-layer' : 'water',
      type           : 'fill'
    },
    {
      filter         : ['>', ['get', 'ele'], 0],
      id             : 'contours',
      source         : 'contours',
      'source-layer' : 'contours',
      type           : 'line',
      paint          : {
        'line-color'   : scheme.dim,
        'line-opacity' : ['match', ['get', 'level'], 1, 0.4, 0.2],
        'line-width'   : 0.6
      }
    },
    {
      filter         : ['<', ['get', 'ele'], 0],
      id             : 'soundings',
      source         : 'contours',
      'source-layer' : 'contours',
      type           : 'line',
      paint          : {
        'line-color'   : scheme.coast,
        'line-opacity' : ['match', ['get', 'level'], 1, 0.35, 0.18],
        'line-width'   : 0.6
      }
    },
    {
      id             : 'borders',
      source         : 'base',
      'source-layer' : 'boundary',
      type           : 'line',

      filter: [
        'all',
        ['<=', ['coalesce', ['get', 'admin_level'], 99], 4],
        ['!=', ['get', 'maritime'], 1]
      ],

      paint: {
        'line-color'     : scheme.dim,
        'line-dasharray' : [4, 3],
        'line-opacity'   : 0.4,
        'line-width'     : 0.8
      }
    },
    {
      id             : 'coast',
      source         : 'base',
      'source-layer' : 'water',
      type           : 'line',
      paint          : {
        'line-color' : scheme.coast,
        'line-width' : ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1.1]
      }
    }
  ],

  sources: {
    base     : { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    contours : { maxzoom: 15, tiles: [contourTiles], type: 'vector' },
    dem      : { encoding: 'terrarium', maxzoom: 13, tileSize: 256, tiles: [demTiles], type: 'raster-dem' }
  }
})
