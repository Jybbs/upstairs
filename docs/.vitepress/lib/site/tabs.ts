/**
 * The keys that move along a tab list, each to the tab it chooses from
 * `index` among `count`, per the WAI-ARIA tabs pattern at
 * https://www.w3.org/WAI/ARIA/apg/patterns/tabs/.
 */
const STEPS: Record<string, (index: number, count: number) => number> = {
  ArrowLeft  : (index, count) => (index + count - 1) % count,
  ArrowRight : (index, count) => (index + 1) % count,
  End        : (_, count) => count - 1,
  Home       : () => 0
}

/**
 * Returns the tab a press of `key` chooses from tab `index` of `count`,
 * wrapping at either end, or `undefined` where the key moves nothing.
 */
export const tabOf = (key: string, index: number, count: number) => STEPS[key]?.(index, count)
