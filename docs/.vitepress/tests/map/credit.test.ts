// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve }      from 'node:path'

import type { Map }                                        from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CREDITS, HOLD, holdCredit } from '../../lib/map/credit.ts'

const DATA  = readFileSync(resolve(import.meta.dirname, '../../../data/index.md'), 'utf8')
const TILES = '<a href="https://openfreemap.org">OpenFreeMap</a> '
            + '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> '
            + 'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

it.each(CREDITS)('links %s to a section the Data page carries', credit => {
  const heading = credit.match(/#(\w+)"/)![1]
  expect(DATA).toMatch(new RegExp(`^## ${heading}$`, 'im'))
})

describe.each([true, false])('the map credit with reduced motion %s', reduced => {
  let canvas: HTMLElement
  let credit: HTMLElement
  let inner: HTMLElement
  let summary: HTMLElement
  const shown = () => credit.classList.contains('maplibregl-compact-show')
  const tiles = async () => {
    inner.insertAdjacentHTML('beforeend', TILES)
    await Promise.resolve()
  }
  const settle = async () => {
    const moving = [credit, ...credit.querySelectorAll('*')].flatMap(element => element.getAnimations())
    for (const animation of moving) animation.finish()
    await Promise.all(moving.map(animation => animation.finished))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce') }))
    document.body.innerHTML = '<div><details class="maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show"'
                            + ' open><summary class="maplibregl-ctrl-attrib-button"></summary>'
                            + `<div class="maplibregl-ctrl-attrib-inner">${CREDITS.join(' | ')}</div></details>`
                            + '<div></div></div>'
    const container = document.body.firstElementChild as HTMLElement
    canvas          = container.lastElementChild as HTMLElement
    credit          = container.firstElementChild as HTMLElement
    inner           = credit.lastElementChild as HTMLElement
    summary         = credit.firstElementChild as HTMLElement
    holdCredit({ getCanvasContainer: () => canvas, getContainer: () => container } as unknown as Map)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('stays open until the OpenStreetMap line shows', () => {
    vi.advanceTimersByTime(HOLD.wait * 4)
    expect(shown()).toBe(true)
  })
  it('stays open for five seconds after the OpenStreetMap line shows before it folds', async () => {
    await tiles()
    vi.advanceTimersByTime(4_999)
    expect(shown()).toBe(true)
    vi.advanceTimersByTime(1)
    await settle()
    expect(shown()).toBe(false)
    expect(credit.hasAttribute('open')).toBe(false)
  })
  it.each(HOLD.events)('folds as soon as the reader sends a %s to the map', async type => {
    canvas.dispatchEvent(new Event(type))
    await settle()
    expect(shown()).toBe(false)
  })
  it('leaves the credit as the reader sets it once it has folded', async () => {
    canvas.dispatchEvent(new Event('pointerdown'))
    await settle()
    credit.classList.add('maplibregl-compact-show')
    await tiles()
    vi.advanceTimersByTime(HOLD.wait)
    canvas.dispatchEvent(new Event('wheel'))
    expect(shown()).toBe(true)
  })
  it('ends the hold once the reader presses the credit itself', async () => {
    credit.dispatchEvent(new Event('pointerdown'))
    await tiles()
    vi.advanceTimersByTime(HOLD.wait)
    expect(shown()).toBe(true)
  })
  it('folds and opens on a press of the i, keeping the press from the control', async () => {
    const control = vi.fn()
    summary.addEventListener('click', control)
    summary.click()
    await settle()
    expect([shown(), credit.hasAttribute('open')]).toEqual([false, false])
    summary.click()
    await settle()
    expect([shown(), credit.hasAttribute('open')]).toEqual([true, true])
    expect(control).not.toHaveBeenCalled()
  })
  it('lets a press on a link through, leaving the credit open', () => {
    const link    = inner.querySelector('a')!
    const reached = vi.fn()
    const pressed = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.addEventListener('click', reached)
    link.dispatchEvent(pressed)
    expect([shown(), pressed.defaultPrevented, reached.mock.calls.length]).toEqual([true, false, 1])
  })
  it('stays folded when the map is pressed after the i has folded it', async () => {
    summary.click()
    await settle()
    canvas.dispatchEvent(new Event('pointerdown'))
    expect([shown(), credit.getAnimations().length]).toEqual([false, 0])
  })
  it('turns back open when the i is pressed again partway through the fold', async () => {
    summary.click()
    summary.click()
    await settle()
    expect(shown()).toBe(true)
  })
})
