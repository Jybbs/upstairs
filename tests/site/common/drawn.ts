import { flushPromises, mount }     from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { UNLOADED } from '../../../docs/.vitepress/lib/orbit/catalog.ts'
import { UNDRAWN }  from '../../../docs/.vitepress/lib/state/drawings.ts'
import { ageWith }  from './drawings.ts'

type Component = Parameters<typeof mount>[0]

/**
 * The width, in pixels, every drawing is reported to take.
 */
export const WIDTH = 640

/**
 * Stands in for `ResizeObserver`, reporting every drawing `WIDTH` wide.
 */
export const observeWidth = () => vi.stubGlobal('ResizeObserver', class {
  constructor(private readonly seen: ResizeObserverCallback) {}
  disconnect() {}
  observe() { queueMicrotask(() => this.seen([{ contentRect: { width: WIDTH } }] as never, this as never)) }
})

/**
 * Mounts `component` once the catalog is read, pressing each of `keys` on the
 * drawing, and returns the readings it shows.
 */
export const readingsOf = async (component: Component, keys: string[] = []) => {
  const wrapper = mount(component)
  await flushPromises()
  for (const key of keys) await wrapper.get('svg').trigger('keydown', { key })
  return wrapper.findAll('dd').map(dd => dd.text())
}

/**
 * Declares the cases pinning that `component` states each failed read in
 * place of its drawing.
 */
export const statesEachFailure = (component: Component) => describe('a drawing whose values failed', () => {
  it.each([UNLOADED, UNDRAWN])('states "%s" in place of the drawing', async line => {
    ageWith({ failure: line })
    const wrapper = mount(component)
    await flushPromises()
    expect([wrapper.text(), wrapper.find('svg').exists()]).toEqual([line, false])
  })
})

/**
 * Declares the cases pinning where each key moves `component`, a drawing on a
 * slider, from its first or last stop.
 */
export const movesOnEachKey = (component: Component) => describe('the keys of a drawing on a slider', () => {
  const page = (last: number) => Math.max(1, Math.round((last + 1) / 10))
  const keys = [
    ['Home', 'ArrowRight', () => 1],
    ['Home', 'ArrowUp', () => 1],
    ['End', 'ArrowLeft', last => last - 1],
    ['End', 'ArrowDown', last => last - 1],
    ['Home', 'PageUp', page],
    ['End', 'PageDown', last => last - page(last)],
    ['End', 'Home', () => 0],
    ['Home', 'End', last => last]
  ] as const satisfies [string, string, (last: number) => number][]

  it.each(keys)('moves from %s on %s', async (from, key, to) => {
    const wrapper = mount(component)
    await flushPromises()
    const svg  = wrapper.get('svg')
    const last = Number(svg.attributes('aria-valuemax'))
    await svg.trigger('keydown', { key: from })
    await svg.trigger('keydown', { key })
    await flushPromises()
    expect(svg.attributes('aria-valuenow')).toBe(String(to(last)))
  })
})
