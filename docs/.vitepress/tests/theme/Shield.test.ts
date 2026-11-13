// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import Shield from '../../theme/Shield.vue'

vi.mock('../../lib/site/provenance.data.ts', () => import('../fixtures/provenance.ts'))

const readings = () => mount(Shield).findAll('text').map(text => ({
  href  : text.find('a').exists() ? text.get('a').attributes('href') : undefined,
  label : text.get('.label').text(),
  value : text.get('.value').text()
}))

it('sets the version, the commit linked to its commit, and sgp4 linked to its documentation', () => {
  expect(readings()).toEqual([
    { href: undefined,                                         label: 'Version', value: '0.0.0' },
    { href: 'https://github.com/Jybbs/upstairs/commit/ec695b9', label: 'Commit',  value: 'ec695b9' },
    { href: 'https://docs.rs/sgp4/2.4.0',                      label: 'sgp4',    value: '2.4.0' }
  ])
})

it('sets the commit alone on the scroll', () => {
  expect(mount(Shield).findAll('text.scroll').map(text => text.get('.label').text())).toEqual(['Commit'])
})
