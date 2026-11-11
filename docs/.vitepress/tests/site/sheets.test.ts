import { Glob }          from 'bun'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SHEETS } from '../../lib/site/sheets.ts'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

describe('Sheet', () => {
  it.each(Object.entries(SHEETS))('copies a file that exists for each source of the %s sheet', (_, sheet) =>
    expect(sheet.copy.src.filter(pattern => !new Glob(pattern).scanSync(ROOT).next().value)).toEqual([]))

  it.each(Object.entries(SHEETS))('serves the %s sheet from the copy of its first file', (_, sheet) =>
    expect(`/${sheet.copy.dest}/${sheet.copy.src[0].split('/').slice(sheet.copy.rename.stripBase).join('/')}`)
      .toBe(sheet.href))
})
