import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { navOf } from '../../lib/site/sections.ts'

const pageOf = (link: string) => readFileSync(new URL(`../../..${link}index.md`, import.meta.url), 'utf8')

describe('the sections', () => {
  it.each(navOf())('opens the overview of $text on its name as the heading', ({ link, text }) =>
    expect(pageOf(link)).toMatch(new RegExp(`^${'#'} ${text}$`, 'm')))
  it.each(navOf())('marks $text active on every page under $link', ({ activeMatch, link }) =>
    expect(new RegExp(activeMatch).test(`${link}page`)).toBe(true))
})
