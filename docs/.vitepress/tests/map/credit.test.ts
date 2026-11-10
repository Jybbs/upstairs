// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve }      from 'node:path'

import type { Map }                                        from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CREDITS, HOLD, holdCredit } from '../../lib/map/credit.ts'

const DATA = readFileSync(resolve(import.meta.dirname, '../../../data/index.md'), 'utf8')

it.each(CREDITS)('links %s to a section the Data page carries', credit => {
  const heading = credit.match(/#(\w+)"/)![1]
  expect(DATA).toMatch(new RegExp(`^## ${heading}$`, 'im'))
})

describe('the map credit', () => {
  let canvas: HTMLElement
  let credit: Element
  const shown = () => credit.classList.contains('maplibregl-compact-show')

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div><details class="maplibregl-ctrl-attrib maplibregl-compact-show" open>'
                            + '</details><div></div></div>'
    const container = document.body.firstElementChild as HTMLElement
    canvas          = container.lastElementChild as HTMLElement
    credit          = container.firstElementChild!
    holdCredit({ getCanvasContainer: () => canvas, getContainer: () => container } as unknown as Map)
  })
  afterEach(() => vi.useRealTimers())

  it('stays open for five seconds before it closes', () => {
    vi.advanceTimersByTime(4_999)
    expect(shown()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(shown()).toBe(false)
    expect(credit.hasAttribute('open')).toBe(false)
  })
  it.each(HOLD.events)('closes as soon as the reader sends a %s to the map', type => {
    canvas.dispatchEvent(new Event(type))
    expect(shown()).toBe(false)
  })
  it('leaves the credit as the reader sets it once it has closed', () => {
    canvas.dispatchEvent(new Event('pointerdown'))
    credit.classList.add('maplibregl-compact-show')
    vi.advanceTimersByTime(HOLD.wait)
    canvas.dispatchEvent(new Event('wheel'))
    expect(shown()).toBe(true)
  })
})
