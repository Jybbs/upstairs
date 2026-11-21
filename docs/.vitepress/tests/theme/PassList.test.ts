// @vitest-environment happy-dom
import { flushPromises, mount }                     from '@vue/test-utils'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import type { Pass }           from '../../lib/orbit/scan.ts'
import type { sky as Sky }     from '../../lib/state/sky.ts'
import { passOf }              from '../common/passes.ts'
import { addScanned, lateSky } from '../common/sky.ts'
import { stubMatchMedia }      from '../common/stubs.ts'

/**
 * Mounts the pass list over a fresh copy of the shared state and a stand-in
 * worker, with the window opening at 11:47 PM in New York's time zone, every
 * pass the scan holds listed whatever the map frames, and `passes` in the
 * scan, after `set` has changed what else the state holds.
 */
const mounted = async (passes: Pass[], set: (sky: typeof Sky) => void = () => {}) => {
  const { component: PassList, sky } = await lateSky(() => import('../../theme/PassList.tsx'))
  addScanned(sky, passes)
  sky.scope.value = 'sky'
  set(sky)
  return { sky, wrapper: mount(PassList) }
}

/**
 * Builds `count` weather passes, a kind no craft docks to, each peaking a
 * minute after the one before it.
 */
const weatherOf = (count: number) =>
  Array.from({ length: count }, (_, id) => passOf(id, { kind: 'weather', peakAt: 300 + id * 60 }))

describe('the rows', () => {
  it('counts in the header every pass the list holds, the listed rows and those past them', async () => {
    const { wrapper } = await mounted(weatherOf(201))
    expect(wrapper.get('p > span').text()).toBe('201 passes')
  })

  it('pins the header to the page’s scroll, at the top or under the bar once the bar is fixed', async () => {
    const { wrapper } = await mounted([passOf(7)])
    const header      = wrapper.get('section > p')
    expect({
      scrolls : wrapper.get('section').classes().some(name => name.includes('overflow')),
      sticky  : header.classes('sticky'),
      top     : header.classes('top-0'),
      under   : header.classes('min-[60rem]:top-(--vp-nav-height)')
    }).toEqual({ scrolls: false, sticky: true, top: true, under: true })
  })

  it('reads each pass’s peak time, name, crossing, and highest elevation to a whole degree', async () => {
    const { wrapper }    = await mounted([passOf(7, { peak: 59.6 })])
    const [time, , peak] = wrapper.findAll('[role="option"] > span')
    const [name, path]   = wrapper.findAll('[role="option"] > span > span')
    expect([time, name, path, peak].map(found => found.text()))
      .toEqual(['11:57 PM', 'CRAFT 7', 'N → S', '60°'])
  })

  it.each([
    ['marks the chosen pass current with a bar in its kind’s color',
      (sky: typeof Sky) => { sky.selected.value = sky.tracks.passes[0] },
      { barred: true, current: 'true', faded: false }],
    ['fades a pass that has already set', (sky: typeof Sky) => { sky.at.value = 1000 },
      { barred: false, current: 'false', faded: true }],
    ['leaves a pass unfaded at the moment it sets', (sky: typeof Sky) => { sky.at.value = 900 },
      { barred: false, current: 'false', faded: false }]
  ])('%s', async (_, set, shown) => {
    const { wrapper } = await mounted([passOf(7, { kind: 'weather' })], set)
    const row         = wrapper.get('[role="option"]')
    expect({
      barred  : (row.attributes('style') ?? '').includes('inset 5px 0 0 var(--kind-weather)'),
      current : row.attributes('aria-selected'),
      faded   : row.classes('opacity-55')
    }).toEqual(shown)
  })

  it('focuses the map on a pass whose row is clicked', async () => {
    const { sky, wrapper } = await mounted(weatherOf(2))
    const pass             = sky.tracks.passes[1]
    await wrapper.findAll('[role="option"]')[1].trigger('click')
    expect([sky.selected.value, sky.pinned.value, sky.at.value]).toEqual([pass, pass, pass.peakAt])
  })

  it.each([
    ['highlights the first row on the down arrow', ['ArrowDown'], 0],
    ['highlights the row below on a second down arrow', ['ArrowDown', 'ArrowDown'], 1],
    ['highlights the row above on the up arrow', ['End', 'ArrowUp'], 1],
    ['highlights the last row on End', ['End'], 2],
    ['highlights the first row on Home', ['End', 'Home'], 0]
  ] as const)('%s', async (_, keys, highlighted) => {
    const { wrapper } = await mounted(weatherOf(3))
    for (const key of keys) await wrapper.get('[role="listbox"]').trigger('keydown', { key })
    expect(wrapper.findAll('[role="option"]').map(row => row.attributes('data-highlighted') !== undefined))
      .toEqual([0, 1, 2].map(index => index === highlighted))
  })

  it.each([
    ['a second click on its row', undefined],
    ['Enter', 'Enter'],
    ['Space', ' ']
  ])('focuses the map again on the selected pass on %s', async (_, key) => {
    const { sky, wrapper } = await mounted(weatherOf(2))
    const pass             = sky.tracks.passes[1]
    const row              = wrapper.findAll('[role="option"]')[1]
    await row.trigger('click')
    sky.at.value = 0
    await (key ? wrapper.get('[role="listbox"]').trigger('keydown', { key }) : row.trigger('click'))
    expect(sky.at.value).toBe(pass.peakAt)
  })

  it('focuses the map on the highlighted pass on Enter', async () => {
    const { sky, wrapper } = await mounted(weatherOf(3))
    const pass             = sky.tracks.passes[1]
    const list             = wrapper.get('[role="listbox"]')
    for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) await list.trigger('keydown', { key })
    expect([sky.selected.value, wrapper.findAll('[role="option"]')[1].attributes('aria-selected')])
      .toEqual([pass, 'true'])
  })
})

describe('the line beneath the list', () => {
  it.each([
    ['counts the passes past the listed rows', weatherOf(1200), false,
      ['And 1,000 more. Raise the height or zoom in to narrow the list.']],
    ['says no passes match once the scan has finished with an empty list', [], true,
      ['No passes match. Lower the height or trace another kind.']],
    ['shows nothing while a scan is still running over an empty list', [], false, []],
    ['shows nothing once a finished scan lists its passes', weatherOf(2), true, []]
  ])('%s', async (_, passes, done, lines) => {
    const { wrapper } = await mounted(passes, sky => { sky.done.value = done })
    expect(wrapper.findAll('section > p').slice(1).map(line => line.text())).toEqual(lines)
  })
})

describe('the list in its box', () => {
  /**
   * Mounts the list boxed over twelve weather passes a minute apart, each row
   * 48 px high in a box 192 px high, the scan still running, the device
   * asking for reduced motion where `reduced` is set, and returns the box
   * with each call it takes to scroll and a call that shows the share
   * `ratio` of the last row.
   */
  const boxed = async (reduced = false) => {
    const heard: ((entries: { intersectionRatio: number }[]) => void)[] = []
    stubMatchMedia(query => reduced && query.includes('reduce'))
    vi.stubGlobal('IntersectionObserver', class {
      constructor(back: (entries: { intersectionRatio: number }[]) => void) { heard.push(back) }
      disconnect() {}
      observe() {}
    })
    const { component: PassList, sky } = await lateSky(() => import('../../theme/PassList.tsx'))
    addScanned(sky, weatherOf(12))
    sky.scope.value = 'sky'
    sky.done.value  = false
    const wrapper   = mount(PassList, { props: { boxed: true } })
    const box       = wrapper.get('[role="listbox"]').element as HTMLElement
    const scrolls   = vi.fn()
    Object.defineProperties(box, {
      clientHeight : { value: 192 },
      scrollHeight : { value: 12 * 48 },
      scrollTo     : { value: scrolls }
    })
    wrapper.findAll('[role="option"]').forEach((row, index) => Object.defineProperties(row.element, {
      offsetHeight : { value: 48 },
      offsetTop    : { value: index * 48 }
    }))
    const show = (ratio: number) => heard.forEach(back => back([{ intersectionRatio: ratio }]))
    return { box, scrolls, show, sky, wrapper }
  }

  it.each([
    ['says the list runs on while its last row sits below the box', 0, true],
    ['says the list runs on while its last row shows only in part', 0.5, true],
    ['drops the line once the last row shows whole', 1, false]
  ])('%s', async (_, ratio, cue) => {
    const { show, wrapper } = await boxed()
    await flushPromises()
    show(ratio)
    await wrapper.vm.$nextTick()
    expect(wrapper.text().includes('The list runs on below')).toBe(cue)
  })

  it('opens the box on the next pass to peak when it mounts after the scan has finished', async () => {
    const { component: PassList, sky } = await lateSky(() => import('../../theme/PassList.tsx'))
    addScanned(sky, weatherOf(12))
    sky.scope.value = 'sky'
    sky.at.value    = 300 + 5 * 60
    sky.done.value  = true
    const opened: number[] = []
    const sizes            = {
      clientHeight : { get: () => 192 },
      offsetHeight : { get: () => 48 },
      offsetTop    : {
        get(this: HTMLElement) { return [...this.parentElement!.children].indexOf(this) * 48 }
      },
      scrollHeight : { get: () => 12 * 48 },
      scrollTop    : { set: (top: number) => opened.push(top) }
    }
    Object.defineProperties(HTMLElement.prototype, Object.fromEntries(Object.entries(sizes)
      .map(([name, size]) => [name, { ...size, configurable: true }])))
    onTestFinished(() => {
      Object.keys(sizes).forEach(name => Reflect.deleteProperty(HTMLElement.prototype, name))
    })
    mount(PassList, { props: { boxed: true } })
    await flushPromises()
    expect(opened).toEqual([5 * 48])
  })

  it('opens the box on the next pass to peak once the scan finishes, and only once', async () => {
    const { box, sky, wrapper } = await boxed()
    sky.at.value   = 300 + 5 * 60
    sky.done.value = true
    await wrapper.vm.$nextTick()
    const opened   = box.scrollTop
    box.scrollTop  = 0
    addScanned(sky, [passOf(99, { kind: 'weather', peakAt: 2000 })])
    await wrapper.vm.$nextTick()
    expect([opened, box.scrollTop]).toEqual([5 * 48, 0])
  })

  it('opens the box on the next pass again once a new spot’s scan finishes', async () => {
    const { box, sky, wrapper } = await boxed()
    sky.at.value   = 300 + 5 * 60
    sky.done.value = true
    await wrapper.vm.$nextTick()
    const opened   = box.scrollTop
    box.scrollTop  = 0
    sky.done.value = false
    await wrapper.vm.$nextTick()
    sky.done.value = true
    await wrapper.vm.$nextTick()
    expect([opened, box.scrollTop]).toEqual([5 * 48, 5 * 48])
  })

  it.each([
    ['scrolls a pinned row below the box up into it', 8, false, [{ behavior: 'smooth', top: 5 * 48 }]],
    ['scrolls at once under reduced motion', 8, true, [{ behavior: 'auto', top: 5 * 48 }]],
    ['leaves the box where it stands for a pinned row already in it', 2, false, []]
  ])('%s', async (_, index, reduced, calls) => {
    const { scrolls, sky, wrapper } = await boxed(reduced)
    sky.pin(sky.rows.value.list[index])
    await wrapper.vm.$nextTick()
    expect(scrolls.mock.calls.map(([options]) => options)).toEqual(calls)
  })

  it('scrolls the pinned row back into the box once rows peaking earlier push it below', async () => {
    const { component: PassList, sky } = await lateSky(() => import('../../theme/PassList.tsx'))
    addScanned(sky, weatherOf(12))
    sky.scope.value = 'sky'
    const scrolls   = vi.fn()
    const sizes     = {
      clientHeight : { get: () => 192 },
      offsetHeight : { get: () => 48 },
      offsetTop    : {
        get(this: HTMLElement) { return [...this.parentElement!.children].indexOf(this) * 48 }
      },
      scrollTo     : { value: scrolls }
    }
    Object.defineProperties(HTMLElement.prototype, Object.fromEntries(Object.entries(sizes)
      .map(([name, size]) => [name, { ...size, configurable: true }])))
    onTestFinished(() => {
      Object.keys(sizes).forEach(name => Reflect.deleteProperty(HTMLElement.prototype, name))
    })
    const wrapper = mount(PassList, { props: { boxed: true } })
    sky.pin(sky.rows.value.list[2])
    await wrapper.vm.$nextTick()
    addScanned(sky, [1, 2, 3, 4, 5, 6].map(id => passOf(100 + id, { kind: 'weather', peakAt: id })))
    await flushPromises()
    expect(scrolls.mock.calls.map(([options]) => options)).toEqual([{ behavior: 'smooth', top: 5 * 48 }])
  })
})
