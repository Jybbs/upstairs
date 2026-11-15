// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi }     from 'vitest'

import LookAngles                                      from '../../theme/LookAngles.tsx'
import { drawingsOf }                                  from '../common/drawings.ts'
import { observeWidth, readingsOf, statesEachFailure } from '../common/drawn.ts'

vi.mock('../../lib/state/drawings.ts', async original =>
  (await import('../common/drawings.ts')).drawingsModuleOf(await original()))

enableAutoUnmount(afterEach)
observeWidth()

const drawings = await drawingsOf()

describe('the look angles', () => {
  const { looks } = drawings.highest
  const peak      = looks.findIndex(look => look.elevation === Math.max(...looks.map(each => each.elevation)))

  /**
   * Returns the index of the look nearest the horizon among the looks from
   * `from` up to `to`.
   */
  const levelOf = (from: number, to?: number) => {
    const heights = looks.slice(from, to).map(look => Math.abs(look.elevation))
    return from + heights.indexOf(Math.min(...heights))
  }

  it('opens on the highest look of the pass', async () =>
    expect((await readingsOf(LookAngles))[1]).toBe(`${looks[peak].elevation.toFixed(1)}°`))

  it('moves to the look under a point pressed on the sky disc', async () => {
    const wrapper = mount(LookAngles)
    await flushPromises()
    const svg = wrapper.get('svg')
    await svg.trigger('keydown', { key: 'End' })
    const end = wrapper.get('circle[r="6.5"]').attributes()
    await svg.trigger('keydown', { key: 'Home' })
    await svg.trigger('pointerdown', { clientX: Number(end.cx), clientY: Number(end.cy) })
    expect(svg.attributes('aria-valuenow')).toBe(String(looks.length - 1))
  })

  it.each([
    ['rising', [], levelOf(0, peak + 1)],
    ['setting', ['End'], levelOf(peak + 1)]
  ])('moves to the %s look nearest the horizon for a point level with the plane', async (_, keys, look) => {
    const wrapper = mount(LookAngles)
    await flushPromises()
    const svg  = wrapper.get('svg')
    const base = wrapper.get('circle[r="4.5"]')
    for (const key of keys) await svg.trigger('keydown', { key })
    await svg.trigger('pointerdown', {
      clientX : Number(base.attributes('cx')) + 100,
      clientY : Number(base.attributes('cy'))
    })
    expect(svg.attributes('aria-valuenow')).toBe(String(look))
  })

  it('reads the azimuth of the last look once the pass is stepped to its end', async () => {
    const last = Math.round(looks.at(-1)!.azimuth)
    expect((await readingsOf(LookAngles, ['End']))[0]).toMatch(new RegExp(`^${last}° `))
  })
})

statesEachFailure(LookAngles)
