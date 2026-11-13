// @vitest-environment happy-dom
import { flushPromises, mount }     from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent }          from 'vue'

import { encode }                       from '../../catalog/encode.ts'
import { UNLOADED, agesOf, type Record } from '../../lib/orbit/catalog.ts'
import { ISS }                          from '../../lib/orbit/looks.ts'
import { UNDRAWN, useDrawings }         from '../../lib/state/drawings.ts'
import { START, drawingsOf }           from '../fixtures/drawings.ts'
import full                            from '../fixtures/records.json' with { type: 'json' }

const expected    = await drawingsOf()
const fetched     = START + 17_000
const records     = full as unknown as Record[]
const listed      = [{ ...records[1], NORAD_CAT_ID: 5 }, ...records]
const file        = encode(fetched, listed)
const stationless = encode(fetched, listed.filter(record => record.NORAD_CAT_ID !== ISS))
const served      = vi.fn(async () => new Response(file))

vi.stubGlobal('fetch', served)

const mounted = async () => {
  let state: ReturnType<typeof useDrawings> | undefined
  const component = defineComponent({ render: () => null, setup() { state = useDrawings() } })
  mount(component)
  await flushPromises()
  return state!
}

describe('the drawings read from the catalog', () => {
  it.each([
    ['the catalog answers 503', () => new Response(null, { status: 503 }), UNLOADED],
    ['the catalog is not one', () => new Response('<html>'), UNLOADED],
    ['the catalog holds no space station', () => new Response(stationless), UNDRAWN]
  ])('states the failure where %s, keeping no read for a later visit', async (_, answer, line) => {
    served.mockResolvedValueOnce(answer())
    const failed = await mounted()
    expect([failed.drawings.value, failed.failure.value]).toEqual([undefined, line])
  })

  it('reads the ages, the color, and the passes once for every drawing on the page after a failed read',
    async () => {
      served.mockClear()
      const read = await mounted()
      expect([read.failure.value, served.mock.calls.length]).toEqual([undefined, 1])
      const drawings = read.drawings.value!
      served.mockClear()
      expect(drawings.ages.toSorted()).toEqual(agesOf(listed, fetched).toSorted())
      expect(drawings.color).toBe(expected.color)
      expect(drawings.highest.pass).toEqual(expected.highest.pass)
      expect(drawings.scanned.pass).toEqual(expected.scanned.pass)
      expect((await mounted()).drawings.value).toBe(drawings)
      expect(served).not.toHaveBeenCalled()
    })
})
