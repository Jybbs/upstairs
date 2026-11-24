import { Glob }          from 'bun'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SHEETS } from '../../../../docs/.vitepress/lib/site/sheets.ts'

const ROOT = fileURLToPath(new URL('../../../../docs', import.meta.url))

describe('Sheet', () => {
  it.each(Object.entries(SHEETS))('copies a file that exists for each source of the %s sheet', (_, sheet) =>
    expect(sheet.copy.src.filter(pattern => !new Glob(pattern).scanSync(ROOT).next().value)).toEqual([]))

  it.each(Object.entries(SHEETS))('serves the %s sheet from the copy of its first file', (_, sheet) => {
    const { copy: { dest, rename, src }, href } = sheet
    expect(`/${dest}/${src[0].split('/').slice(1 + rename.stripBase).join('/')}`).toBe(href)
  })

  it('serves each release of a sheet at an address of its own', () =>
    expect(SHEETS.map.hrefOf('6.19.0')).toBe('/maplibre-gl/maplibre-gl.css?v=6.19.0'))
})
