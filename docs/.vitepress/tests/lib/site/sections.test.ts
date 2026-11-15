import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { navOf, sectionOf, sectionsOf } from '../../lib/site/sections.ts'

const PATHS  = ['/', ...navOf().map(({ link }) => link)]
const pageOf = (link: string) => readFileSync(new URL(`../../..${link}index.md`, import.meta.url), 'utf8')

describe('the sections', () => {
  it.each(navOf())('opens the overview of $text on its name as the heading', ({ link, text }) =>
    expect(pageOf(link)).toMatch(new RegExp(`^${'#'} ${text}$`, 'm')))
  it.each(navOf())('marks $text active on every page under $link', ({ activeMatch, link }) =>
    expect(new RegExp(activeMatch).test(`${link}page`)).toBe(true))
  it.each(navOf())('leaves $text inactive on the home page and the other sections', ({ activeMatch, link }) =>
    expect(PATHS.filter(path => path !== link && new RegExp(activeMatch).test(path))).toEqual([]))
  it.each(sectionsOf())('places every page under the folder of %s in it', section =>
    expect(sectionOf(`${section.toLowerCase()}/index.md`)).toBe(section))
  it.each(['index.md', '404.md', 'guidebook.md'])('places %s in no section', page =>
    expect(sectionOf(page)).toBeUndefined())
})
