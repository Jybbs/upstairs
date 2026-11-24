import manifest                     from '../../../../package.json' with { type: 'json' }
import type { Faces }               from './faces.ts'
import { SCHEMES, type SchemeName } from './palette.ts'
import { linkOf }                   from './sections.ts'

/**
 * The colors a README image of a seal draws in.
 */
type Colors = Record<'hair' | 'ink' | 'page' | 'u', string>

/**
 * A source whose terms require a credit, by the name its seal sets under it,
 * who made the data, the license it carries, and the glyph at its center.
 */
export interface Source {
  glyph   : keyof typeof GLYPHS
  id      : 'omt' | 'osm' | 'st' | 'tt'
  license : string
  maker   : string
  name    : string
}

/**
 * A stroke of a seal's glyph or of a chip's mark: a line in the mark's color,
 * a tint of it laid over the land, a dashed border, or a lake cut back to the
 * page, drawn under `at` where it carries a transform and inside the core
 * where it is `clipped`.
 */
export interface Stroke {
  d        : string
  kind     : 'border' | 'lake' | 'land' | 'line'
  at?      : string
  clipped? : boolean
}

const COAST = 'M7 -30 C3 -20 11 -14 8 -6 C5 2 -3 3 0 11 C3 19 11 21 7 30'
/**
 * The colors the README's images take in each scheme, its own U on GitHub's
 * default and muted foregrounds and canvas, per
 * https://primer.style/foundations/primitives/color.
 */
const GITHUB = {
  day   : { hair: '#59636e', ink: '#1f2328', page: '#ffffff', u: SCHEMES.day.u },
  night : { hair: '#9198a1', ink: '#e6edf3', page: '#0d1117', u: SCHEMES.night.u }
} satisfies Record<SchemeName, Colors>
const LAKE  = 'M2.5 8.5c0-3 2.8-5 5.6-5s5.4 2 5.4 4.6c0 2.9-2.6 4.6-5.3 4.6s-5.7-1.3-5.7-4.2z'
const LAYER = 'M0 -14 L17 -6 L0 2 L-17 -6 Z'
const LOOP  = 'M-18 5 C-19 -7 -8 -17 3 -16 C13 -15 20 -6 18 4 C16 13 7 17 -3 16 C-11 15 -17 12 -18 5 Z'
/**
 * The fixes along a tracked pass, a dot of radius 1.1 centered every 15
 * degrees from -150 to -60 round a circle of radius 24 centered 16 below the
 * core's center.
 */
const pass = [[-20.78, 4], [-16.97, -0.97], [-12, -4.78], [-6.21, -7.18], [0, -8], [6.21, -7.18], [12, -4.78]]
  .map(([x, y]) => `M${x} ${y}m-1.1 0a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0`)
  .join('')
/**
 * Each Terrain Tiles provider whose license or policy requires a statement,
 * by its region, the license, and the statement in the words the license
 * gives, per the attribution https://registry.opendata.aws/terrain-tiles/
 * links and, for ArcticDEM, the Polar Geospatial Center's acknowledgment
 * policy at https://www.pgc.umn.edu/guides/user-services/acknowledgement-policy/.
 */
export const PROVIDERS = [
  {
    license : 'PGC policy',
    notice  : 'DEMs provided by the Polar Geospatial Center under NSF-OPP awards 1043681, 1559691, 1542736, '
            + '1810976, and 2129685',
    region  : 'ArcticDEM'
  },
  {
    license : 'CC BY 4.0',
    notice  : '© Commonwealth of Australia (Geoscience Australia) 2017',
    region  : 'Australia'
  },
  {
    license : 'CC BY 3.0 AT',
    notice  : '© offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich',
    region  : 'Austria'
  },
  {
    license : 'OGL Canada',
    notice  : 'Contains information licensed under the Open Government Licence – Canada',
    region  : 'Canada'
  },
  {
    license : 'Copernicus',
    notice  : 'Produced using Copernicus data and information funded by the European Union - EU-DEM layers',
    region  : 'Europe'
  },
  { license: 'INEGI terms', notice: 'Source: INEGI, Continental relief, 2016', region: 'Mexico' },
  {
    license : 'CC BY 3.0 NZ',
    notice  : 'Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand '
            + 'Government. All rights reserved',
    region  : 'New Zealand'
  },
  { license: 'CC BY 4.0', notice: '© Kartverket', region: 'Norway' },
  {
    license : 'OGL 3.0',
    notice  : '© Environment Agency copyright and/or database right 2015. All rights reserved',
    region  : 'United Kingdom'
  }
]
/**
 * Places the satellite at the head of the tracked pass, turned to follow it.
 */
const SATELLITE = 'translate(16.5 -1) rotate(-48) scale(.72)'
/**
 * A seal's rings on its 96 px square, the edge, the hairline inside it, and
 * the core holding the glyph, which strokes leave only inside the circle of
 * radius `clip`, and its rim, set in the mono at `size` with an advance of
 * `advance`, the maker's baseline on `high` and the license's on `low`, with
 * a dot in each gap on `dot`.
 */
export const SEAL = {
  advance : 7.4 * 0.6,
  center  : 48,
  clip    : 26.2,
  core    : 27,
  dot     : 37.7,
  edge    : 46,
  hair    : 43.2,
  high    : 35,
  low     : 35 + 7.4 * 0.73,
  size    : 7.4
}
/**
 * The README's image of a seal, `width` by `height`, the seal drawn from
 * `seal` and its source's name set in the mono on a baseline at `name`.
 */
const SEAL_IMAGE = {
  height : 124,
  name   : { base: 118, size: 11, tracking: 0.06 },
  seal   : { x: 12, y: 2 },
  width  : 120
}
/**
 * The sources whose terms require a credit, in the order their seals stand.
 */
export const SOURCES: readonly Source[] = [
  {
    glyph   : 'map',
    id      : 'osm',
    license : 'ODbL 1.0',
    maker   : 'OpenStreetMap contributors',
    name    : 'OpenStreetMap'
  },
  {
    glyph   : 'schema',
    id      : 'omt',
    license : 'CC BY 4.0',
    maker   : 'OpenMapTiles · tile schema',
    name    : 'OpenMapTiles'
  },
  {
    glyph   : 'relief',
    id      : 'tt',
    license : 'Nine licenses',
    maker   : 'Mapzen · Terrain Tiles',
    name    : 'Terrain Tiles'
  },
  {
    glyph   : 'track',
    id      : 'st',
    license : 'Citation required',
    maker   : 'USSPACECOM',
    name    : 'Space-Track'
  }
]
/**
 * The marks the OpenStreetMap record's chips carry on a 16 px square, for
 * the lakes, the coastlines, the borders, and the tiles carrying them.
 */
export const CHIP_MARKS = {
  borders : [{ d: 'M1.5 10c3-2.5 5 1.5 8-1s3.5-2.5 5-2', kind: 'border' }],
  lakes   : [{ d: LAKE, kind: 'land' }, { d: LAKE, kind: 'line' }],
  link    : [{ d: 'M5 11l6-6M6 5h5v5', kind: 'line' }],

  coasts: [
    { d: 'M1.5 2h7c-2 2.2 1 4-1 6.5s.5 3.8 1.5 5.5h-7.5z', kind: 'land' },
    { d: 'M8.5 2c-2 2.2 1 4-1 6.5s.5 3.8 1.5 5.5', kind: 'line' }
  ],

  tiles: [
    { d: 'M8 2l6 3-6 3-6-3z', kind: 'land' },
    { d: 'M8 2l6 3-6 3-6-3z', kind: 'line' },
    { d: 'M2 8.5l6 3 6-3', kind: 'line' },
    { d: 'M2 11.5l6 3 6-3', kind: 'line' }
  ]
} as const satisfies Record<string, readonly Stroke[]>
/**
 * The glyphs at a seal's center, drawn about the origin inside the core: a
 * coastline with land to its left, a lake, and a dashed border for the map's
 * data, three stacked layers of a tile for the schema, closed contours round a
 * summit for the relief, and for the orbital elements a tracked pass rising to
 * a satellite, its body between two panels, over an element set's two rows.
 */
export const GLYPHS = {
  map: [
    { clipped: true, d: `${COAST} L-30 30 L-30 -30 Z`, kind: 'land' },
    { clipped: true, d: COAST, kind: 'line' },
    { clipped: true, d: 'M-30 13 C-21 10 -12 17 -1 13', kind: 'border' },
    { d: 'M-17 -9 c2 -5 10 -5 11 0 c1 4 -3 7 -6 6.5 c-3 -.5 -6 -3 -5 -6.5 z', kind: 'lake' }
  ],
  relief: [
    { d: LOOP, kind: 'line' },
    { at: 'translate(3 -2) scale(.64)', d: LOOP, kind: 'line' },
    { at: 'translate(5 -3.5) scale(.3)', d: LOOP, kind: 'land' },
    { at: 'translate(5 -3.5) scale(.3)', d: LOOP, kind: 'line' }
  ],
  schema: [
    { d: 'M-17 2 L0 10 L17 2', kind: 'line' },
    { d: 'M-17 9 L0 17 L17 9', kind: 'line' },
    { d: LAYER, kind: 'land' },
    { d: LAYER, kind: 'line' },
    { d: 'M-7 -9.5 L8 -4', kind: 'line' }
  ],
  track: [
    { d: pass, kind: 'line' },
    { d: 'M-16 12 H-12 M-8.5 12 H3 M6.5 12 H16 M-16 17.5 H-12 M-8.5 17.5 H-1 M2.5 17.5 H16', kind: 'line' },
    { at: SATELLITE, d: 'M-11 -3 H-4.5 V3 H-11 Z M4.5 -3 H11 V3 H4.5 Z', kind: 'lake' },
    { at: SATELLITE, d: 'M-7.75 -3 V3 M7.75 -3 V3 M-4.5 0 H-2.5 M2.5 0 H4.5', kind: 'line' },
    { at: SATELLITE, d: 'M-2.5 -3.5 H2.5 V3.5 H-2.5 Z', kind: 'lake' }
  ]
} as const satisfies Record<string, readonly Stroke[]>

const round = (value: number) => Math.round(value * 100) / 100

/**
 * Returns the `<path>` a stroke draws as in an image drawn in `colors`, whose
 * clip path is `clip`.
 */
const strokeOf = ({ at, clipped, d, kind }: Stroke, clip: string, colors: Colors) => {
  const paint = {
    border : `fill="none" stroke="${colors.u}" stroke-dasharray="2.5 2.5" stroke-width="1.1"`,
    lake   : `fill="${colors.page}" stroke="${colors.u}"`,
    land   : `fill="${colors.u}" fill-opacity=".22"`,
    line   : `fill="none" stroke="${colors.u}"`
  }[kind]
  const place = `${at ? ` transform="${at}"` : ''}${clipped ? ` clip-path="url(#${clip})"` : ''}`
  return `<path d="${d}" ${paint}${place} vector-effect="non-scaling-stroke"/>`
}

/**
 * Sets a source's rim as two arcs that each read upright, the maker over the
 * top clockwise and the license along the bottom counterclockwise, every
 * letter a step apart as though both ran round one circle, with a dot
 * centered in each gap.
 */
export const rimOf = (source: Source) => {
  const { advance, center, dot, high, low } = SEAL
  const [top, under] = [source.maker.toUpperCase(), source.license.toUpperCase()]
  const step         = 2 * Math.PI / (top.length + under.length + 6)
  const arc          = (text: string, middle: number, sign: number, radius: number) =>
    [...text].map((char, index) => {
      const angle = middle + sign * (index - (text.length - 1) / 2) * step
      return {
        char,
        rotate : round((angle + sign * Math.PI / 2) * 180 / Math.PI),
        x      : round(center + radius * Math.cos(angle)),
        y      : round(center + radius * Math.sin(angle))
      }
    })
  const span   = (text: string, radius: number) => (text.length - 1) * step + advance / radius
  const gap    = Math.PI + (span(under, low) - span(top, high)) / 4
  const [x, y] = [round(dot * Math.cos(gap)), round(dot * Math.sin(gap))]
  return {
    dots    : [{ x: center + x, y: center + y }, { x: center - x, y: center + y }],
    letters : [...arc(top, -Math.PI / 2, 1, high), ...arc(under, Math.PI / 2, -1, low)]
      .filter(letter => letter.char !== ' ')
  }
}

/**
 * Returns the fragment on Data a source's seal opens.
 */
export const sealAnchorOf = (source: Source) => `credits-${source.id}`

/**
 * Returns the file under `docs/public/` a source's seal ships as in `scheme`.
 */
export const sealFileOf = (source: Source, scheme: SchemeName) => `seals/${source.id}-${scheme}.svg`

/**
 * Draws a source's seal for the README in `scheme`, over its name, every word
 * set as outlines, since an image on GitHub loads no face of its own.
 */
export const sealImageOf = (faces: Faces, source: Source, scheme: SchemeName, layout = SEAL_IMAGE) => {
  const { height, name, seal, width } = layout
  const { center, clip: radius, core, edge, hair, size } = SEAL
  const colors                        = GITHUB[scheme]
  const clip                          = `${source.id}-${scheme}-core`
  const { dots, letters }             = rimOf(source)

  const rim   = letters.map(({ char, rotate, x, y }) => {
    const d = faces.mono.outline({ size, text: char }, -faces.mono.widthOf({ size, text: char }) / 2, 0)
    return `<path d="${d}" transform="translate(${x} ${y}) rotate(${rotate})"/>`
  }).join('')
  const spots = dots.map(dot => `<circle cx="${dot.x}" cy="${dot.y}" r="1"/>`).join('')
  const glyph = GLYPHS[source.glyph].map(stroke => strokeOf(stroke, clip, colors)).join('')
  const label = { ...name, text: source.name.toUpperCase() }
  const title = faces.mono.outline(label, (width - faces.mono.widthOf(label)) / 2, name.base)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
       + `viewBox="0 0 ${width} ${height}" role="img" aria-label="${source.name}">`
       + `<defs><clipPath id="${clip}"><circle r="${radius}"/></clipPath></defs>`
       + `<g transform="translate(${seal.x} ${seal.y})">`
       + `<circle cx="${center}" cy="${center}" r="${edge}" fill="none" stroke="${colors.u}" `
       + 'stroke-width="1.5"/>'
       + `<circle cx="${center}" cy="${center}" r="${hair}" fill="none" stroke="${colors.hair}" `
       + 'stroke-width=".7"/>'
       + `<circle cx="${center}" cy="${center}" r="${core}" fill="${colors.u}" fill-opacity=".07" `
       + `stroke="${colors.u}" stroke-width="1.1"/>`
       + `<g fill="${colors.ink}">${rim}${spots}</g>`
       + `<g transform="translate(${center} ${center})" stroke-linecap="round" stroke-linejoin="round" `
       + `stroke-width="1.5">${glyph}</g>`
       + `</g><path d="${title}" fill="${colors.ink}"/></svg>\n`
}

/**
 * Returns the link on the site a source's seal in the README opens.
 */
export const sealLinkOf = (source: Source) =>
  new URL(`${linkOf('Data')}#${sealAnchorOf(source)}`, manifest.homepage)
