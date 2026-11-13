// @vitest-environment happy-dom
import { flushPromises, mount }       from '@vue/test-utils'
import { describe, expect, it, vi }   from 'vitest'
import { onMounted, ref, shallowRef } from 'vue'

import { SPREADS, ringGapOf, spreadOf } from '../../lib/map/overlay.ts'
import { AGES, UNLOADED }              from '../../lib/orbit/catalog.ts'
import { UNDRAWN }                     from '../../lib/state/drawings.ts'
import { TRACK_STEP }                  from '../../lib/orbit/scan.ts'
import LookAngles                      from '../../theme/LookAngles.vue'
import OrbitAges                       from '../../theme/OrbitAges.vue'
import PeakSearch                      from '../../theme/PeakSearch.vue'
import { drawingsOf }                  from '../fixtures/drawings.ts'

/**
 * The ages the drawings read in place of the fixture's, and the line a failed
 * read shows, where a case sets them.
 */
const aged = vi.hoisted(() => ({
  ages    : undefined as Float64Array | undefined,
  failure : undefined as string | undefined
}))

vi.mock('../../lib/state/drawings.ts', async original => {
  const values = await (await import('../fixtures/drawings.ts')).drawingsOf()
  return {
    ...await original<typeof import('../../lib/state/drawings.ts')>(),
    useDrawings: () => {
      const drawings = shallowRef<typeof values>()
      const failure  = ref<string>()
      onMounted(() => {
        if (aged.failure) failure.value = aged.failure
        else drawings.value = { ...values, ages: aged.ages ?? values.ages }
      })
      return { drawings, failure }
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

  it('moves to the setting look nearest the horizon for a point level with the plane past the peak', async () => {
    const wrapper = mount(LookAngles)
    await flushPromises()
    const svg     = wrapper.get('svg')
    const base    = wrapper.get('circle[r="4.5"]')
    const peak    = looks.findIndex(look => look.elevation === Math.max(...looks.map(each => each.elevation)))
    const setting = looks.slice(peak + 1).map(look => Math.abs(look.elevation))
    await svg.trigger('keydown', { key: 'End' })
    await svg.trigger('pointerdown', {
      clientX : Number(base.attributes('cx')) + 100,
      clientY : Number(base.attributes('cy'))
    })
    expect(svg.attributes('aria-valuenow')).toBe(String(peak + 1 + setting.indexOf(Math.min(...setting))))
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

  it('widens the band under the peak by the miss at each spacing', async () => {
    vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: true, removeEventListener() {} }))
    const wrapper = mount(PeakSearch)
    await flushPromises()
    const band    = () => Number(wrapper.get('rect.fill-u').attributes('height'))
    const opening = band()
    await wrapper.get('svg').trigger('keydown', { key: 'End' })
    expect(band() / opening).toBeCloseTo(drawings.scanned.miss(240) / drawings.scanned.miss(TRACK_STEP), 6)
    wrapper.unmount()
  })

  it('lands a drag held still before its release on the stop nearest the pointer', async () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    const wrapper = mount(PeakSearch)
    await flushPromises()
    const svg = wrapper.get('svg')
    const x   = (stop: number) => 16 + stop / 9 * (640 - 32)
    await svg.trigger('pointerdown', { clientX: x(1), pointerId: 1 })
    await svg.trigger('pointermove', { clientX: x(3.3), pointerId: 1 })
    vi.advanceTimersByTime(100)
    await svg.trigger('pointerup', { pointerId: 1 })
    expect(svg.attributes('aria-valuenow')).toBe('3')
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
    wrapper.unmount()
  })

  it('stands each column as tall as its share of the catalog against the largest share', async () => {
    aged.ages = Float64Array.of(0.5, 0.5, 0.5, 0.5, 5)
    const wrapper = mount(OrbitAges)
    await flushPromises()
    const columns = wrapper.findAll('rect.fill-dim, rect.fill-ink')
    const heights = columns.map(column => Number(column.attributes('height')))
    const tallest = Math.max(...heights)
    expect(heights.filter(Boolean).toSorted((a, b) => a - b)).toEqual([tallest / 4, tallest])
    wrapper.unmount()
    aged.ages = undefined
  })

  it.each([
    ['an element set at the end of the axis', AGES.limit * 2],
    ['an element set past the end of the axis', AGES.limit * 3]
  ])('counts %s in the last column, which reads every age from its lower bound on', async (_, age) => {
    aged.ages = Float64Array.of(0.5, age)
    const wrapper = mount(OrbitAges)
    await flushPromises()
    const svg = wrapper.get('svg')
    await svg.trigger('keydown', { key: 'End' })
    const readings = [...wrapper.findAll('dd').map(dd => dd.text()), svg.attributes('aria-valuetext')]
    wrapper.unmount()
    aged.ages = undefined
    expect(readings).toEqual(['25.0 D OR MORE', '50%', '25.00 days or more, 50%'])
  })
})

describe('a drawing whose values failed', () => {
  it.each([LookAngles, PeakSearch, OrbitAges].flatMap(component => [UNLOADED, UNDRAWN].map(line => ({
    component, line
  }))))('states "$line" in place of the drawing', async ({ component, line }) => {
    aged.failure = line
    const wrapper = mount(component)
    await flushPromises()
    const shown = [wrapper.text(), wrapper.find('svg').exists()]
    wrapper.unmount()
    aged.failure = undefined
    expect(shown).toEqual([line, false])
  })
})
