// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { expect, it, vi }         from 'vitest'
import { defineComponent, h }     from 'vue'

import { DAY }                                       from '../../../docs/.vitepress/lib/orbit/catalog.ts'
import { kindOrder }                                 from '../../../docs/.vitepress/lib/orbit/kinds.ts'
import type { sky as Sky }                           from '../../../docs/.vitepress/lib/state/sky.ts'
import { WORDS }                                     from '../../../docs/.vitepress/lib/state/words.ts'
import { dialogListens, fakeClock, unmountOnFinish } from '../common/frames.ts'
import { passOf }                                    from '../common/passes.ts'
import { addScanned, lateSky }                       from '../common/sky.ts'
import { stubMatchMedia }                            from '../common/stubs.ts'

const FAILED = 'Error: The catalog answered 503'

/**
 * Returns the line naming the place and the time, its spacing collapsed.
 */
const lineOf = (wrapper: VueWrapper) => wrapper.get('p.caps')
  .text()
  .replace(/\s+/g, ' ')

/**
 * Mounts the readout over a fresh copy of the shared state and a stand-in
 * worker, with a catalog loaded, the scan finished, a count announced, and the
 * window opening at 11:47 PM on Tuesday, November 10, 2026 in New York's time
 * zone, read at `seconds` into it, the device asking for reduced motion where
 * `reduced` is set.
 */
const mounted = async (seconds: number, reduced = false) => {
  stubMatchMedia(query => reduced && query.includes('reduce'))
  const { component: Readout, sky } = await lateSky(() =>
    import('../../../docs/.vitepress/theme/Readout.tsx'))
  sky.loaded.value = { count: 9, fetched: sky.start.value }
  sky.done.value   = true
  sky.spoken.value = '5 satellites above the horizon'
  sky.at.value     = seconds
  return { Readout, sky, wrapper: mount(Readout) }
}

it('keeps the visible count silent and reads the spoken count from a polite region', async () => {
  const { wrapper } = await mounted(0)
  expect(wrapper.get('output').attributes('aria-live')).toBe('off')
  expect(wrapper.get('[aria-live="polite"]').text()).toBe('5 satellites above the horizon')
})

it.each([
  ['11:59 PM', 779, [], ''],
  ['12:00 AM', 780, ['Wed'], 'The time read is on Wednesday, November 11.']
])('names the weekday before the time at %s only once the day turns', async (time, at, weekday, spoken) => {
  const { wrapper } = await mounted(at)
  expect(lineOf(wrapper)).toBe(`Above Boston · ${[...weekday, time].join(' ')} EST`)
  expect(wrapper.findAll('[aria-live="polite"]')[1].text()).toBe(spoken)
})

it.each([
  ['live', 'Live'],
  ['running', '60× speed'],
  ['held', 'Paused']
] as const)('tags the %s clock beside the figure', async (clock, tag) => {
  const { sky, wrapper } = await mounted(0)
  sky.clock.value        = clock
  await wrapper.vm.$nextTick()
  expect(wrapper.get('output + span + span').text()).toBe(tag)
})

it('tags a held frame by how far it stands from the present, and draws the present on a press', async () => {
  const { sky, wrapper } = await mounted(0, true)
  sky.now.value          = 0
  sky.at.value           = 600
  await wrapper.vm.$nextTick()
  const tag = wrapper.get('button[aria-disabled]')
  expect([tag.text(), tag.attributes('aria-disabled')]).toEqual(['In 10 min', 'false'])
  const back = vi.spyOn(sky, 'back').mockImplementation(() => {})
  await tag.trigger('click')
  expect(back).toHaveBeenCalledOnce()
})

it('names the kind the tally holds last, with how many the map draws of how many are up', async () => {
  const { sky, wrapper } = await mounted(0)
  sky.reading.value      = {
    above      : 9,
    aboveKinds : kindOrder.map(kind => kind === 'earth' ? 7 : 1),
    kinds      : kindOrder.map(kind => kind === 'earth' ? 5 : 0),
    onMap      : 5
  }
  await wrapper.vm.$nextTick()
  await wrapper.get('[aria-label="Earth, 5 on this map"]').trigger('pointerenter', { pointerType: 'mouse' })
  expect(wrapper.get('p.items-center').text()).toBe('Earth · 5 of 7 up')
})

it('sets the figure to what the map draws and the last line to what stands above the horizon', async () => {
  const { sky, wrapper } = await mounted(0)
  sky.up.value           = 12
  sky.reading.value      = { ...sky.reading.value, above: 9, onMap: 5 }
  await wrapper.vm.$nextTick()
  expect([wrapper.get('output').text(), wrapper.get('p.items-center').text()]).toEqual(['5', 'Of 9 above the horizon'])
})

it.each([
  ['names each kind the counts leave out under the tally', false],
  ['names each kind the counts leave out under the count folded into the sheet', true]
])('%s, each a button showing its kind again', async (_, folded) => {
  const { Readout, sky } = await mounted(0)
  const wrapper          = mount(Readout, { props: { folded } })
  const leftOut          = () => wrapper.findAll('p').find(line => line.text().startsWith('Leaving'))?.text()
  const before           = leftOut()
  await wrapper.get('[aria-label="Show Starlink"]').trigger('click')
  expect([before, leftOut(), sky.traced.starlink]).toEqual([
    'Leaving out Comms, Starlink, Other', 'Leaving out Comms, Other', true
  ])
})

it('names each kind the counts leave out while the scan runs', async () => {
  const { sky, wrapper } = await mounted(0)
  sky.done.value         = false
  await wrapper.vm.$nextTick()
  expect([sky.waiting.value, wrapper.text()])
    .toEqual([true, expect.stringContaining('Leaving out Comms, Starlink, Other')])
})

it('names no kind left out while every kind is shown', async () => {
  const { sky, wrapper } = await mounted(0)
  sky.trace(kindOrder)
  await wrapper.vm.$nextTick()
  expect(wrapper.text()).not.toContain('Leaving out')
})

it.each([
  ['live', '11:47 PM'],
  ['running', '11:47:30 PM']
] as const)('reads the %s clock as %s', async (clock, time) => {
  const { sky, wrapper } = await mounted(30)
  sky.clock.value        = clock
  await wrapper.vm.$nextTick()
  expect(lineOf(wrapper)).toBe(`Above Boston · ${time} EST`)
})

it('cuts the place where the line runs out of room, keeping the time and its zone whole', async () => {
  const { wrapper } = await mounted(30)
  const line        = wrapper.get('p.caps')
  const time        = line.get(':scope > span:last-child')
  expect([line.classes('truncate'), line.get('button').classes('truncate'), time.classes()])
    .toEqual([false, true, expect.arrayContaining(['shrink-0', 'whitespace-pre'])])
})

it('opens the spot chooser from the place it reads', async () => {
  const { sky, wrapper } = await mounted(0)
  await wrapper.get('button[aria-expanded]').trigger('click')
  expect([sky.choosing.value, wrapper.get('button[aria-expanded]').attributes('aria-expanded')])
    .toEqual(['open', 'true'])
})

it('lets the pinned pass go on a press of the card’s close control', async () => {
  const { sky, wrapper } = await mounted(0)
  addScanned(sky, [passOf(1)])
  sky.pin(sky.tracks.passes[0])
  await wrapper.vm.$nextTick()
  await wrapper.get('button[aria-label="Close the card"]').trigger('click')
  expect([sky.pinned.value, wrapper.find('button[aria-label="Close the card"]').exists()])
    .toEqual([null, false])
})

it('sets no close control on the card of a pass the pointer only rests on', async () => {
  const { sky, wrapper } = await mounted(0)
  addScanned(sky, [passOf(1)])
  sky.held.value = sky.tracks.passes[0]
  await wrapper.vm.$nextTick()
  expect([wrapper.text().includes('CRAFT 1'), wrapper.find('button[aria-label="Close the card"]').exists()])
    .toEqual([true, false])
})

it('sets no close control on the card of a pass the pointer rests on over the pinned one', async () => {
  const { sky, wrapper } = await mounted(0)
  addScanned(sky, [passOf(1), passOf(2)])
  sky.pin(sky.tracks.passes[0])
  sky.held.value = sky.tracks.passes[1]
  await wrapper.vm.$nextTick()
  expect([wrapper.text().includes('CRAFT 2'), wrapper.find('button[aria-label="Close the card"]').exists()])
    .toEqual([true, false])
})

it('keeps the pinned pass on Escape while the spot chooser is open', async () => {
  const { sky } = await mounted(0)
  const pass    = passOf(1)
  sky.pin(pass)
  sky.choose()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(sky.pinned.value).toBe(pass)
})

it('keeps the pinned pass on Escape when the spot chooser beside it shuts', async () => {
  const { component: Readout, sky } = await lateSky(() =>
    import('../../../docs/.vitepress/theme/Readout.tsx'))
  const { default: SpotChooser }    = await import('../../../docs/.vitepress/theme/SpotChooser.tsx')
  const { provideChooser }          = await import('../../../docs/.vitepress/lib/site/chooser.ts')
  const pass                        = passOf(1)
  stubMatchMedia(() => false)
  fakeClock()
  sky.pin(pass)
  sky.choose()
  const wrapper = mount(defineComponent(() => {
    provideChooser()
    return () => h('div', [h(Readout), h(SpotChooser)])
  }), { attachTo: document.body })
  unmountOnFinish(wrapper)
  await dialogListens()
  document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  expect([sky.choosing.value, sky.pinned.value]).toEqual(['shut', pass])
})

it('settles the name of the place in letter by letter only once the spot moves', async () => {
  const { sky, wrapper } = await mounted(0)
  const settling         = () => wrapper.findAll('button[aria-expanded] i')
    .map(letter => letter.classes('motion-safe:animate-settle'))
  const before           = settling()
  sky.place.value        = 'Paris'
  await wrapper.vm.$nextTick()
  expect([before, settling()]).toEqual([before.map(() => false), [true, true, true, true, true]])
})

it.each([
  ['waits with no count while the catalog downloads', (sky: typeof Sky) => {
    sky.loaded.value = null
    sky.done.value   = false
  }, ['···', WORDS.fetching]],
  ['waits with no count until the scan places its first satellite',
    (sky: typeof Sky) => { sky.done.value = false }, ['···', 'Tracing passes 0%']],
  ['counts the satellites placed while the scan traces the rest', (sky: typeof Sky) => {
    sky.done.value  = false
    sky.share.value = 0.25
  }, ['5', 'Tracing passes 25%']]
])('%s', async (_, set, readings) => {
  const { sky, wrapper } = await mounted(0)
  sky.reading.value      = { ...sky.reading.value, above: 9, onMap: 5 }
  set(sky)
  await wrapper.vm.$nextTick()
  expect([wrapper.get('output').text(), wrapper.get('[role="status"]').text()]).toEqual(readings)
})

it.each([
  ['reads no count and offers a retry where the catalog did not load', (sky: typeof Sky) => {
    sky.loaded.value = null
    sky.failed.value = FAILED
  }, ['—', WORDS.unloaded, true]],
  ['keeps the count and offers a retry where the catalog failed partway',
    (sky: typeof Sky) => { sky.failed.value = FAILED }, ['5', WORDS.partial, true]],
  ['reads no count and the way back where the scan threw before placing anything', (sky: typeof Sky) => {
    sky.done.value     = false
    sky.untraced.value = true
  }, ['—', WORDS.untraced, false]],
  ['reads no count and the way back where the map cannot draw',
    (sky: typeof Sky) => { sky.blank.value = true }, ['—', WORDS.blank, false]]
])('%s', async (_, set, readings) => {
  const { sky, wrapper } = await mounted(0)
  sky.reading.value      = { ...sky.reading.value, above: 9, onMap: 5 }
  set(sky)
  await wrapper.vm.$nextTick()
  const alert = wrapper.get('[role="alert"]')
  expect([wrapper.get('output').text(), alert.get('p').text(), alert.find('button').exists()])
    .toEqual(readings)
})

it.each([
  ['the scan threw', (sky: typeof Sky) => { sky.untraced.value = true }],
  ['the map cannot draw', (sky: typeof Sky) => { sky.blank.value = true }]
])('sets the failure in the title face and closes on the way back where %s', async (_, set) => {
  const { sky, wrapper } = await mounted(0)
  set(sky)
  await wrapper.vm.$nextTick()
  const lines = wrapper.get('[role="alert"]').findAll('p')
  expect([lines[0].classes('font-display'), lines.at(-1)!.text()]).toEqual([true, sky.moment.value.next])
})

it.each([
  ['reads no count and the orbits’ age once the catalog has expired', false],
  ['says why a folded readout reads no count once the catalog has expired', true]
])('%s, aloud as well', async (_, folded) => {
  const { Readout, sky } = await mounted(0)
  const wrapper          = mount(Readout, { props: { folded } })
  sky.loaded.value       = { count: 9, fetched: sky.start.value - 15 * DAY }
  const aged             = 'Orbits 15 days old, too old to draw'
  await wrapper.vm.$nextTick()
  expect(['output', 'p.items-center', '[aria-live="polite"]'].map(selector => wrapper.get(selector).text()))
    .toEqual(['—', aged, aged])
})

it('leaves the orbits’ age out of a folded readout while the catalog is fresh', async () => {
  const { Readout } = await mounted(0)
  const wrapper     = mount(Readout, { props: { folded: true } })
  expect([wrapper.find('p.items-center').exists(), wrapper.get('[aria-live="polite"]').text()])
    .toEqual([false, '5 satellites above the horizon'])
})

it('sets no fixed height on the orbits’ age, so a line wrapping on a phone grows its row', async () => {
  const { Readout, sky } = await mounted(0)
  const wrapper          = mount(Readout, { props: { folded: true } })
  sky.loaded.value       = { count: 9, fetched: sky.start.value - 15 * DAY }
  await wrapper.vm.$nextTick()
  expect(wrapper.get('p.items-center').classes().filter(name => /^(max-)?h-/.test(name))).toEqual([])
})

it.each([
  ['shows the tag beside a count', false, true],
  ['drops the tag beside a dash', true, false]
])('%s', async (_, blank, tagged) => {
  const { sky, wrapper } = await mounted(0)
  sky.blank.value        = blank
  await wrapper.vm.$nextTick()
  expect(wrapper.find('output + span + span').exists()).toBe(tagged)
})

it.each([
  ['reads the pinned pass in place of the count while nothing has failed', false, [false, false]],
  ['reads the failure in place of the pinned pass', true, [true, true]]
])('%s', async (_, untraced, shown) => {
  const { sky, wrapper } = await mounted(0)
  const pass             = passOf(1)
  addScanned(sky, [pass])
  sky.pin(pass)
  sky.untraced.value = untraced
  await wrapper.vm.$nextTick()
  expect([wrapper.find('output').exists(), wrapper.find('[role="alert"]').exists()]).toEqual(shown)
})

it.each([
  ['draws the steps under the count of a folded readout while the scan traces', false, 3],
  ['leaves a folded readout to its count once the scan finishes', true, 0]
])('%s', async (_, done, steps) => {
  const { Readout, sky } = await mounted(0)
  sky.done.value          = done
  expect(mount(Readout, { props: { folded: true } }).findAll('li')).toHaveLength(steps)
})

it('loads the catalog again on a press of the retry', async () => {
  const { sky, wrapper } = await mounted(0)
  sky.failed.value       = FAILED
  const load             = vi.spyOn(sky, 'load').mockImplementation(() => {})
  await wrapper.vm.$nextTick()
  await wrapper.get('[role="alert"] button').trigger('click')
  expect(load).toHaveBeenCalledOnce()
})
