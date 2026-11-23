// @vitest-environment happy-dom
import { mount }          from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref }            from 'vue'

import RidgeTip   from '../../../docs/.vitepress/theme/RidgeTip.tsx'
import { passOf } from '../common/passes.ts'

vi.mock('@vueuse/core', async original => ({
  ...await original<typeof import('@vueuse/core')>(),
  useElementSize : () => ({ height: ref(0), width: ref(120) })
}))

it.each([
  ['holds a tip near the strip’s start inside it, its notch over the peak', 10, ['0px', '10px']],
  ['centers a tip over a peak midway along the strip', 150, ['90px', '60px']],
  ['holds a tip near the strip’s end inside it, its notch over the peak', 295, ['180px', '115px']]
] as const)('%s', (_, x, shown) => {
  const wrapper = mount(RidgeTip, { props: { pass: passOf(1), width: 300, x } })
  expect([
    wrapper.get<HTMLElement>('[role="status"]').element.style.left,
    wrapper.get<HTMLElement>('span.rotate-45').element.style.left
  ]).toEqual(shown)
})
