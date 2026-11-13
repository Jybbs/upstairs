// @vitest-environment happy-dom
import { mount }      from '@vue/test-utils'
import { expect, it } from 'vitest'

import { kindColor } from '../../lib/site/palette.ts'
import Icon          from '../../theme/Icon.vue'

it.each([
  ['tints a kind’s mark in the kind’s color', 'crewed', kindColor('crewed')],
  ['leaves every other mark the color of the text around it', 'north', undefined]
] as const)('%s', (_, name, color) => {
  const style = mount(Icon, { props: { name } }).get('svg').element.style.color
  expect(style || undefined).toBe(color)
})
