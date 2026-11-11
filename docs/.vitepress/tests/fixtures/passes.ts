import type { Pass } from '../../lib/orbit/scan.ts'

/**
 * Builds a crewed pass of satellite `id` from 300 to 900 seconds into the
 * window, with `changes` laid over it.
 */
export const passOf = (id: number, changes: Partial<Pass> = {}): Pass => ({
  earlier : false,
  heading : 170,
  height  : 410,
  id      : id,
  key     : `${id}/300`,
  kind    : 'crewed',
  later   : false,
  name    : `CRAFT ${id}`,
  peak    : 60,
  peakAt  : 600,
  range   : 450,
  riseAt  : 300,
  riseAz  : 0,
  setAt   : 900,
  setAz   : 180,
  ...changes
})
