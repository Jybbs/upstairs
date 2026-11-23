import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join }      from 'node:path'

import { describe, expect, vi } from 'vitest'

import { RUN_ADDRESS, run } from '../../../docs/.vitepress/catalog/request.ts'
import { it, tilded }       from '../common/scratch.ts'

const CATALOG = join(import.meta.dirname, '../../../docs/.vitepress/catalog')
const HELD    = 'held-token'
const OTHERS  = 'machine www.space-track.org\n  login saved\n  password orbit-2026\n'
const SAVED   = `${OTHERS}machine upstairs.fyi login RUN_TOKEN password ${HELD}\n`

/**
 * What a run meets, meaning the saved `netrc` and the service's `reply`, beside
 * the exit status and the lines it prints.
 */
interface Case {
  lines  : string[]
  netrc  : string
  reply  : () => Response
  status : number
}

/**
 * Runs the task in `home` against `reply`, returning its status, the lines it
 * printed, and the stand-in for `fetch`.
 */
const runIn = async (home: string, netrc: string, reply: () => Response) => {
  await writeFile(join(home, '.netrc'), netrc)
  const fetcher = vi.fn(async () => reply())
  const lines   = [] as string[]
  const status  = await run({
    error : line => { lines.push(line) },
    fetch : fetcher,
    home  : home,
    print : line => { lines.push(line) }
  })
  return { fetcher, lines: lines.map(tilded), status }
}

describe('a run of the task', () => {
  it.for<[string, Case]>([
    ['passes where the service stored the elements', {
      lines: ['{"elements":"stored","satcat":"current"}'], netrc: SAVED, status: 0,
      reply: () => Response.json({ elements: 'stored', satcat: 'current' })
    }],
    ['passes where the service stored the elements while the SATCAT waits', {
      lines: ['{"elements":"stored","satcat":"waiting"}'], netrc: SAVED, status: 0,
      reply: () => Response.json({ elements: 'stored', satcat: 'waiting' })
    }],
    ['fails where the last attempt was under an hour ago', {
      netrc: SAVED, reply: () => Response.json('early'), status: 1,
      lines: [
        '"early"',
        'The last attempt was under an hour ago, so the cycle ran nothing, and a run of the task after the '
      + 'hour has passed starts one.'
      ]
    }],
    ['fails where the service stored no elements', {
      netrc: SAVED, reply: () => Response.json({ elements: 'failed', satcat: 'waiting' }), status: 1,
      lines: [
        '{"elements":"failed","satcat":"waiting"}',
        'The catalog service stored no elements, so read the catalog.failed record in its Workers Logs.'
      ]
    }],
    ['fails where the service refuses the token', {
      netrc: SAVED, reply: () => new Response(null, { status: 404 }), status: 1,
      lines: [
        'https://upstairs.fyi/catalog/run answered 404, as it does for a token other than the one the '
      + 'catalog service holds, so set a new one through mise run catalog:mint.'
      ]
    }],
    ['fails where the service fails', {
      netrc: SAVED, reply: () => new Response('', { status: 500 }), status: 1,
      lines: ['https://upstairs.fyi/catalog/run answered 500, so read the catalog service’s Workers Logs.']
    }],
    ['fails where the service cannot be reached', {
      netrc: SAVED, reply: () => { throw new TypeError('fetch failed') }, status: 1,
      lines: ['https://upstairs.fyi/catalog/run could not be reached, so run the task again once it answers.']
    }],
    ['sends nothing with no token saved', {
      netrc: OTHERS, reply: () => Response.json('early'), status: 1,
      lines: [
        'No token for the catalog service is saved in ~/.netrc, so make one through mise run catalog:mint.'
      ]
    }]
  ])('%s, printing nothing of the token', async ([, { lines, netrc, reply, status }], { scratch }) => {
    const ran = await runIn(scratch, netrc, reply)
    expect(ran.status).toBe(status)
    expect(ran.lines).toEqual(lines)
    expect(ran.lines.join('\n')).not.toContain(HELD)
  })

  it('sends a POST to the run path carrying the saved token', async ({ scratch }) => {
    const { fetcher } = await runIn(scratch, SAVED, () => Response.json('early'))
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(RUN_ADDRESS, {
      headers : { authorization: `Bearer ${HELD}` },
      method  : 'POST'
    })
  })

  it('rejects an error other than an unreachable service', async ({ scratch }) => {
    await expect(runIn(scratch, SAVED, () => { throw new RangeError('stray') })).rejects.toThrow('stray')
  })

  it('exits on the no-token line where no token is saved', async ({ scratch }) => {
    const offline = join(scratch, 'offline.ts')
    await writeFile(offline, 'globalThis.fetch = () => process.exit(2)\n')
    const ran = spawnSync(process.execPath, ['--preload', offline, join(CATALOG, 'request.ts')], {
      encoding : 'utf8',
      env      : { ...process.env, HOME: scratch },
      timeout  : 10_000
    })
    expect(ran.status).toBe(1)
    expect(ran.stdout).toBe('')
    expect(ran.stderr).toBe(`No token for the catalog service is saved in ${join(scratch, '.netrc')}, `
                          + 'so make one through mise run catalog:mint.\n')
  })
})
