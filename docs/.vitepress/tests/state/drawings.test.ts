// @vitest-environment happy-dom
import { flushPromises, mount }     from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent }          from 'vue'

import { encode }            from '../../catalog/encode.ts'
import type { Record }       from '../../lib/orbit/catalog.ts'
import { useDrawings }       from '../../lib/state/drawings.ts'
import { START, drawingsOf } from '../fixtures/drawings.ts'
import full                  from '../fixtures/records.json' with { type: 'json' }

const expected = await drawingsOf()
const file     = encode(START, full as unknown as Record[])
const served   = vi.fn(async () => new Response(file))

vi.stubGlobal('fetch', served)

const mounted = async () => {
  let drawings: ReturnType<typeof useDrawings> | undefined
  mount(defineComponent({ render: () => null, setup() { drawings = useDrawings() } }))
  await flushPromises()
  return drawings!.value
}

describe('the drawings read from the catalog', () => {
  it('reads the ages, the color, and the passes once for every drawing on the page', async () => {
    const drawings = (await mounted())!
    expect(drawings.ages.toSorted()).toEqual(expected.ages.toSorted())
    expect(drawings.color).toBe(expected.color)
    expect(drawings.highest.pass).toEqual(expected.highest.pass)
    expect(drawings.scanned.pass).toEqual(expected.scanned.pass)
    expect(await mounted()).toBe(drawings)
    expect(served).toHaveBeenCalledOnce()
  })
})
