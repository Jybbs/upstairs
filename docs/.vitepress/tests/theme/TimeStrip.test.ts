// @vitest-environment happy-dom
import { mount, type VueWrapper }         from '@vue/test-utils'
import { expect, it, onTestFinished, vi } from 'vitest'
import { nextTick, ref }                  from 'vue'

import { TRACK_WIDTH, type Pass } from '../../lib/orbit/scan.ts'
import type { sky as Sky }        from '../../lib/state/sky.ts'
import { passOf }                 from '../common/passes.ts'
import { addScanned, freshSky }   from '../common/sky.ts'
import { stubMatchMedia }         from '../common/stubs.ts'

/**
 * The width the strip measures, 800 px unless a case narrows it.
 */
const WIDTH = vi.hoisted(() => ({ value: 800 }))

vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useElementSize: () => ({ height: ref(0), width: ref(WIDTH.value) })
}))
vi.mock('../../theme/Credit.tsx', async () => (await import('../common/stubs.ts')).stubOf('Credit'))

/**
 * How far JetBrains Mono's O and digits reach above and below the baseline, in
 * ems, read from the font's glyph bounds of 741 and 10 units in 1,000.
 */
const CAPS = { above: 0.741, below: 0.01 } as const

/**
 * Each locale beside each page width a reader might open the strip at, and the
 * width the strip measures there, a phone's strip standing 68 px narrower than
 * its page and a wider page's 102 px.
 */
const PAGES = ['en-US', 'en-GB'].flatMap(locale => [
  ...[390, 414, 500, 600, 639].map(page => [locale, page, true, page - 68] as const),
  ...[640, 700, 768, 800, 1024, 1280, 1920].map(page => [locale, page, false, page - 102] as const)
])

/**
 * Three passes peaking at 10, 20, and 30 minutes, the middle one the highest.
 */
const THREE = [
  passOf(1),
  passOf(2, { key: '2/900', peak: 80, peakAt: 1200, riseAt: 900, setAt: 1500 }),
  passOf(3, { key: '3/1500', peak: 30, peakAt: 1800, riseAt: 1500, setAt: 2100 })
]

/**
 * Mounts the time strip over a fresh copy of the shared state and a stand-in
 * worker, with `passes` in the sky, the device asking for reduced motion where
 * `reduced` is set and being a phone where `phone` is.
 */
const mounted = async (reduced: boolean, phone = false, passes = [passOf(1)], width = 800) => {
  WIDTH.value = width
  stubMatchMedia(query => reduced && query.includes('reduce') || phone && query.includes('40rem'))
  const { component: TimeStrip, sky } = await freshSky(() => import('../../theme/TimeStrip.tsx'))
  const [pass]                        = passes
  addScanned(sky, passes)
  sky.scope.value = 'sky'
  const wrapper   = mount(TimeStrip, { attachTo: document.body })
  await wrapper.vm.$nextTick()
  return { pass, passes, sky, wrapper }
}

/**
 * Formats the strip's clocks in `locale` and opens its window at `start`, so a
 * label's width rests on neither the hour a case runs at nor the zone and the
 * locale it runs in.
 */
const clocked = async (sky: typeof Sky, wrapper: VueWrapper, locale: string, start: number) => {
  const { clockOf } = sky
  const clock       = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
  vi.spyOn(sky, 'clockOf').mockImplementation(seconds => clockOf.call(sky, seconds, clock))
  sky.start.value   = start
  await wrapper.vm.$nextTick()
}

/**
 * Returns the place in time order of each ridge the strip draws, from the back
 * to the front, read from where its peak stands across the strip.
 */
const stackOf = (wrapper: VueWrapper) => {
  const peaks = wrapper.findAll('g.cursor-pointer').map(ridge => Number(ridge.get('circle').attributes('cx')))
  const order = peaks.toSorted((a, b) => a - b)
  return peaks.map(x => order.indexOf(x))
}

it.each([
  ['runs the fast-forward from the live clock', 'live', false,
    'Run the rest of the hour at 60 times real speed', 'lapse'],
  ['returns from the fast-forward to now', 'running', false, 'Back to now', 'now'],
  ['returns from a held moment to now', 'held', false, 'Back to now', 'now'],
  ['moves a held frame five minutes on under reduced motion', 'held', true,
    'Draw the sky 5 minutes on', undefined]
] as const)('labels the round button as it %s', async (_, clock, reduced, label, mark) => {
  const { sky, wrapper } = await mounted(reduced)
  sky.clock.value        = clock
  await wrapper.vm.$nextTick()
  const button = wrapper.get('button')
  expect([button.attributes('aria-label'), button.get('svg').attributes('data-icon')]).toEqual([label, mark])
})

it.each([
  ['holds the pass whose ridge the pointer rests on', 'pointerenter', 'held'],
  ['pins the pass whose ridge a pointer presses', 'pointerdown', 'pinned']
] as const)('%s', async (_, event, field) => {
  const { pass, sky, wrapper } = await mounted(false)
  await wrapper.get('g.cursor-pointer').trigger(event)
  expect(sky[field].value).toBe(pass)
})

it('picks on a phone the pass in the column a tap lands on', async () => {
  const { pass, sky, wrapper } = await mounted(false, true)
  const strip                  = wrapper.get('svg[role="slider"]')
  Object.assign(strip.element, { setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: 100, clientY: 40 })
  await strip.trigger('pointerup', { clientX: 100, clientY: 40 })
  expect(sky.pinned.value).toBe(pass)
})

it.each([0, 1, 2])('picks on a phone pass %i when a tap lands on its peak', async index => {
  const { passes, sky, wrapper } = await mounted(false, true, THREE)
  const strip                    = wrapper.get('svg[role="slider"]')
  const x                        = wrapper.findAll('g.cursor-pointer circle')
    .map(peak => Number(peak.attributes('cx')))
    .toSorted((a, b) => a - b)[index]
  Object.assign(strip.element, { setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: x, clientY: 40 })
  await strip.trigger('pointerup', { clientX: x, clientY: 40 })
  expect(sky.pinned.value).toBe(passes[index])
})

it('draws each pass as a ridge with its outline, its crest, and its peak, and no stem', async () => {
  const { wrapper } = await mounted(false)
  const ridge       = wrapper.get('g.cursor-pointer')
  expect([ridge.findAll('path').length, ridge.findAll('circle').length, ridge.findAll('line').length])
    .toEqual([3, 1, 0])
})

it.each([
  ['stacks the lower ridges in front of the higher', null, [1, 0, 2]],
  ['raises the held ridge above the rest', 0, [1, 2, 0]]
] as const)('%s', async (_, held, expected) => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  sky.held.value                 = held === null ? null : passes[held]
  await wrapper.vm.$nextTick()
  expect(stackOf(wrapper)).toEqual(expected)
})

it.each([
  ['raises the first ridge to peak after the time read', ['ArrowUp'], 0],
  ['raises the next ridge on', ['ArrowUp', 'ArrowUp'], 1],
  ['stops at the last ridge', ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'], 2],
  ['raises the ridge before', ['ArrowUp', 'ArrowUp', 'ArrowDown'], 0]
] as const)('%s', async (_, keys, raised) => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  const strip                    = wrapper.get('svg[role="slider"]')
  for (const key of keys) await strip.trigger('keydown', { key })
  expect(sky.held.value).toBe(passes[raised])
})

it.each([
  ['moves the time a minute on with the right arrow', 'ArrowRight', 150],
  ['moves the time a minute back with the left arrow', 'ArrowLeft', 30],
  ['moves the time ten minutes on with Page Up', 'PageUp', 690],
  ['holds the time at the window’s start with Page Down', 'PageDown', 0],
  ['moves the time to the start of the window on Home', 'Home', 0],
  ['moves the time to the end of the window on End', 'End', null]
] as const)('%s, from a minute and a half in', async (_, key, at) => {
  const { sky, wrapper } = await mounted(false)
  const strip            = wrapper.get<SVGElement>('svg[role="slider"]')
  sky.seek(90)
  strip.element.focus()
  await strip.trigger('keydown', { key })
  expect(sky.at.value).toBe(at ?? sky.span)
})

it('raises nothing before the first ridge when no ridge peaks earlier', async () => {
  const { sky, wrapper } = await mounted(false, false, THREE)
  await wrapper.get('svg[role="slider"]').trigger('keydown', { key: 'ArrowDown' })
  expect(sky.held.value).toBeNull()
})

it('chooses the raised ridge on Enter', async () => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  const strip                    = wrapper.get('svg[role="slider"]')
  await strip.trigger('keydown', { key: 'ArrowUp' })
  await strip.trigger('keydown', { key: 'Enter' })
  expect(sky.pinned.value).toBe(passes[0])
})

it.each(['blur', 'pointercancel'] as const)('lets the raised ridge fall on %s', async event => {
  const { sky, wrapper } = await mounted(false, false, THREE)
  const strip            = wrapper.get('svg[role="slider"]')
  await strip.trigger('keydown', { key: 'ArrowUp' })
  await strip.trigger(event)
  expect(sky.held.value).toBeNull()
})

it('raises on a phone the ridge in the column a finger holds', async () => {
  const { pass, sky, wrapper } = await mounted(false, true)
  const strip                  = wrapper.get('svg[role="slider"]')
  Object.assign(strip.element, { setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: 100, clientY: 40 })
  expect(sky.held.value).toBe(pass)
})

it('keeps a pinned ridge in its place among the rest, so each lower peak stays pressable', async () => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  sky.pin(passes[1])
  await wrapper.vm.$nextTick()
  const crests = wrapper.findAll('g.cursor-pointer g').map(crest => crest.attributes('stroke-width'))
  expect([stackOf(wrapper), crests]).toEqual([[1, 0, 2], ['2.5', '1.5', '1.5']])
})

it('shades the outline of the ridge the readout shows deeper than the rest', async () => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  sky.pin(passes[1])
  await wrapper.vm.$nextTick()
  expect(wrapper.findAll('g.cursor-pointer > path').map(outline => outline.attributes('fill'))).toEqual(
    ['30%', '14%', '14%'].map(shade => expect.stringContaining(` ${shade}, var(--panel))`))
  )
})

it.each([
  ['a row of the list', (sky: typeof Sky, pass: Pass) => sky.focusOn(pass)],
  ['its ridge', (_: typeof Sky, __: Pass, wrapper: VueWrapper) =>
    wrapper.findAll('g.cursor-pointer')[0].trigger('pointerdown')]
] as const)('draws the pass chosen from %s in front, filled, over a bar of its kind', async (_, choose) => {
  const { passes, sky, wrapper } = await mounted(false, false, THREE)
  await choose(sky, passes[1], wrapper)
  await wrapper.vm.$nextTick()
  const chosen         = wrapper.get('[data-chosen]')
  const [outline, bar] = [chosen.get('path'), chosen.get('line')]
  const ends           = outline.attributes('d')!.match(/^M([\d.]+) .*L([\d.]+) [\d.]+Z$/)!
    .slice(1)
    .map(Number)
  expect({
    after   : chosen.element.nextElementSibling?.classList.contains('stroke-dim'),
    bar     : [
      ...['x1', 'x2'].map(end => Number(Number(bar.attributes(end)).toFixed(1))),
      bar.attributes('stroke')
    ],
    fill    : [outline.attributes('fill'), outline.attributes('fill-opacity')],
    peak    : chosen.get('circle').attributes('cx'),
    pressed : chosen.classes('pointer-events-none')
  }).toEqual({
    after   : true,
    bar     : [...ends, `var(--kind-${passes[1].kind})`],
    fill    : [`var(--kind-${passes[1].kind})`, '0.35'],
    peak    : wrapper.findAll('g.cursor-pointer')[0].get('circle').attributes('cx'),
    pressed : true
  })
})

it.each([
  ['a pointer rests on', async (wrapper: VueWrapper) => {
    await wrapper.findAll('g.cursor-pointer')[0].trigger('pointerenter')
  }],
  ['the keyboard raises', async (wrapper: VueWrapper) => {
    await wrapper.get('svg[role="slider"]').trigger('keydown', { key: 'ArrowUp' })
    await wrapper.get('svg[role="slider"]').trigger('keydown', { key: 'ArrowUp' })
  }]
] as const)('names the satellite and its highest angle for the ridge %s', async (_, raise) => {
  const { wrapper } = await mounted(false, false, THREE)
  const tip         = wrapper.get('[role="status"]')
  const before      = tip.classes('invisible')
  await raise(wrapper)
  expect([before, tip.classes('invisible'), tip.text()]).toEqual([true, false, 'CRAFT 2, Highest 80°'])
})

it('raises each pass’s own ridge to its peak elevation', async () => {
  const { wrapper } = await mounted(false, false, THREE)
  const ridges      = wrapper.findAll('g.cursor-pointer')
  const peaks       = ridges.map(ridge => ridge.get('circle'))
    .map(peak => [Number(peak.attributes('cx')), Number(peak.attributes('cy')).toFixed(1)] as const)
    .toSorted(([a], [b]) => a - b)
    .map(([, y]) => y)
  expect([peaks, new Set(ridges.map(ridge => ridge.get('path').attributes('d'))).size])
    .toEqual([['34.0', '20.7', '54.0'], 3])
})

it('colors each ridge by its pass’s kind and dots the crest where it cannot be seen', async () => {
  const passes      = [
    passOf(1), passOf(2, { key: '2/900', kind: 'weather', peakAt: 1200, riseAt: 900, setAt: 1500 })
  ]
  const { wrapper } = await mounted(false, false, passes)
  const ridges      = wrapper.findAll('g.cursor-pointer')
  expect(ridges.map(ridge => {
    const [outline, crest] = [ridge.get('path'), ridge.get('g')]
    const unseen           = ridge.get('path[stroke-dasharray="1 3"]')
    return [outline.attributes('fill'), crest.attributes('stroke'), unseen.attributes('d')!.startsWith('M')]
  })).toEqual(passes.map(({ kind }) => [
    `color-mix(in oklab, var(--kind-${kind}) 14%, var(--panel))`, `var(--kind-${kind})`, true
  ]))
})

it('draws the crest solid where the satellite can be seen by eye', async () => {
  vi.doMock('../../lib/orbit/seen.ts', () => ({ seenAt: () => true }))
  const { component: TimeStrip, sky } = await freshSky(() => import('../../theme/TimeStrip.tsx'))
  vi.doUnmock('../../lib/orbit/seen.ts')
  sky.tracks.add([passOf(1)], new Float32Array(TRACK_WIDTH * 2), new Uint32Array(1), 2)
  sky.version.value++
  sky.scope.value = 'sky'
  const wrapper   = mount(TimeStrip, { attachTo: document.body })
  await wrapper.vm.$nextTick()
  const [, seen, unseen] = wrapper.get('g.cursor-pointer').findAll('path')
  expect([seen.attributes('d')!.startsWith('M'), seen.attributes('stroke-dasharray'), unseen.attributes('d')])
    .toEqual([true, undefined, ''])
})

it('raises nothing on a phone as a pointer passes over a ridge', async () => {
  const { sky, wrapper } = await mounted(false, true)
  await wrapper.get('g.cursor-pointer').trigger('pointerenter')
  expect(sky.held.value).toBeNull()
})

it('lets the raised ridge fall once a finger drags across the strip', async () => {
  const { sky, wrapper } = await mounted(false, true)
  const strip            = wrapper.get('svg[role="slider"]')
  Object.assign(strip.element, { hasPointerCapture: () => true, setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: 100, clientY: 40 })
  await strip.trigger('pointermove', { clientX: 160, clientY: 40 })
  expect(sky.held.value).toBeNull()
})

it('raises on a phone the same pass the tap that follows chooses, with a pass pinned', async () => {
  const passes           = [
    passOf(1, { peakAt: 20, riseAt: 0 }),
    passOf(2, { kind: 'weather', peakAt: 40, riseAt: 0 })
  ]
  const { sky, wrapper } = await mounted(false, true, passes)
  const strip            = wrapper.get('svg[role="slider"]')
  const x                = Number(wrapper.get('g.cursor-pointer circle').attributes('cx'))
  sky.pin(passes[0])
  Object.assign(strip.element, { setPointerCapture() {} })
  await strip.trigger('pointerdown', { clientX: x, clientY: 40 })
  const held = sky.held.value
  await strip.trigger('pointerup', { clientX: x, clientY: 40 })
  expect([held, sky.pinned.value]).toEqual([passes[1], passes[1]])
})

it.each([
  ['labels every tick on a strip wide enough for each', false, 800, [0, 1, 2, 3, 4, 5, 6]],
  ['labels every tick on the strip of a page 768 px wide', false, 666, [0, 1, 2, 3, 4, 5, 6]],
  ['labels every tick on the strip of a page 800 px wide', false, 698, [0, 1, 2, 3, 4, 5, 6]],
  ['labels every other tick on a phone', true, 322, [0, 2, 4, 6]],
  ['labels every third tick on the narrowest phone strip', true, 250, [0, 3, 6]]
] as const)('%s', async (_, phone, width, labeled) => {
  const { sky, wrapper } = await mounted(false, phone, [passOf(1)], width)
  await clocked(sky, wrapper, 'en-US', new Date(2026, 10, 7, 22, 15).getTime())
  const ticks            = wrapper.findAll('text.fill-soft')
  expect(ticks.flatMap((tick, index) => tick.text() ? [index] : [])).toEqual(labeled)
})

it('spaces the hour labels by the root font size a reader sets', async () => {
  document.documentElement.style.fontSize = '20px'
  onTestFinished(() => { document.documentElement.style.fontSize = '' })
  const { sky, wrapper } = await mounted(false, false, [passOf(1)], 560)
  await clocked(sky, wrapper, 'en-US', new Date(2026, 10, 7, 22, 15).getTime())
  const ticks            = wrapper.findAll('text.fill-soft')
  expect(ticks.flatMap((tick, index) => tick.text() ? [index] : [])).toEqual([0, 2, 4, 6])
})

it('spaces the hour labels by the widest, where the window runs from 9 into 10 o’clock', async () => {
  const { sky, wrapper } = await mounted(false, false, [passOf(1)], 470)
  await clocked(sky, wrapper, 'en-US', new Date(2026, 10, 7, 9, 45).getTime())
  const ticks            = wrapper.findAll('text.fill-soft')
  expect(ticks.flatMap((tick, index) => tick.text() ? [index] : [])).toEqual([0, 2, 4, 6])
})

it.each(PAGES)('keeps the %s hour labels 8 px apart on a %i px page', async (locale, _, phone, width) => {
  const { sky, wrapper } = await mounted(false, phone, [passOf(1)], width)
  await clocked(sky, wrapper, locale, new Date(2026, 10, 7, 22, 15).getTime())
  const em    = phone ? 12 : 11
  const spans = wrapper.findAll('text.fill-soft')
    .filter(tick => tick.text())
    .map(tick => {
      const [x, across] = [Number(tick.attributes('x')), tick.text().length * (0.6 + 0.1) * em]
      const anchor      = tick.attributes('text-anchor') as 'end' | 'middle' | 'start'
      const left        = { end: x - across, middle: x - across / 2, start: x }[anchor]
      return [left, left + across] as const
    })
  const gaps = spans.slice(1).map(([left], index) => left - spans[index]![1])
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8)
})

it.each(PAGES)('centers each %s hour label on its tick, %i px page', async (locale, _, phone, width) => {
  const { sky, wrapper } = await mounted(false, phone, [passOf(1)], width)
  await clocked(sky, wrapper, locale, new Date(2026, 10, 7, 22, 15).getTime())
  const em     = phone ? 12 : 11
  const marks  = wrapper.findAll('line.stroke-dim').slice(1).map(tick => Number(tick.attributes('x1')))
  const labels = wrapper.findAll('text.fill-soft').map(label => ({
    anchor : label.attributes('text-anchor'),
    half   : label.text().length * (0.6 + 0.1) * em / 2,
    x      : Number(label.attributes('x'))
  }))
  expect({
    centered : labels.every(({ anchor }, index) => anchor === 'middle' && labels[index].x === marks[index]),
    inside   : labels.every(({ half, x }) => x - half >= 0 && x + half <= width)
  }).toEqual({ centered: true, inside: true })
})

it('ends the playhead’s line above the Now beneath the ground', async () => {
  const { wrapper } = await mounted(false)
  const playhead    = wrapper.get('line.stroke-u')
  const now         = wrapper.get('text.fill-ink')
  expect(Number(playhead.attributes('y2'))).toBeLessThan(Number(now.attributes('y')) - 11)
})

it.each([
  ['on a wider page', false, 11],
  ['on a phone', true, 12]
] as const)('ends the Now tick 2 px above its label and the label 2 px above the hour labels, %s',
  async (_, phone, em) => {
    const { wrapper } = await mounted(false, phone)
    const tick        = Number(wrapper.get('line.stroke-ink').attributes('y2'))
    const now         = Number(wrapper.get('text.fill-ink').attributes('y'))
    const hours       = wrapper.findAll('text.fill-soft').map(label => Number(label.attributes('y')))
    expect({
      hours : now + CAPS.below * em + 2 <= Math.min(...hours) - CAPS.above * em,
      tick  : tick + 2 <= now - CAPS.above * em
    }).toEqual({ hours: true, tick: true })
  })

it.each([
  ['sets the credit at the strip’s end on a wider page', false, true],
  ['leaves the credit to the sheet on a phone', true, false]
] as const)('%s', async (_, phone, shown) => {
  const { wrapper } = await mounted(false, phone)
  expect(wrapper.findComponent({ name: 'Credit' }).exists()).toBe(shown)
})

it('grays the strip while the credit stands open and closes it on a press of the strip', async () => {
  const { sky, wrapper } = await mounted(false)
  const strip            = wrapper.get('[aria-label="Time within the window"]')
  const grayed           = () => [sky.credit.open.value, strip.classes().includes('grayscale')]
  const loaded           = grayed()
  sky.credit.toggle(true)
  await nextTick()
  const opened           = grayed()
  await wrapper.get('button').trigger('pointerdown')
  expect([loaded, opened, grayed()]).toEqual([[false, false], [true, true], [false, false]])
})

it.each(['credit-panel', 'credit-ring'])('keeps the credit open on a press of its %s', async name => {
  const { sky, wrapper } = await mounted(false)
  const part             = document.createElement('div')
  part.className         = name
  sky.credit.toggle(true)
  wrapper.get('section').element.append(part)
  part.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(sky.credit.open.value).toBe(true)
})
