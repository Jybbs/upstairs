import { expect, it } from 'vitest'

import ICONS      from '../../lib/site/icons.json' with { type: 'json' }
import { iconOf } from '../../lib/site/icons.ts'

it.each([
  ['draws a mark 22 px across or more with the broad nib', 'north', 22, ICONS.north.big],
  ['draws a mark under 22 px across with the small nib', 'north', 21, ICONS.north.small],
  ['draws a kind’s mark with the broad nib from 22 px across', 'crewed', 22, ICONS.kinds.crewed.big],
  ['draws a kind’s mark under 22 px across with the small nib', 'crewed', 16, ICONS.kinds.crewed.small]
] as const)('%s', (_, name, size, outline) => expect(iconOf(name, size)).toBe(outline))
