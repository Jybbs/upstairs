import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join }                             from 'node:path'

import { describe, expect, vi } from 'vitest'

import { run }        from '../../catalog/mint.ts'
import { it, tilded } from '../common/scratch.ts'

const OTHERS = 'machine www.space-track.org\n  login saved\n  password orbit-2026\n'
const SAVED  = `${OTHERS}machine upstairs.fyi login RUN_TOKEN password earlier\n`

/**
 * Runs the task in `home` over the saved `netrc` with `wrangler` exiting with
 * `set`, returning its status, the lines it printed, the `~/.netrc` it left,
 * and the secrets it set.
 */
const runIn = async (home: string, netrc: string, set = 0) => {
  if (netrc !== '') await writeFile(join(home, '.netrc'), netrc)
  const lines  = [] as string[]
  const io     = {
    error : (line: string) => { lines.push(line) },
    home  : home,
    print : (line: string) => { lines.push(line) },
    set   : vi.fn<Parameters<typeof run>[0]['set']>(() => set)
  }
  const status = await run(io)
  const tokens = io.set.mock.calls.map(([secrets]) => secrets.RUN_TOKEN)
  const saved  = await readFile(join(home, '.netrc'), 'utf8').catch(() => '')
  return { lines: lines.map(tilded), saved, status, tokens }
}

describe('a run of the task', () => {
  it.for([['the other entries alone', OTHERS], ['a token saved before', SAVED]])(
    'sets a new token as the secret and saves it over %s, printing nothing of it',
    async ([, netrc], { scratch }) => {
      const ran = await runIn(scratch, netrc!)
      expect(ran.status).toBe(0)
      expect(ran.tokens).toEqual([expect.stringMatching(/^[\w-]{43}$/)])
      const entry = `machine upstairs.fyi login RUN_TOKEN password ${ran.tokens[0]}`
      expect(ran.saved).toBe(`${OTHERS}${entry}\n`)
      expect(ran.lines).toEqual(['Set a new token as the catalog service’s RUN_TOKEN secret and saved it in '
                               + '~/.netrc.'])
    })

  it('makes a different token on each run', async ({ scratch }) => {
    const [first, second] = [await runIn(scratch, ''), await runIn(scratch, '')]
    expect(first.tokens[0]).not.toBe(second.tokens[0])
  })

  it('creates the saved file readable by its owner alone', async ({ scratch }) => {
    await runIn(scratch, '')
    expect((await stat(join(scratch, '.netrc'))).mode & 0o777).toBe(0o600)
  })

  it('sets no secret where the saved file cannot be read', async ({ scratch }) => {
    await mkdir(join(scratch, '.netrc'))
    const set = vi.fn(() => 0)
    await expect(run({ error: vi.fn(), home: scratch, print: vi.fn(), set }))
      .rejects.toMatchObject({ code: 'EISDIR' })
    expect(set).not.toHaveBeenCalled()
  })

  it('saves nothing where wrangler cannot set the secret, naming CLOUDFLARE_API_TOKEN',
    async ({ scratch }) => {
      const ran = await runIn(scratch, SAVED, 1)
      expect(ran.status).toBe(1)
      expect(ran.saved).toBe(SAVED)
      expect(ran.lines).toEqual([
        'Wrangler could not set the catalog service’s RUN_TOKEN secret, so run the task again as '
      + 'CLOUDFLARE_API_TOKEN=… mise run catalog:mint with a Cloudflare API token allowed to edit Workers '
      + 'Scripts.'
      ])
    })
})
