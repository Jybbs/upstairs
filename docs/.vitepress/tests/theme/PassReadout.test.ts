// @vitest-environment happy-dom
import { mount, type VueWrapper }   from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { TRACK_STEP, TRACK_WIDTH, type Pass } from '../../lib/orbit/scan.ts'
import { passOf }                             from '../fixtures/passes.ts'
import { lateSky }                            from '../fixtures/sky.ts'

/**
 * Matches the outline of a rise tick or a set arrowhead.
 */
const END = /^M[^L]*L[^L]*(L[^L]*Z)?$/

/**
 * Mounts the readout over a fresh copy of the shared state and a stand-in
 * worker, with the window opening at 11:47 PM in New York's time zone and one
 * pass laid over its track, read at `seconds` into the window. The satellite
 * stands 5° of latitude north of the spot at its peak, `drift` degrees of
 * longitude east of it each 10 minutes after its peak, and climbs 1° every 5
 * seconds from its rise to its peak.
 */
const mounted = async (seconds: number, changes: Partial<Pass> = {}, drift = 0) => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const { component: Readout, sky } = await lateSky(() => import('../../theme/Readout.vue'))
  const pass                        = passOf(1, changes)
  const samples                     = sky.span / TRACK_STEP + 1
  const track                       = new Float32Array(samples * TRACK_WIDTH)
  for (let index = 0; index < samples; index++) {
    const time                    = index * TRACK_STEP
    const { latitude, longitude } = sky.spot.value
    const east                    = drift * (time - 600) / 600
    track.set([latitude + 5, longitude + east, 60 - Math.abs(time - 600) / 5], index * 3)
  }
  sky.tracks.add([pass], track, Uint32Array.of(0), samples)
  sky.done.value = true
  sky.at.value   = seconds
  sky.held.value = pass
  sky.version.value++
  return { sky, wrapper: mount(Readout, { attachTo: document.body }) }
}

/**
 * Returns each reading's figure beside its label.
 */
const readingsOf = (wrapper: VueWrapper) =>
  wrapper.findAll('dl > div').map(column => [column.get('dd').text(), column.get('dt').text()])

/**
 * Returns the first point of an outline.
 */
const startOf = (outline: string) => outline.slice(1)
  .split('L')[0]
  .split(' ')
  .map(Number)

describe('the held pass', () => {
  it('reads how far, how high it peaks, and how high it stands while it is up', async () => {
    const { wrapper } = await mounted(600)
    expect(readingsOf(wrapper)).toEqual([['470', 'Km away'], ['60°', 'Peaks'], ['60°', 'Now']])
  })

  it('reads its nearest and that it is down before it rises', async () => {
    const { wrapper } = await mounted(100)
    expect(readingsOf(wrapper)).toEqual([['450', 'Km nearest'], ['60°', 'Peaks'], ['Down', 'Now']])
  })

  it.each([
    ['within the hour', {}, 'Up 11:52 PM – 12:02 AM'],
    ['up as the hour opens', { earlier: true, riseAt: 0 }, 'Up until 12:02 AM'],
    ['still up as it closes', { later: true, setAt: 3600 }, 'Up from 11:52 PM'],
    ['up all hour', { earlier: true, later: true, riseAt: 0, setAt: 3600 }, 'Up all hour']
  ])('gives its hours %s', async (_, changes, hours) => {
    const { wrapper } = await mounted(600, changes)
    expect(wrapper.findAll('p.caps').map(line => line.text())).toContain(hours)
  })

  it('names its kind and the way it travels', async () => {
    const { wrapper } = await mounted(600)
    expect(wrapper.text()).toContain('Crewed')
    expect(wrapper.text()).toContain('Southbound')
  })

  it.each([
    ['the point the needle shows and how high the satellite stands', 600, ['N', '000°', '60° up']],
    ['that it rises', 100, ['N', '000°', 'Rises']],
    ['that it has set', 1000, ['N', '000°', 'Set']]
  ])('sets beside its sky %s', async (_, seconds, lines) => {
    const { wrapper } = await mounted(seconds)
    expect(wrapper.findAll('svg + p > span').map(line => line.text())).toEqual(lines)
  })

  it.each([
    ['ticks where it rises and points where it sets', {}, 2],
    ['draws no tick once it is up as the hour opens', { earlier: true, riseAt: 0 }, 1],
    ['draws no arrowhead while it is still up as the hour closes', { later: true, setAt: 3600 }, 1]
  ])('%s', async (_, changes, ends) => {
    const { wrapper } = await mounted(600, changes)
    const marks       = wrapper.findAll('svg path[d]').filter(path => END.test(path.attributes('d')!))
    expect(marks.length).toBe(ends)
  })

  it('places the needle in by the height, the rise tick, and the arrowhead on a north-up sky', async () => {
    const { wrapper } = await mounted(600)
    const plan        = wrapper.get('svg[role="img"]')
    const needle      = plan.get('line')
    const ends        = plan.findAll('path[d]')
      .map(path => path.attributes('d')!)
      .filter(outline => END.test(outline))
    expect([[needle.attributes('x2'), needle.attributes('y2')].map(Number), ...ends.map(startOf)])
      .toEqual([[54, 41], [54, 24], [54, 94.5]].map(point => point.map(value => expect.closeTo(value))))
  })

  it('holds the needle where the satellite rises until it does', async () => {
    const needleAt = async (seconds: number) => {
      const needle = (await mounted(seconds, {}, 10)).wrapper.get('svg[role="img"] line')
      return [needle.attributes('x2'), needle.attributes('y2')]
    }
    expect(await needleAt(100)).toEqual(await needleAt(300))
  })

  it('returns to the count once Escape lets the pinned pass go', async () => {
    const { sky, wrapper } = await mounted(600)
    sky.held.value         = null
    sky.pinned.value       = sky.tracks.passes[0]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('output').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('output').exists()).toBe(true)
  })
})
