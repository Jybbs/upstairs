// @vitest-environment happy-dom
import { flushPromises, mount }     from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { onMounted, shallowRef }    from 'vue'

import { TRACK_STEP } from '../../lib/orbit/scan.ts'
import LookAngles     from '../../theme/LookAngles.vue'
import OrbitAges      from '../../theme/OrbitAges.vue'
import PeakSearch     from '../../theme/PeakSearch.vue'
import { drawingsOf } from '../fixtures/drawings.ts'

vi.mock('../../lib/state/drawings.ts', async () => {
  const values = await (await import('../fixtures/drawings.ts')).drawingsOf()
  return {
    useDrawings: () => {
      const drawings = shallowRef<typeof values>()
      onMounted(() => { drawings.value = values })
      return drawings
    }
  }
})

vi.stubGlobal('ResizeObserver', class {
  constructor(private readonly seen: ResizeObserverCallback) {}
  disconnect() {}
  observe() { queueMicrotask(() => this.seen([{ contentRect: { width: 640 } }] as never, this as never)) }
})

const drawings = await drawingsOf()

/**
 * Mounts `component` once the catalog is read, pressing each of `keys` on the
 * drawing, and returns the readings it shows.
 */
const readingsOf = async (component: Parameters<typeof mount>[0], keys: string[] = []) => {
  const wrapper = mount(component)
  await flushPromises()
  for (const key of keys) await wrapper.get('svg').trigger('keydown', { key })
  const readings = wrapper.findAll('dd').map(dd => dd.text())
  wrapper.unmount()
  return readings
}

describe('the look angles', () => {
  const { looks } = drawings.highest

  it('opens on the highest look of the pass', async () => {
    const top = Math.max(...looks.map(look => look.elevation))
    expect((await readingsOf(LookAngles))[1]).toBe(`${top.toFixed(1)}°`)
  })

  it('moves to the look under a point pressed on the sky disc', async () => {
    const wrapper = mount(LookAngles)
    await flushPromises()
    const svg = wrapper.get('svg')
    await svg.trigger('keydown', { key: 'End' })
    const end = wrapper.get('circle[r="6.5"]').attributes()
    await svg.trigger('keydown', { key: 'Home' })
    await svg.trigger('pointerdown', { clientX: Number(end.cx), clientY: Number(end.cy) })
    expect(svg.attributes('aria-valuenow')).toBe(String(looks.length - 1))
    wrapper.unmount()
  })

  it('moves to the rising look nearest the horizon for a point level with the plane', async () => {
    const wrapper = mount(LookAngles)
    await flushPromises()
    const svg    = wrapper.get('svg')
    const base   = wrapper.get('circle[r="4.5"]')
    const peak   = looks.findIndex(look => look.elevation === Math.max(...looks.map(each => each.elevation)))
    const rising = looks.slice(0, peak + 1).map(look => Math.abs(look.elevation))
    await svg.trigger('pointerdown', {
      clientX : Number(base.attributes('cx')) + 100,
      clientY : Number(base.attributes('cy'))
    })
    expect(svg.attributes('aria-valuenow')).toBe(String(rising.indexOf(Math.min(...rising))))
    wrapper.unmount()
  })

  it('reads the azimuth of the last look once the pass is stepped to its end', async () => {
    const last = Math.round(looks.at(-1)!.azimuth)
    expect((await readingsOf(LookAngles, ['End']))[0]).toMatch(new RegExp(`^${last}° `))
  })
})

describe('the peak search', () => {
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: true, removeEventListener() {} }))

  it.each([
    ['opens on a sample every track step', [], `${TRACK_STEP} S`, TRACK_STEP],
    ['reads the widest spacing at the end of the scale', ['End'], '4 MIN', 240]
  ])('%s', async (_, keys, every, step) => {
    expect(await readingsOf(PeakSearch, keys)).toEqual([every, `${drawings.scanned.miss(step).toFixed(2)}°`])
  })

  it('glides to the end of the scale and settles on its reading where motion is allowed', async () => {
    vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame'] })
    const wrapper = mount(PeakSearch)
    await flushPromises()
    await wrapper.get('svg').trigger('keydown', { key: 'End' })
    const gliding = wrapper.findAll('dd')[1].text()
    vi.advanceTimersByTime(5_000)
    await flushPromises()
    expect([gliding, wrapper.findAll('dd')[1].text()])
      .toEqual([TRACK_STEP, 240].map(step => `${drawings.scanned.miss(step).toFixed(2)}°`))
    wrapper.unmount()
    vi.useRealTimers()
  })
})

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
    wrapper.unmount()
    expect(opening).toBe(Math.max(...shares))
  })
})
