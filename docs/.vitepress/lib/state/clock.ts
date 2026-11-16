/**
 * The clock's tuning in seconds, except `lapse` as a multiple of real speed
 * and `latch` and `spoken` in milliseconds: how far into the window the
 * present stands as it opens, how far a press moves a held frame on under
 * reduced motion, the fast-forward's speed, how long the readout holds a
 * reading, and how often it announces the count above the horizon.
 */
export const CLOCK = { ahead: 300, lapse: 60, latch: 30_000, lead: 300, spoken: 20_000 } as const
