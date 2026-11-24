import { timingSafeEqual } from 'node:crypto'

import { vi } from 'vitest'

/**
 * Stands in for the Workers runtime's `crypto.subtle`, which adds
 * `timingSafeEqual` to the Web Crypto API, answering it through Node's
 * `timingSafeEqual` and every digest through the runtime the suite runs on,
 * and returns the stand-in for `timingSafeEqual`.
 */
export const stubSubtle = () => {
  const { subtle } = crypto
  const equal      = vi.fn((a: ArrayBuffer, b: ArrayBuffer) =>
    timingSafeEqual(new Uint8Array(a), new Uint8Array(b)))
  vi.stubGlobal('crypto', { subtle: { digest: subtle.digest.bind(subtle), timingSafeEqual: equal } })
  return equal
}
