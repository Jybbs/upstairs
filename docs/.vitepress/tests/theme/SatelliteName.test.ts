// @vitest-environment happy-dom
import { mount }      from '@vue/test-utils'
import { expect, it } from 'vitest'

import SatelliteName from '../../theme/SatelliteName.vue'

it('sets the base word in the heaviest weight and the number after it in the light one', () => {
  const words = mount(SatelliteName, { props: { name: 'STARLINK-31414' } }).findAll('span span')
  expect(words.map(word => [word.text(), word.classes()]))
    .toEqual([['STARLINK', ['font-extrabold']], ['-31414', ['font-light']]])
})
