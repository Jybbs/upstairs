import { expect, it } from 'vitest'

import { tabOf } from '../../../lib/site/tabs.ts'

it.each([
  ['ArrowRight', 0, 1],
  ['ArrowRight', 2, 0],
  ['ArrowLeft', 1, 0],
  ['ArrowLeft', 0, 2],
  ['Home', 2, 0],
  ['End', 0, 2],
  ['Enter', 1, undefined]
])('moves %s from tab %i of three to tab %s', (key, index, to) => expect(tabOf(key, index, 3)).toBe(to))
