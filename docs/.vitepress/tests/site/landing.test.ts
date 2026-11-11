// @vitest-environment happy-dom
import { beforeAll, expect, it } from 'vitest'

import { followFootnotes } from '../../lib/site/landing.ts'

const MARKER = (n: string) => `<sup class="footnote-ref"><a href="#footnote1">1</a>`
                            + `<a class="footnote-anchor" id="footnote-ref1${n}"></a></sup>`
const RETURN = (n: string) => `<a href="#footnote-ref1${n}" class="footnote-backref">↑</a>`

const frame  = () => new Promise(resolve => requestAnimationFrame(resolve))
const marked = () => [...document.querySelectorAll('.is-target')].map(node => node.id || node.tagName)
const follow = async (selector: string) => {
  const link = document.querySelector<HTMLAnchorElement>(selector)!
  link.click()
  location.hash = link.getAttribute('href')!
  dispatchEvent(new HashChangeEvent('hashchange'))
  await frame()
}

beforeAll(() => {
  document.body.innerHTML = `<p>A${MARKER('')} and B${MARKER(':1')}.</p><section class="footnotes"><ol>`
                          + `<li id="footnote1" class="footnote-item" tabindex="-1">Entry.<span class="fn-backs">`
                          + `${RETURN('')}${RETURN(':1')}</span></li></ol></section>`
  location.hash = '#footnote1'
  followFootnotes(document)
})

it('marks the entry the address lands on as the page loads', async () => {
  await frame()
  expect(marked()).toEqual(['footnote1'])
})

it('marks the entry a marker leads to and the return back to that marker', async () => {
  await follow('a[href="#footnote1"]:first-child')
  expect(marked()).toEqual(['footnote1'])
  expect([...document.querySelectorAll('[aria-current]')].map(node => node.getAttribute('href')))
    .toEqual(['#footnote-ref1'])
})

it('marks the marker a return leads to and clears the entry', async () => {
  await follow('a[href="#footnote-ref1:1"]')
  expect(marked()).toEqual(['SUP'])
  expect(document.querySelector('[aria-current]')).toBeNull()
})

it('moves the focus the router gives a marker anchor to the marker link', () => {
  const anchor = document.getElementById('footnote-ref1')!
  anchor.tabIndex = -1
  anchor.focus()
  expect(document.activeElement).toBe(anchor.parentElement!.querySelector('a'))
})
