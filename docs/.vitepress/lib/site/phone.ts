import { createSharedComposable, useMediaQuery } from '@vueuse/core'

/**
 * Returns whether the page is narrower than a phone's `40rem`, through one
 * query every component mounted shares.
 */
export const usePhone = createSharedComposable(() => useMediaQuery('(width < 40rem)'))
