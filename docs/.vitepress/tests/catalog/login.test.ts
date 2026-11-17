import { mkdir, mkdtempDisposable, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir }                                              from 'node:os'
import { join }                                                from 'node:path'
import { PassThrough }                                         from 'node:stream'

import { describe, expect, test, vi } from 'vitest'

import * as login     from '../../catalog/login.ts'
import { SpaceTrack } from '../../catalog/spacetrack.ts'
import * as answers   from '../common/spacetrack.ts'

const DOWN     = () => new Response('', { status: 503 })
const OTHERS   = 'machine urs.earthdata.nasa.gov\n  login reader\n  password other\n'
const PASSWORD = 'orbit-2026'
const SAVED    = `${OTHERS}machine www.space-track.org login saved password ${PASSWORD}\n`

/**
 * What a run of the task meets, meaning Space-Track's `replies`, the saved
 * `netrc`, a prompt where `prompt` holds, and a `wrangler` exiting with `set`.
 */
interface Pose {
  argv    : string[]
  netrc   : string
  replies : (() => Response)[]
  prompt? : boolean
  set?    : number
}

/**
 * A pose beside the exit status and the one line the run returns, and the
 * `~/.netrc` it leaves, which is `netrc` unless `written` names another.
 */
interface Case extends Pose {
  line     : string
  status   : number
  written? : string
}

const it = test.extend('home', async ({ onTestFinished }) => {
  const scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-login-'))
  onTestFinished(() => scratch.remove())
  return scratch.path
})

const entryOf = (identity: string) => `machine www.space-track.org login ${identity} password ${PASSWORD}`

/**
 * Runs the task in `home` as `pose` sets out, the prompt typing `observer` and
 * `PASSWORD`, returning what it printed, its status, the `~/.netrc` it left,
 * and every stand-in it called.
 */
const runIn = async (home: string, { argv, netrc, prompt = false, replies, set = 0 }: Pose) => {
  if (netrc !== '') await writeFile(join(home, '.netrc'), netrc)
  const fetcher = answers.answering(...replies)
  const lines   = [] as string[]
  const io      = {
    error      : (line: string) => { lines.push(line) },
    home       : home,
    print      : (line: string) => { lines.push(line) },
    set        : vi.fn(() => set),
    spaceTrack : new SpaceTrack(fetcher),
    ...prompt ? { prompt: { ask: vi.fn(async () => 'observer'), conceal: async () => PASSWORD } } : {}
  }
  const status  = await login.run(argv, io)
  const written = await readFile(join(home, '.netrc'), 'utf8').catch(() => '')
  return { fetcher, io, lines, status, written }
}

const tilded = (line: string) => line.replace(/\/\S*\/\.netrc/, '~/.netrc')

describe('a run of the task', () => {
  it.for<[string, Case]>([
    ['saves an accepted login, leaving the other entries', {
      argv: [], netrc: OTHERS, prompt: true, replies: [answers.ACCEPTED, answers.LOGGED], status: 0,
      line: 'Logged in to Space-Track as observer and saved the login in ~/.netrc.',
      written: `${OTHERS}${entryOf('observer')}\n`
    }],
    ['replaces the saved login in place', {
      argv: [], netrc: SAVED, prompt: true, replies: [answers.ACCEPTED, answers.LOGGED], status: 0,
      line: 'Logged in to Space-Track as observer and saved the login in ~/.netrc.',
      written: `${OTHERS}${entryOf('observer')}\n`
    }],
    ['saves nothing where Space-Track rejects the login', {
      argv: [], netrc: SAVED, prompt: true, replies: [answers.REJECTED], status: 1,
      line: 'Space-Track rejected the login for observer, so check the username and password at '
          + 'https://www.space-track.org and run mise run catalog:login again.'
    }],
    ['saves nothing where Space-Track answers with a server error', {
      argv: [], netrc: '', prompt: true, replies: [DOWN], status: 1,
      line: 'Space-Track answered 503, so check https://www.space-track.org and run the task again once it '
          + 'answers.'
    }],
    ['asks nothing where no terminal is attached', {
      argv: [], netrc: SAVED, replies: [], status: 1,
      line: 'No terminal is attached, so run mise run catalog:login in a terminal to type the Space-Track '
          + 'login.'
    }],
    ['checks the saved login without writing', {
      argv: ['--check'], netrc: SAVED, replies: [answers.ACCEPTED, answers.LOGGED], status: 0,
      line: 'Space-Track accepted the login saved for saved.'
    }],
    ['fails a check Space-Track rejects', {
      argv: ['--check'], netrc: SAVED, replies: [answers.REJECTED], status: 1,
      line: 'Space-Track rejected the login saved for saved, so renew the account at '
          + 'https://www.space-track.org or save a new password through mise run catalog:login.'
    }],
    ['fails a check Space-Track cannot be reached for', {
      argv: ['--check'], netrc: SAVED, replies: [() => { throw new TypeError('fetch failed') }], status: 1,
      line: 'Space-Track could not be reached, so check https://www.space-track.org and run the task again '
          + 'once it answers.'
    }],
    ['fails a check with no login saved', {
      argv: ['--check'], netrc: OTHERS, replies: [], status: 1,
      line: 'No Space-Track login is saved in ~/.netrc, so save one through mise run catalog:login.'
    }],
    ['fails a check where the saved entry names no password', {
      argv: ['--check'], netrc: `${OTHERS}machine www.space-track.org login saved\n`, replies: [], status: 1,
      line: 'No Space-Track login is saved in ~/.netrc, so save one through mise run catalog:login.'
    }],
    ['sets the saved login on the catalog service', {
      argv: ['--worker'], netrc: SAVED, replies: [], status: 0,
      line: 'Set the Space-Track login for saved as the catalog service’s secrets.'
    }],
    ['fails where wrangler cannot set the secrets', {
      argv: ['--worker'], netrc: SAVED, replies: [], set: 1, status: 1,
      line: 'Wrangler could not set the catalog service’s secrets, so check its Cloudflare login through '
          + 'bun x wrangler whoami from docs/ and run the task again.'
    }],
    ['fails on a flag the task does not take', {
      argv: ['--force'], netrc: SAVED, replies: [], status: 1,
      line: 'The task takes no --force, so run mise run catalog:login with --check, --worker, both, or neither.'
    }],
    ['fails on an argument the task does not take', {
      argv: ['--check', 'observer'], netrc: SAVED, replies: [], status: 1,
      line: 'The task takes no --check observer, so run mise run catalog:login with --check, --worker, both, '
          + 'or neither.'
    }],
    ['sets nothing with no login saved', {
      argv: ['--worker'], netrc: '', replies: [], status: 1,
      line: 'No Space-Track login is saved in ~/.netrc, so save one through mise run catalog:login.'
    }]
  ])('%s, printing one line that carries no password', async ([, poses], { home }) => {
    const ran = await runIn(home, poses)
    expect(ran.status).toBe(poses.status)
    expect(ran.lines.map(tilded)).toEqual([poses.line])
    expect(ran.written).toBe(poses.written ?? poses.netrc)
    expect(ran.fetcher).toHaveBeenCalledTimes(poses.replies.length)
  })

  it('creates the saved file readable by its owner alone', async ({ home }) => {
    await runIn(home, { argv: [], netrc: '', prompt: true, replies: [answers.ACCEPTED, answers.LOGGED] })
    expect((await stat(join(home, '.netrc'))).mode & 0o777).toBe(0o600)
  })

  it('offers the username already saved', async ({ home }) => {
    const ran = await runIn(home, { argv: [], netrc: SAVED, prompt: true, replies: [answers.REJECTED] })
    expect(ran.io.prompt?.ask).toHaveBeenCalledWith('Space-Track username: ', 'saved')
  })

  it('checks the saved login before setting it as the secrets', async ({ home }) => {
    const pose = { argv: ['--check', '--worker'], netrc: SAVED, replies: [answers.REJECTED] }
    const ran  = await runIn(home, pose)
    expect(ran.status).toBe(1)
    expect(ran.io.set).not.toHaveBeenCalled()
  })

  it('passes wrangler the saved login under the names the catalog service reads', async ({ home }) => {
    const pose = { argv: ['--check', '--worker'], netrc: SAVED, replies: [answers.ACCEPTED, answers.LOGGED] }
    const ran  = await runIn(home, pose)
    expect(ran.io.set).toHaveBeenCalledWith({
      [login.SECRETS.identity] : 'saved',
      [login.SECRETS.password] : PASSWORD
    })
    expect(ran.lines).toHaveLength(2)
  })

  it('fails on a saved file it cannot read', async ({ home }) => {
    await mkdir(join(home, '.netrc'))
    const ran = runIn(home, { argv: ['--check'], netrc: '', replies: [] })
    await expect(ran).rejects.toMatchObject({ code: 'EISDIR' })
  })
})

describe('a prompt', () => {
  /**
   * Answers one question of a prompt over stand-in streams with `typed`,
   * returning the answer and everything the prompt wrote.
   */
  const answered = async (ask: (prompt: login.Prompt) => Promise<string>, typed: string) => {
    const input  = new PassThrough()
    const output = new PassThrough()
    let shown    = ''
    output.on('data', chunk => { shown += chunk })
    using prompt = new login.Prompt(input, output)
    const answer = ask(prompt)
    input.write(`${typed}\r`)
    return { answer: await answer, shown }
  }

  test('keeps the username already typed in where Enter is pressed alone', async () => {
    expect((await answered(prompt => prompt.ask('Username: ', 'saved'), '')).answer).toBe('saved')
  })

  test('trims the spaces round a typed username', async () => {
    expect((await answered(prompt => prompt.ask('Username: '), '  observer ')).answer).toBe('observer')
  })

  test('shows the query and nothing of a concealed answer', async () => {
    const { answer, shown } = await answered(prompt => prompt.conceal('Password: '), PASSWORD)
    expect(answer).toBe(PASSWORD)
    expect(shown).toBe('Password: \n')
  })
})
