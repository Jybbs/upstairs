import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { encode }   from '../../catalog/encode.ts'
import { answerOf } from '../../tools/served.ts'

const NOT_CATALOG = /^200 with a file that is not a catalog, /
const UNSTORED    = 'No catalog is stored yet'

const catalog = readFileSync(new URL('../fixtures/catalog.bin', import.meta.url))

describe('the served catalog', () => {
  it('passes a 200 holding a catalog of one record or more', async () =>
    expect(await answerOf(new Response(catalog))).toBeUndefined())

  it.each([
    ['a service with no catalog stored', new Response(UNSTORED, { status: 503 }), `503 with "${UNSTORED}"`],
    ['a route the service does not answer', new Response(null, { status: 404 }), '404 with ""'],
    ['a 200 holding a page', new Response('<html>'), expect.stringMatching(NOT_CATALOG)],
    ['a 200 holding an empty catalog', new Response(encode(0, [])), '200 with a catalog holding no records']
  ])('names the answer of %s', async (_, response, answer) =>
    expect(await answerOf(response)).toEqual(answer))
})
