import { describe, expect, it } from 'vitest'

import { FLOORS, styleOf } from '../../lib/map/style.ts'
import { SCHEMES }         from '../../lib/site/palette.ts'

describe.each(Object.entries(SCHEMES))('the %s map', (_, scheme) => {
  const { layers } = styleOf('contours', 'dem', scheme)
  const paints     = Object.fromEntries(layers.map(layer => [layer.id, layer.paint]))

  it('lays its ground in the page’s color', () =>
    expect(paints.ground).toEqual({ 'background-color': scheme.page }))
  it('fills a lake in the shallowest sea band', () =>
    expect(paints.lakes).toEqual({ 'fill-color': scheme.bands[FLOORS.indexOf(0) - 1] }))
})
