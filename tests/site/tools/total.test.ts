import { expect, it } from 'vitest'

import { totalOf } from '../../tools/total.ts'

it.each([[80.51, 80], [80.99, 80], [100, 100]])('rounds %d percent of lines down to %d', (pct, total) =>
  expect(totalOf({ total: { lines: { pct } } })).toBe(total))
