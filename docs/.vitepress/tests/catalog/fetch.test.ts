import { readFile, utimes, writeFile } from 'node:fs/promises'
import { join }                        from 'node:path'

import { describe, expect, vi } from 'vitest'

import * as celestrak          from '../../catalog/celestrak.ts'
import { run }                 from '../../catalog/fetch.ts'
import * as spacetrack         from '../../catalog/spacetrack.ts'
import * as catalog            from '../../lib/orbit/catalog.ts'
import { QUERIED, contentsOf } from '../common/catalog.ts'
import * as answers            from '../common/celestrak.ts'
import { it }                  from '../common/home.ts'
import * as logins             from '../common/spacetrack.ts'

/**
 * Two copies of the catalog, the second under catalog numbers of its own.
 */
const ELEMENTS = [0, 1].flatMap(copy => QUERIED.map(record =>
  ({ ...record, NORAD_CAT_ID: record.NORAD_CAT_ID + copy * QUERIED.length })))
const NETRC = 'machine www.space-track.org login observer password orbit-2026\n'
const SAVED = Date.parse('2026-11-12T06:00:00Z')
/**
 * A SATCAT file marking every other payload active.
 */
const SATCAT = answers.satcatBody(ELEMENTS.map(({ NORAD_CAT_ID: id }, row) =>
  [id, 'PAY', row % 2 ? '-' : '+']))

/**
 * Runs the task in `home` with `argv`, Space-Track and CelesTrak answering
 * from `answer`, returning the status, what it printed, each address it
 * requested, and the records and time of the file it wrote.
 */
const runIn = async (home: string, argv: string[], answer: (url: string) => Response) => {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => answer(String(url)))
  const lines   = [] as string[]
  const target  = join(home, catalog.FILE)
  const status  = await run(argv, {
    error   : line => { lines.push(line) },
    fetcher : fetcher,
    home    : home,
    print   : line => { lines.push(line) },
    target  : target
  })
  const { fetched, records: read } = await contentsOf(await readFile(target).catch(() => undefined))
  return { fetched, lines, read, status, urls: fetcher.mock.calls.map(([url]) => String(url)) }
}

/**
 * Answers the Space-Track login, query, and logout, and CelesTrak's SATCAT
 * file, with each answer a run expects.
 */
const served = (url: string) => {
  if (url === celestrak.SATCAT) return new Response(SATCAT)
  if (url.endsWith('ajaxauth/login')) return logins.ACCEPTED()
  if (url.endsWith('ajaxauth/logout')) return logins.LOGGED()
  return Response.json(ELEMENTS)
}

describe('the catalog task', () => {
  it('builds the file from the elements Space-Track serves for the payloads SATCAT marks active, '
   + 'downloading no GP data from CelesTrak', async ({ home }) => {
    await writeFile(join(home, '.netrc'), NETRC)
    const { lines, read, status, urls } = await runIn(home, [], served)
    expect(status).toBe(0)
    expect(read.map(record => record.NORAD_CAT_ID).toSorted((a, b) => a - b))
      .toEqual(ELEMENTS.filter((_, row) => row % 2 === 0).map(record => record.NORAD_CAT_ID))
    expect(urls).toEqual([
      `${spacetrack.ORIGIN}/ajaxauth/login`, `${spacetrack.ORIGIN}/${spacetrack.QUERY}`,
      `${spacetrack.ORIGIN}/ajaxauth/logout`, celestrak.SATCAT
    ])
    expect(lines).toEqual([`5000 satellites written to ${join(home, catalog.FILE)}`])
  })

  it('reads saved files under --elements and --satcat, requesting nothing and dating the file by the '
   + 'elements file', async ({ home }) => {
    const elements = join(home, 'elements.json')
    const satcat   = join(home, 'satcat.csv')
    await writeFile(elements, JSON.stringify(ELEMENTS))
    await writeFile(satcat, SATCAT)
    await utimes(elements, SAVED / 1000, SAVED / 1000)
    const { fetched, read, status, urls } = await runIn(home, ['--elements', elements, '--satcat', satcat],
      served)
    expect([status, read.length, fetched, urls]).toEqual([0, 5000, SAVED, []])
  })

  it('fails with the reason, requesting nothing, where the --elements file holds no JSON',
    async ({ home }) => {
      const elements = join(home, 'elements.json')
      await writeFile(elements, '<html>')
      const { lines, status, urls } = await runIn(home, ['--elements', elements], served)
      expect([status, urls]).toEqual([1, []])
      expect(lines).toEqual([expect.stringContaining('JSON')])
    })

  it('rejects with the error of a --satcat path holding no file', async ({ home }) => {
    await writeFile(join(home, '.netrc'), NETRC)
    await expect(runIn(home, ['--satcat', join(home, 'satcat.csv')], served))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('fails before any request where no Space-Track login is saved', async ({ home }) => {
    const { lines, status, urls } = await runIn(home, [], served)
    expect([status, urls]).toEqual([1, []])
    expect(lines).toEqual([`No Space-Track login is saved in ${join(home, '.netrc')}, so save one through `
                         + 'mise run catalog:login.'])
  })

  it.for([
    ['Space-Track rejects the login',
      (url: string) => url.endsWith('login') ? logins.REJECTED() : served(url), 'rejected the login'],
    ['CelesTrak refuses the SATCAT file',
      (url: string) => url === celestrak.SATCAT ? new Response(null, { status: 403 }) : served(url),
      'CelesTrak answered 403'],
    ['Cloudflare cannot reach CelesTrak',
      (url: string) => url === celestrak.SATCAT ? new Response(null, { status: 522 }) : served(url),
      'Cloudflare answered 522'],
    ['too few of the payloads Space-Track serves are active',
      (url: string) => url.endsWith('format/json') ? Response.json(QUERIED) : served(url),
      'Expected 5000 or more active payloads, got 2500.']
  ] as const)('fails with the reason, writing no file, where %s', async ([, answer, reason], { home }) => {
    await writeFile(join(home, '.netrc'), NETRC)
    const { lines, read, status } = await runIn(home, [], answer)
    expect([status, read]).toEqual([1, []])
    expect(lines).toEqual([expect.stringContaining(reason)])
  })
})
