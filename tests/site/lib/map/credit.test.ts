// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve }      from 'node:path'

import type { Map }                                        from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as credit               from '../../../../docs/.vitepress/lib/map/credit.ts'
import { SOURCES, sealAnchorOf } from '../../../../docs/.vitepress/lib/site/seals.ts'
import { TILES }                 from '../../common/credits.ts'

const DATA = readFileSync(resolve(import.meta.dirname, '../../../../docs/data/index.md'), 'utf8')

/**
 * Stands in for a map whose sources `carrying` share the base's `attribution`
 * beside a source carrying none, recording each listener it takes.
 */
const mapOf = (carrying = ['base']) => {
  const canvas = document.createElement('div')
  const fired  = new globalThis.Map<string, () => void>()
  const base   = { attribution: '' }
  const map    = {
    getCanvasContainer : () => canvas,
    getSource          : (id: string) => carrying.includes(id) ? base : undefined,
    getStyle           : () => ({ sources: Object.fromEntries([...carrying, 'dem'].map(id => [id, {}])) }),
    on                 : (type: string, listener: () => void) => fired.set(type, listener),
    once               : (type: string, listener: () => void) => fired.set(type, listener)
  }
  const arrive = () => {
    base.attribution = TILES
    fired.get('sourcedata')!()
  }
  return { arrive, canvas, fired, map: map as unknown as Map }
}

it.each(credit.CREDITS)('links %s to a section or a seal the Data page carries', line => {
  const anchor = line.match(/#([\w-]+)"/)![1]!
  expect(new RegExp(`^## ${anchor}$`, 'im').test(DATA) || SOURCES.map(sealAnchorOf).includes(anchor))
    .toBe(true)
})

describe('the groups of the credit', () => {
  it('sorts each link into the tracks of its group in the order the group sets', () =>
    expect(credit.groupsOf([...credit.CREDITS, TILES]).map(group =>
      [group.heading, group.tracks.map(track => track.name)]))
      .toEqual([
        ['Sources', ['Space-Track', 'Terrain Tiles', 'OpenStreetMap']],
        ['Tiles', ['OpenFreeMap', 'OpenMapTiles']]
      ]))

  it('leaves out a group with no link shown', () =>
    expect(credit.groupsOf(credit.CREDITS).map(group => group.heading)).toEqual(['Sources']))

  it('gives each track the address its link carries and the seal its terms require', () => {
    const tracks = credit.groupsOf([...credit.CREDITS, TILES]).flatMap(group => group.tracks)
    expect(tracks.map(track => [track.href, track.source?.id])).toEqual([
      ['/data/#credits-st', 'st'],
      ['/data/#credits-tt', 'tt'],
      ['https://www.openstreetmap.org/copyright', 'osm'],
      ['https://openfreemap.org', undefined],
      ['https://www.openmaptiles.org/', 'omt']
    ])
  })
})

describe('the credit held open as the map loads', () => {
  let held: ReturnType<typeof mapOf>
  let shown: credit.Credit

  beforeEach(() => {
    vi.useFakeTimers()
    held  = mapOf()
    shown = new credit.Credit()
    shown.open.value = false
    shown.hold(held.map)
  })
  afterEach(() => vi.useRealTimers())

  it('opens and reads the lines the map credits', () => {
    expect([shown.open.value, shown.lines.value]).toEqual([true, credit.CREDITS])
    held.arrive()
    expect(shown.lines.value).toEqual([...credit.CREDITS, TILES])
  })

  it('reads a credit two sources carry once', () => {
    const shared = mapOf(['base', 'labels'])
    shown.hold(shared.map)
    shared.arrive()
    expect(shown.lines.value).toEqual([...credit.CREDITS, TILES])
  })

  it('stays open until the OpenStreetMap line arrives', () => {
    vi.advanceTimersByTime(credit.HOLD.wait * 4)
    expect(shown.open.value).toBe(true)
  })

  it('closes five seconds after the OpenStreetMap line arrives', () => {
    held.arrive()
    vi.advanceTimersByTime(4999)
    expect(shown.open.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(shown.open.value).toBe(false)
  })

  it('keeps one timer as the map sends more source data, so a press of the credit still holds it', () => {
    held.arrive()
    held.fired.get('sourcedata')!()
    shown.toggle(true)
    vi.advanceTimersByTime(credit.HOLD.wait)
    expect(shown.open.value).toBe(true)
  })

  it.each(credit.HOLD.events)('closes as soon as the reader sends a %s to the map', type => {
    held.canvas.dispatchEvent(new Event(type))
    expect(shown.open.value).toBe(false)
  })

  it('stays as the reader sets it once the reader presses it', () => {
    shown.toggle(true)
    held.arrive()
    held.canvas.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(credit.HOLD.wait)
    expect(shown.open.value).toBe(true)
    shown.toggle()
    expect(shown.open.value).toBe(false)
  })

  it('closes a credit the reader opened once the map is dragged', () => {
    shown.toggle(true)
    held.fired.get('dragstart')!()
    expect(shown.open.value).toBe(false)
  })

  it('ends the first hold once a second map takes the credit', () => {
    held.arrive()
    shown.hold(mapOf().map)
    vi.advanceTimersByTime(credit.HOLD.wait)
    expect(shown.open.value).toBe(true)
  })

  it('ends the hold once the map is removed', () => {
    held.fired.get('remove')!()
    held.arrive()
    vi.advanceTimersByTime(credit.HOLD.wait)
    expect(shown.open.value).toBe(true)
  })
})

describe('the width every track takes', () => {
  const WIDE = { '--credit-col': '12px', '--credit-pad': '6px', '--credit-seal': '64px' }

  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const html = this as HTMLElement
      const per  = html.style.width === 'min-content' ? 4 : 10
      return { width: html.textContent!.length * per } as DOMRect
    })
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(() =>
      ({ getPropertyValue: (name: keyof typeof WIDE) => WIDE[name] }) as unknown as CSSStyleDeclaration)
  })
  afterEach(() => vi.restoreAllMocks())

  const panelOf = (...lines: [string, string, string][]) => {
    const panel     = document.createElement('div')
    panel.innerHTML = lines.map(spans =>
      `<a class="credit-track">${spans.map(text => `<span>${text}</span>`).join('')}</a>`).join('')
    return panel
  }

  it.each([
    ['wide', 64 + 12 + 140 + 12],
    ['tablet', 64 + 12 + 56 + 12],
    ['phone', 70 + 12]
  ] as const)('measures the widest track %s at %d pixels', (mode, width) =>
    expect(credit.pitchOf(panelOf(['ONE', 'A credit line.', 'LICENSE'], ['TWO', 'Short', '']), mode))
      .toBe(width))
})
