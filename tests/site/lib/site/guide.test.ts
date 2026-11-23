import { readFileSync } from 'node:fs'
import { resolve }      from 'node:path'

import { describe, expect, it } from 'vitest'

import * as guide from '../../../../docs/.vitepress/lib/site/guide.ts'

const GUIDE = readFileSync(resolve(import.meta.dirname, '../../../../docs/guide/index.md'), 'utf8')

describe('the Guide’s figures', () => {
  it.each(guide.PARTS)('heads a section of the Guide with the %s figure’s title', part =>
    expect(GUIDE).toContain(`\n## ${guide.CONTROLS[part].title}\n`))

  it.each(guide.PARTS)('fills the %s figure’s slot on the Guide', part =>
    expect(GUIDE).toContain(`<template #${part}>`))

  it('lists the parts in the order the Guide’s sections take', () => {
    const at = guide.PARTS.map(part => GUIDE.indexOf(`\n## ${guide.CONTROLS[part].title}\n`))
    expect(at).toEqual(at.toSorted((a, b) => a - b))
  })

  it.each([
    ['map', '#the-map'],
    ['spot', '#choosing-the-spot'],
    ['strip', '#the-time-strip']
  ] as const)('links the %s figure to %s', (part, anchor) => expect(guide.anchorOf(part)).toBe(anchor))

  it.each(guide.PARTS)('opens the %s figure on a view holding its control inside the screen', part => {
    const [x, y, width, height]    = guide.viewOf(part)
    const [left, top, wide, tall]  = guide.CONTROLS[part].outline
    const [screenX, , screenWidth] = guide.SCREEN
    expect([x <= left, y <= top, x + width >= left + wide, y + height >= top + tall])
      .toEqual([true, true, true, true])
    expect([x >= screenX, x + width <= screenX + screenWidth, y >= 0, y + height <= guide.GRID.height])
      .toEqual([true, true, true, true])
    expect(width / height).toBeCloseTo(guide.GRID.width / guide.GRID.height)
  })

  it.each([
    ['map', [40, 0, 240, 126]],
    ['readout', [40, 16, 148.57, 78]],
    ['spot', [40, 40.35, 132, 69.3]],
    ['strip', [40, 41, 240, 126]],
    ['list', [40, 42, 240, 126]]
  ] as const)('opens the %s figure on the view %j', (part, view) =>
    expect(guide.viewOf(part)).toEqual(view.map(edge => expect.closeTo(edge, 2))))

  it('keeps every opening on the Guide within 10 words of the others', () => {
    const counts = guide.PARTS.map(part =>
      GUIDE.split(`<template #${part}>`)[1].split('</template>')[0].trim().split(/\s+/).length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(10)
  })

  it.each([
    [[0, 0, 320, 168], 'scale(1) translate(0%, 0%)'],
    [[80, 42, 160, 84], 'scale(2) translate(-25%, -25%)']
  ] as const)('zooms the figure into the view %j as %s', (view, transform) =>
    expect(guide.zoomOf(view)).toBe(transform))
})
