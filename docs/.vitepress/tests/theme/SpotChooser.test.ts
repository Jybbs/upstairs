// @vitest-environment happy-dom
import { mount, type VueWrapper }         from '@vue/test-utils'
import { expect, it, onTestFinished, vi } from 'vitest'
import { ref }                            from 'vue'

import { dialogListens, fakeClock, framesOf } from '../common/frames.ts'
import { freshSky }                           from '../common/sky.ts'
import { stubMatchMedia }                     from '../common/stubs.ts'

vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useElementSize: () => ({ height: ref(240) })
}))

/**
 * Mounts the spot chooser, 240 pixels tall and opened, over a fresh copy of
 * the shared state and a stand-in worker, on a phone where `phone` is set,
 * on the fake clock once its dialog listens for Escape and for presses
 * outside it. Once the case finishes, it unmounts the chooser, runs the two
 * frames its dialog's layer takes to leave the shared layer stack, and checks
 * the chooser left the document, before the clock turns real.
 */
const mounted = async (phone = false) => {
  stubMatchMedia(query => phone && query.includes('40rem'))
  const { component: SpotChooser, sky } = await freshSky(() => import('../../theme/SpotChooser.tsx'))
  fakeClock()
  sky.choose()
  const wrapper = mount(SpotChooser, { attachTo: document.body })
  onTestFinished(async () => {
    wrapper.unmount()
    await framesOf(2)
    expect(document.body).not.toContain(wrapper.element)
  })
  await dialogListens()
  return { sky, wrapper }
}

it.each([
  ['names the town under the pin above its latitude and longitude', 'Paris',
    ['PARIS', '48.86° N, 2.29° E']],
  ['gives the latitude and longitude where the pin stands on no town', null, ['48.86° N, 2.29° E']]
] as const)('%s', async (_, place, lines) => {
  const { sky, wrapper } = await mounted()
  sky.aim.value          = { place, spot: { latitude: 48.86, longitude: 2.29 } }
  await wrapper.vm.$nextTick()
  const read = wrapper.findAll('p')
    .slice(1, 1 + lines.length)
    .map(line => line.text().toUpperCase())
  expect(read).toEqual(lines)
})

it.each([
  ['sets the spot under the pin', (wrapper: VueWrapper) => wrapper.get('button').trigger('click'), 'land'],
  ['leaves on Cancel', (wrapper: VueWrapper) => wrapper.findAll('button')[1].trigger('click'), 'shut'],
  [
    'leaves on Escape',
    () => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })),
    'shut'
  ]
] as const)('%s', async (_, act, leave) => {
  const { sky, wrapper } = await mounted()
  const left             = vi.spyOn(sky, leave)
  await act(wrapper)
  expect(left).toHaveBeenCalled()
})

it.each([
  ['leaves on a press outside the chooser and the map', '', 'shut'],
  ['stays open on a press of the map', 'data-map', 'open']
] as const)('%s', async (_, marked, choosing) => {
  const { sky } = await mounted()
  const outside = document.body.appendChild(document.createElement('div'))
  if (marked) outside.setAttribute(marked, '')
  outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await framesOf(1)
  outside.remove()
  expect(sky.choosing.value).toBe(choosing)
})

it.each([
  ['raises the map by its height on a phone', true, 240],
  ['leaves the map where it stands wider than a phone', false, 0]
] as const)('%s', async (_, phone, raised) => {
  const { sky } = await mounted(phone)
  expect(sky.raised.value).toBe(raised)
})

it('sets the name under the pin in the heaviest weight of the mono', async () => {
  const { sky, wrapper } = await mounted()
  sky.aim.value          = { place: 'Paris', spot: { latitude: 48.86, longitude: 2.29 } }
  await wrapper.vm.$nextTick()
  expect(wrapper.get('[aria-live="polite"]').classes())
    .toEqual(expect.arrayContaining(['font-mono', 'font-extrabold']))
})
