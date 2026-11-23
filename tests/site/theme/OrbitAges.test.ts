// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi }     from 'vitest'

import { SPREADS, ringGapOf, spreadOf } from '../../lib/map/overlay.ts'
import { AGES }                         from '../../lib/orbit/catalog.ts'
import OrbitAges                        from '../../theme/OrbitAges.tsx'
import { ageWith }                      from '../common/drawings.ts'
import { movesOnEachKey, observeWidth, statesEachFailure } from '../common/drawn.ts'

vi.mock('../../lib/state/drawings.ts', async original =>
  (await import('../common/drawings.ts')).drawingsModuleOf(await original()))

enableAutoUnmount(afterEach)
observeWidth()

describe('the catalog ages', () => {
  it('opens on the column holding the largest share of the catalog', async () => {
    const wrapper = mount(OrbitAges)
    await flushPromises()
    const share   = () => Number.parseFloat(wrapper.findAll('dd')[1].text())
    const opening = share()
    const count   = Number(wrapper.get('svg').attributes('aria-valuemax')) + 1
    await wrapper.get('svg').trigger('keydown', { key: 'Home' })
    const shares = [share()]
    for (const _ of Array.from({ length: count - 1 })) {
      await wrapper.get('svg').trigger('keydown', { key: 'ArrowRight' })
      shares.push(share())
    }
    expect(opening).toBe(Math.max(...shares))
  })

  it('shades and rings each band of ages as the map rings a satellite of that age', async () => {
    const wrapper = mount(OrbitAges)
    await flushPromises()
    const edges  = [0, ...SPREADS, AGES.limit]
    const rings  = wrapper.findAll('circle[stroke-dasharray]').filter((_, index) => index % 2)
    const radius = Number(rings[0].attributes('r'))
    expect(rings.map(ring => ring.attributes('stroke-dasharray')))
      .toEqual(edges.map(edge => `0 ${ringGapOf(2 * Math.PI * radius, edge + 0.01)}`))
    expect(wrapper.findAll('rect[height]').slice(0, edges.length).map(band => band.classes().join(' ')))
      .toEqual(edges.map(edge => spreadOf(edge + 0.01) === 2 ? 'fill-lift' : 'fill-lift opacity-45'))
  })

  it('stands each column as tall as its share of the catalog against the largest share', async () => {
    ageWith({ ages: Float64Array.of(0.5, 0.5, 0.5, 0.5, 5) })
    const wrapper = mount(OrbitAges)
    await flushPromises()
    const columns = wrapper.findAll('rect.fill-dim, rect.fill-ink')
    const heights = columns.map(column => Number(column.attributes('height')))
    const tallest = Math.max(...heights)
    expect(heights.filter(Boolean).toSorted((a, b) => a - b)).toEqual([tallest / 4, tallest])
  })

  it.each([
    ['an element set at the end of the axis', AGES.limit * 2],
    ['an element set past the end of the axis', AGES.limit * 3]
  ])('counts %s in the last column, which reads every age from its lower bound on', async (_, age) => {
    ageWith({ ages: Float64Array.of(0.5, age) })
    const wrapper = mount(OrbitAges)
    await flushPromises()
    const svg = wrapper.get('svg')
    await svg.trigger('keydown', { key: 'End' })
    expect([...wrapper.findAll('dd').map(dd => dd.text()), svg.attributes('aria-valuetext')])
      .toEqual(['25.0 D OR MORE', '50%', '25.00 days or more, 50%'])
  })
})

statesEachFailure(OrbitAges)
movesOnEachKey(OrbitAges)
