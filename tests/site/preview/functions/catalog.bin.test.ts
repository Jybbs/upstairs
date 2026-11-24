import { afterEach, describe, expect, it, vi } from 'vitest'

import { FILE }         from '../../../../docs/.vitepress/lib/orbit/catalog.ts'
import { onRequestGet } from '../../../../docs/.vitepress/preview/functions/catalog.bin.ts'
import manifest         from '../../../../package.json' with { type: 'json' }

const answering = (response: Response) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the preview’s catalog', () => {
  it('requests the catalog from the site’s own address', async () => {
    const fetch = answering(new Response())
    await onRequestGet({} as never)
    expect(fetch.mock.calls).toEqual([[new URL(`${manifest.homepage}/${FILE}`)]])
  })

  it.each([200, 503])('answers with the %i the catalog service gives, unchanged', async status => {
    const response = new Response(null, { status })
    answering(response)
    expect(await onRequestGet({} as never)).toBe(response)
  })
})
