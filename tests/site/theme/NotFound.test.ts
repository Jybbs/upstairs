// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join }         from 'node:path'

import { flushPromises, mount }             from '@vue/test-utils'
import { expect, it, onTestFinished, vi }   from 'vitest'
import { type Component, ref, shallowRef } from 'vue'

import { freshSky }   from '../common/sky.ts'
import { stubCanvas } from '../common/stubs.ts'

const BELOW   = { bottom: 900, left: 0, right: 400, top: 600 }
const BOX     = '.credit-unveiled'
const CREDIT  = readFileSync(join(import.meta.dirname, '../../../docs/.vitepress/theme/credit.css'), 'utf8')
const FOOT    = { bottom: 576, left: 0, right: 400, top: 480 }
const LIP     = { bottom: 900, left: 0, right: 400, top: 584 }
const MAP     = { bottom: 600, left: 0, right: 400, top: 0 }
const NUMERAL = '[aria-label="Gather the sky into 404"]'
const OVER    = { bottom: 600, left: 0, right: 400, top: 504 }
const RING    = '[aria-label="Wait at the spot for a pass"]'

const page = vi.hoisted(() => ({
  frame   : (() => {}) as (moved: { delta: number }) => void,
  motion  : 'no-preference',
  phone   : false,
  resized : () => {},
  strip   : { bottom: 900, left: 0, right: 400, top: 600 },
  width   : 64
}))

vi.mock('vitepress', async () => {
  const { h } = await import('vue')
  return {
    defineClientComponent : (load: () => Promise<{ default: Component }>) => ({
      setup: () => {
        const loaded = shallowRef<Component>()
        void load().then(module => { loaded.value = module.default })
        return () => loaded.value && h(loaded.value)
      }
    }),
    useData               : () => ({ isDark: ref(false) })
  }
})

vi.mock('../../../docs/.vitepress/theme/SkyMap.tsx', async () => {
  const { h } = await import('vue')
  return { default: { render: () => h('div', { 'data-map': '' }) } }
})
vi.mock('../../../docs/.vitepress/theme/Credit.tsx', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ name: 'Credit', render: () => h('div', { class: 'credit-veil' }) }) }
})
vi.mock('../../../docs/.vitepress/lib/site/phone.ts', () => ({ usePhone: () => ref(page.phone) }))

vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useMediaQuery             : (query: string) => ref(page.width >= Number(query.match(/(\d+)rem/)![1])),
  useMounted                : () => ref(true),
  usePreferredReducedMotion : () => ref(page.motion),
  useRafFn                  : (frame: typeof page.frame) => {
    page.frame = frame
    return { pause: () => {}, resume: () => {} }
  },
  useResizeObserver         : (_: unknown, run: () => void) => { page.resized = run }
}))

/**
 * Returns the rectangle the page's layout gives `element`: the map's, the
 * strip's at `page.strip`, the panel's with its lip over the map's foot, the
 * credit's box at the map's foot, and every other element's below the map.
 */
const rectOf = (element: HTMLElement) => {
  if (element.querySelector('canvas')) return MAP
  if (element.matches('.credit-covered')) return page.strip
  if (element.querySelector(':scope > .credit-covered')) return LIP
  return element.matches(BOX) ? FOOT : BELOW
}

/**
 * Mounts the not-found page over a fresh copy of the shared state and a
 * stand-in worker, its map 400 by 600 pixels with the panel's lip over its foot
 * and the strip at `strip`, at `width` rem, on a device reducing motion where
 * `reduced` is set and on a phone where `phone` is, returning the messages the
 * worker is posted.
 */
const mounted = async (reduced = false, strip = BELOW, phone = false, width = 64) => {
  page.motion = reduced ? 'reduce' : 'no-preference'
  page.phone  = phone
  page.strip  = strip
  page.width  = width
  stubCanvas()
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return rectOf(this) as DOMRect
  })
  const { component: NotFound, sky } = await freshSky(() =>
    import('../../../docs/.vitepress/theme/NotFound.tsx'))
  const posted                       = vi.spyOn(Worker.prototype, 'postMessage')
  const wrapper                      = mount(NotFound)
  await flushPromises()
  return { posted, sky, wrapper }
}

/**
 * Reads the page's account of the pass over the spot: the label, the strip's
 * readings, whether its ridge stands, and whether the ring reads as pressed.
 */
const shownOf = (wrapper: Awaited<ReturnType<typeof mounted>>['wrapper']) => ({
  label    : wrapper.get('p.caps').text(),
  pressed  : wrapper.get(RING).attributes('aria-pressed'),
  readings : wrapper.findAll('dd').map(reading => reading.text()),
  ridge    : wrapper.find('path[fill-opacity]').exists()
})

const NONE = { label: 'Not found · No pass', readings: ['0', '—', '—'], ridge: false }
const ONE  = { label: 'Not found · One pass', readings: ['1', '71°', 'Now'], ridge: true }

it.each([
  ['reads no pass over the spot before the ring is pressed', false, 0, 0, { ...NONE, pressed: 'false' }],
  ['still reads no pass while the called pass crosses toward the spot', false, 1, 0.5,
    { ...NONE, pressed: 'true' }],
  ['reads one pass once the called pass reaches the spot', false, 1, 4.2, { ...ONE, pressed: 'true' }],
  ['reads one pass at once under reduced motion', true, 1, 0, { ...ONE, pressed: 'true' }],
  ['reads no pass again once the ring is pressed a second time', true, 2, 0, { ...NONE, pressed: 'false' }]
])('%s', async (_, reduced, presses, seconds, shown) => {
  const { wrapper } = await mounted(reduced)
  for (let press = 0; press < presses; press++) await wrapper.get(RING).trigger('click')
  page.frame({ delta: seconds * 1000 })
  await flushPromises()
  expect(shownOf(wrapper)).toEqual(shown)
})

it('asks for the catalog only once the numeral is pressed', async () => {
  const { posted, wrapper } = await mounted()
  const loads               = () => posted.mock.calls.filter(([asked]) => asked.type === 'load').length
  await wrapper.get(RING).trigger('click')
  page.resized()
  await flushPromises()
  const before = loads()
  await wrapper.get(NUMERAL).trigger('click')
  await flushPromises()
  expect([before, loads()]).toEqual([0, 1])
})

it.each([
  ['above the credit’s box wider than a phone', false, 432],
  ['down to the sheet’s lip on a phone', true, 536]
])('gathers the sky into 404 %s holding the hour, and back to the present on a second press',
  async (_, phone, height) => {
    const { sky, wrapper } = await mounted(false, BELOW, phone)
    const numeral          = wrapper.get(NUMERAL)
    const pressed          = async () => {
      await numeral.trigger('click')
      await flushPromises()
      return [numeral.attributes('aria-pressed'), sky.gather.value, sky.clock.value]
    }
    expect([await pressed(), await pressed()]).toEqual([
      ['true', { height, left: 24, top: 24, width: 352 }, 'held'],
      ['false', null, 'live']
    ])
  })

it('draws the sky on its map only while the numeral stands pressed', async () => {
  const { wrapper } = await mounted()
  const live        = async () => {
    await wrapper.get(NUMERAL).trigger('click')
    await flushPromises()
    return wrapper.get('[data-map]').attributes('live')
  }
  const before      = wrapper.get('[data-map]').attributes()
  expect([before.backdrop, before.live, await live(), await live()]).toEqual(['true', 'false', 'true', 'false'])
})

it('sets the numeral and the ring as unpressed toggles of type button', async () => {
  const { wrapper } = await mounted()
  const toggles     = [NUMERAL, RING].map(found => wrapper.get(found).attributes())
  expect(toggles.map(({ 'aria-pressed': pressed, type }) => [type, pressed]))
    .toEqual([['button', 'false'], ['button', 'false']])
})

it('neither loads nor gathers the sky where the numeral is pressed again before it loads', async () => {
  const { posted, sky, wrapper } = await mounted()
  const numeral                  = wrapper.get(NUMERAL)
  await numeral.trigger('click')
  await numeral.trigger('click')
  await flushPromises()
  expect([numeral.attributes('aria-pressed'), sky.gather.value, sky.clock.value, posted.mock.calls])
    .toEqual(['false', null, 'live', []])
})

it('lets the sky go and returns to the present once it unmounts gathered', async () => {
  const { sky, wrapper } = await mounted()
  await wrapper.get(NUMERAL).trigger('click')
  await flushPromises()
  wrapper.unmount()
  await flushPromises()
  expect([sky.gather.value, sky.clock.value]).toEqual([null, 'live'])
})

it('gathers the sky again on a resize only while it is gathered', async () => {
  const { sky, wrapper } = await mounted()
  page.resized()
  await flushPromises()
  const before = sky.gather.value
  await wrapper.get(NUMERAL).trigger('click')
  await flushPromises()
  const room = sky.gather.value
  page.resized()
  await flushPromises()
  expect([before, sky.gather.value === room, sky.gather.value]).toEqual([null, false, room])
})

it('names the address that holds no page, then reaches the way back, the numeral, and the ring', async () => {
  history.replaceState(null, '', '/no-such-page/')
  const { wrapper } = await mounted()
  expect(wrapper.findAll('p').map(line => line.text()).slice(0, 2)).toEqual(
    ['Not found · No pass', `There is no page at ${location.host}/no-such-page/.`])
  expect(wrapper.findAll('a, button').map(control => control.attributes('aria-label') ?? control.text()))
    .toEqual(['Back to the map', 'Gather the sky into 404', 'Wait at the spot for a pass'])
})

it.each([
  ['in a box over the map wider than a phone', false, 'canvas', undefined],
  ['over the strip in the pane below the map on a phone', true, 'span',
    { '--credit-height': '120px', '--credit-top': '480px' }]
])('draws the map’s credit %s', async (_, phone, beside, style) => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(480)
  const { wrapper } = await mounted(false, BELOW, phone)
  const credits     = wrapper.findAllComponents({ name: 'Credit' })
  const [credit]    = credits
  const holder      = phone ? credit!.element.parentElement! : credit!.element.parentElement!.parentElement!
  expect([credits.length, holder.querySelector(`:scope > ${beside}`) !== null, credit!.vm.$attrs.style])
    .toEqual([1, true, style])
})

it.each([
  ['over the sheet’s lip from 640 px', 40, 16],
  ['over the strip from 768 px', 48, 96],
  ['at the map’s foot from 1024 px', 64, 0]
])('sets the credit’s box one inset %s', async (_, width, lift) => {
  const { wrapper } = await mounted(false, OVER, false, width)
  expect(wrapper.get(BOX).attributes('style')).toBe(`margin-bottom: ${lift}px;`)
})

it.each([
  ['hides', 640, 'none'],
  ['keeps', 639, 'block']
])('%s the veil under the credit’s box at %i px', async (_, width, display) => {
  const { innerWidth } = window
  const sheet          = document.createElement('style')
  sheet.textContent    = CREDIT
  window.innerWidth    = width
  const { wrapper }    = await mounted()
  document.head.append(sheet)
  document.body.append(wrapper.element)
  onTestFinished(() => {
    window.innerWidth = innerWidth
    for (const attached of [sheet, wrapper.element]) attached.remove()
  })
  expect(getComputedStyle(wrapper.get(`${BOX} .credit-veil`).element).display).toBe(display)
})

it.each([
  ['hides the strip under the open credit on a phone, and shows it once the credit closes', true,
    [true, false]],
  ['keeps the strip shown with the credit open wider than a phone', false, [false, false]]
])('%s', async (_, phone, inert) => {
  const { sky, wrapper } = await mounted(false, BELOW, phone)
  const strip            = () => wrapper.get('.credit-covered').element.hasAttribute('inert')
  sky.credit.toggle(true)
  await flushPromises()
  const open             = strip()
  sky.credit.toggle(false)
  await flushPromises()
  expect([open, strip()]).toEqual(inert)
})

it('marks the page for the nav bar’s rule and holds its panels one inset in', async () => {
  const { wrapper } = await mounted(false, OVER)
  const padded      = ['main > div', '.md\\:order-first', '.credit-covered']
    .map(selector => wrapper.get(selector).classes().filter(each => /(^|:)px-/.test(each)))
  const boxed       = wrapper.get(BOX).classes().filter(each => each.endsWith('-inset'))
  expect([wrapper.element.matches('[data-not-found]'), ...padded, boxed])
    .toEqual([true, ['px-inset'], ['md:px-inset'], ['md:px-inset'], ['inset-x-inset', 'bottom-inset']])
})

it('sets the credit’s ring one inset from the window’s edge on a phone', () => {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(CREDIT)
  const phone = Array.from(sheet.cssRules)
    .find(rule => rule instanceof CSSMediaRule && rule.conditionText === '(width < 40rem)') as CSSMediaRule
  const ring  = Array.from(phone.cssRules)
    .find(rule => rule instanceof CSSStyleRule && rule.selectorText === '.credit-ring') as CSSStyleRule
  expect(ring.style.getPropertyValue('right')).toBe('var(--spacing-inset)')
})
