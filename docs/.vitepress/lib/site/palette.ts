import type { Kind } from '../orbit/kinds.ts'

export interface Scheme {
  bands  : readonly string[]
  coast  : string
  dim    : string
  ground : string
  halo   : string
  ink    : string
  kinds  : Readonly<Record<Kind, string>>
  lift   : string
  page   : string
  panel  : string
  rule   : string
  soft   : string
  spot   : string
  u      : string
}

export type SchemeName = keyof typeof SCHEMES

/**
 * The two color schemes, each listing the map's bands from the deepest sea to
 * the highest land, and each kind's color held at 3 to 1 on every band and on
 * the panel.
 */
export const SCHEMES = {
  day: {
    coast  : '#7c9996',
    dim    : '#5b6b69',
    ground : '#a8c1be',
    halo   : '#f8faf9',
    ink    : '#0a1213',
    lift   : '#e2e9e6',
    page   : '#eef2f0',
    panel  : '#f8faf9',
    rule   : '#c3d0cc',
    soft   : '#3b4a49',
    spot   : '#0a4a47',
    u      : '#0a4a47',

    bands: [
      '#b0c7c4', '#b7ccc9', '#bfd2cf', '#c6d7d4', '#ceddda', '#d5e2df',
      '#f3f4ef', '#eeefe8', '#e8eae0', '#e3e6d9', '#dde1d1', '#d8dcca'
    ],

    kinds: {
      crewed     : '#217150',
      science    : '#b43820',
      earth      : '#9e5000',
      weather    : '#7d4fa8',
      navigation : '#776200',
      comms      : '#006f83',
      starlink   : '#46536b',
      other      : '#6b6459'
    }
  },

  night: {
    coast  : '#2f474a',
    dim    : '#8a9a9b',
    ground : '#040f1a',
    halo   : '#0a1213',
    ink    : '#eeeeee',
    lift   : '#182627',
    page   : '#0a1213',
    panel  : '#0f1a1b',
    rule   : '#2a3a3b',
    soft   : '#bac7c7',
    spot   : '#90d3c7',
    u      : '#90d3c7',

    bands: [
      '#04111c', '#04131d', '#04151f', '#031620', '#031822', '#031a23',
      '#1d2823', '#212c26', '#253029', '#28352c', '#2c392f', '#303d32'
    ],

    kinds: {
      crewed     : '#ded1a9',
      science    : '#a8c7ad',
      earth      : '#bac39f',
      weather    : '#9cc5d6',
      navigation : '#a9c0de',
      comms      : '#99c9c5',
      starlink   : '#abb2b8',
      other      : '#cbb399'
    }
  }
} as const satisfies Record<string, Scheme>

const declarations = (scheme: Scheme) => [
  ...Object.entries(scheme).flatMap(([token, value]) =>
    typeof value === 'string' ? [`--${token}:${value}`] : []),
  ...Object.entries(scheme.kinds).map(([kind, color]) => `--kind-${kind}:${color}`)
].join(';')

/**
 * Writes each scheme's tokens as custom properties, Daylight on the root and
 * the night under the `dark` class the appearance switch sets.
 */
export const cssOf = () => `:root{${declarations(SCHEMES.day)}}html.dark{${declarations(SCHEMES.night)}}`

/**
 * Returns the custom property holding a kind's color in the scheme on show.
 */
export const kindColor = (kind: Kind) => `var(--kind-${kind})`
