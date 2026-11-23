// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi }     from 'vitest'

import { TRACK_STEP }     from '../../lib/orbit/scan.ts'
import { titleOf }        from '../../lib/state/drawings.ts'
import PeakSearch         from '../../theme/PeakSearch.tsx'
import { drawingsOf }     from '../common/drawings.ts'
import { WIDTH, movesOnEachKey, observeWidth, readingsOf, statesEachFailure } from '../common/drawn.ts'
import { fakeClock }      from '../common/frames.ts'
import { stubIntersection, stubMatchMedia } from '../common/stubs.ts'

vi.mock('../../lib/state/drawings.ts', async original =>
  (await import('../common/drawings.ts')).drawingsModuleOf(await original()))

enableAutoUnmount(afterEach)
observeWidth()

const drawings = await drawingsOf()

describe('the peak search', () => {
  const x = (stop: number) => 16 + stop / 9 * (WIDTH - 32)

  stubMatchMedia(() => true)

  it('names the station, the home spot, and the time its pass rises above the drawing', async () => {
    const wrapper = mount(PeakSearch)
    await flushPromises()
    expect(wrapper.get('figure > div').text()).toContain(titleOf(drawings, 'scanned'))
  })

  it.each([
    ['opens on a sample every track step', [], `${TRACK_STEP} S`, TRACK_STEP],
    ['reads the widest spacing at the end of the scale', ['End'], '4 MIN', 240]
  ])('%s', async (_, keys, every, step) => {
    expect(await readingsOf(PeakSearch, keys)).toEqual([every, `${drawings.scanned.miss(step).toFixed(2)}°`])
  })

  it('glides to the end of the scale and settles on its reading where motion is allowed', async () => {
    stubMatchMedia(() => false)
    fakeClock({ toFake: ['performance', 'requestAnimationFrame'] })
    const wrapper = mount(PeakSearch)
    await flushPromises()
    await wrapper.get('svg').trigger('keydown', { key: 'End' })
    const gliding = wrapper.findAll('dd')[1].text()
    vi.advanceTimersByTime(5_000)
    await flushPromises()
    expect([gliding, wrapper.findAll('dd')[1].text()])
      .toEqual([TRACK_STEP, 240].map(step => `${drawings.scanned.miss(step).toFixed(2)}°`))
  })

  it('runs the knob along the scale and back to the track step once the drawing comes into view', async () => {
    stubMatchMedia(() => false)
    fakeClock({ toFake: ['performance', 'requestAnimationFrame', 'setInterval', 'clearInterval'] })
    const view    = stubIntersection()
    const wrapper = mount(PeakSearch)
    await flushPromises()
    view()
    const stops: string[] = []
    for (let stop = 0; stop < 12; stop++) {
      vi.advanceTimersByTime(650)
      await flushPromises()
      stops.push(wrapper.get('svg').attributes('aria-valuenow')!)
    }
    expect(stops).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '3', '3'])
  })

  it('widens the band under the peak by the miss at each spacing', async () => {
    stubMatchMedia(() => true)
    const wrapper = mount(PeakSearch)
    await flushPromises()
    const band    = () => Number(wrapper.get('rect.fill-u').attributes('height'))
    const opening = band()
    await wrapper.get('svg').trigger('keydown', { key: 'End' })
    expect(band() / opening).toBeCloseTo(drawings.scanned.miss(240) / drawings.scanned.miss(TRACK_STEP), 6)
  })

  it.each([
    ['lands a drag held still before its release on the stop nearest the pointer', true, '3'],
    ['carries a drag thrown on its release past the pointer to the next stop', false, '4']
  ])('%s', async (_, held, stop) => {
    fakeClock({ toFake: ['performance'] })
    const wrapper = mount(PeakSearch)
    await flushPromises()
    const svg = wrapper.get('svg')
    await svg.trigger('pointerdown', { clientX: x(1), pointerId: 1 })
    vi.advanceTimersByTime(held ? 0 : 20)
    await svg.trigger('pointermove', { clientX: x(3.3), pointerId: 1 })
    vi.advanceTimersByTime(held ? 100 : 0)
    await svg.trigger('pointerup', { pointerId: 1 })
    expect(svg.attributes('aria-valuenow')).toBe(stop)
  })
})

statesEachFailure(PeakSearch)
movesOnEachKey(PeakSearch)
