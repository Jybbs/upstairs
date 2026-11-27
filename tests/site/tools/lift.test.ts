import { join } from 'node:path'

import { $ }                                     from 'bun'
import { afterEach, describe, expect, test, vi } from 'vitest'

import * as lift from '../../../docs/.vitepress/tools/lift.ts'
import { it }    from '../common/scratch.ts'

const CHECKOUT                       = 'a'.repeat(40)
const CODEQL                         = 'd'.repeat(40)
/**
 * The checks a case fails, each beside the texts that fail it, here the
 * `typescript` and `serde` lifts.
 */
const FAILING                        = { 'crate:test': ['=1.0.230'], 'site:check': ['"7.0.2"'] }
const LIFTED                         = 'c'.repeat(40)
const MISE                           = 'b'.repeat(40)
const NEWEST: Record<string, string> = {
  '@types/bun': '1.4.5', '@vitest/coverage-istanbul': '5.1.1', '@zag-js/dialog': '1.50.0', '@zag-js/tabs': '1.49.1',
  'bun': '1.4.6', 'github:wasm-bindgen/wasm-bindgen': '0.2.132', 'katex': '0.19.2',
  'rust': '1.100.0', 'serde': '1.0.230', 'sgp4': '2.4.0', 'typescript': '7.0.2',
  'vitepress': '2.0.0-alpha.21', 'vitest': '5.1.2', 'wasm-bindgen': '0.2.131', 'zizmor': '1.31.9'
}
const SEEDED = {
  '.github/actions/provision/action.yml': `runs:\n  steps:\n    - uses : jdx/mise-action@${MISE}\n`,

  '.github/workflows/ci.yml': [
    'jobs:', '  check:', '    steps:', `      - uses : actions/checkout@${CHECKOUT}`,
    `      - uses : jdx/mise-action@${MISE}`, `      - uses : jdx/mise-action@${MISE}`, ''
  ].join('\n'),

  '.mise/config.toml': [
    '[tools]',
    '"github:wasm-bindgen/wasm-bindgen" = "0.2.130"',
    'rust                               = { profile = "minimal", version = "1.99.1" }',
    'zizmor                             = "1.32.0"',
    ''
  ].join('\n'),

  'package.json': `${JSON.stringify({
    dependencies    : { katex: '0.19.1', vitepress: '2.0.0-alpha.21' },
    devDependencies : { typescript: '6.0.3' },
    overrides       : { katex: '0.19.1' }
  }, null, 2)}\n`,

  'rust/Cargo.toml': [
    '[dependencies]', 'sgp4         = "=2.4.0"', 'wasm-bindgen = "=0.2.130"', '',
    '[dev-dependencies]', 'serde = { features = ["derive"], version = "=1.0.229" }', ''
  ].join('\n')
}
/**
 * Reads the newest release `NEWEST` records for `name`.
 */
const newest = async (name: string) => NEWEST[name]
/**
 * The registries a case reads in place of the live ones, where only
 * `github/codeql-action` and `jdx/mise-action` stand behind their newest
 * releases.
 */
const REGISTRIES: lift.Registries = {
  action: async (repository, commit) => ['github/codeql-action', 'jdx/mise-action'].includes(repository)
    ? { commits: { current: commit, newest: LIFTED }, current: 'v5.2.7', newest: 'v5.2.9' }
    : { commits: { current: commit, newest: commit }, current: 'v7.0.1', newest: 'v7.0.1' },

  crate : newest,
  pack  : newest,
  tool  : newest
}

/**
 * A scratch repository holding `SEEDED` in one commit, where a trial's `mise`
 * calls go to a stand-in recording each and failing a check where the tree it
 * runs in holds a text the case names, while `git` runs for real.
 */
class Repo {
  readonly calls: string[][] = []

  constructor(readonly root: string, readonly failing: Record<string, string[]> = {}) {}

  static async seeded(dir: string, failing?: Record<string, string[]>): Promise<Repo> {
    const repo = new Repo(dir, failing)
    await repo.git('init', '--quiet')
    await repo.commit(SEEDED)
    return repo
  }

  /**
   * Runs `git` for real and answers every `mise` call, exiting 1 where every
   * text `failing` lists beside the call's last argument sits in one of the
   * trial's manifests.
   */
  readonly run: lift.Run = async (command, cwd, env) => {
    if (command[0] !== 'mise') return lift.shell(command, cwd, env)
    this.calls.push(command)
    const texts = await Promise.all(Object.keys(SEEDED).map(path => Bun.file(join(cwd, path)).text()))
    const fails = this.failing[command.at(-1)!]?.every(text => texts.some(file => file.includes(text)))
    return { exitCode: fails ? 1 : 0, output: fails ? `${command.at(-1)} failed` : '' }
  }

  /**
   * Writes each of `files` into the repository and commits them.
   */
  async commit(files: Record<string, string>) {
    for (const [path, text] of Object.entries(files)) await Bun.write(join(this.root, path), text)
    await this.git('add', '--all')
    await this.git('-c', 'user.email=lift@upstairs.fyi', '-c', 'user.name=lift', 'commit', '-qm', 'seed')
  }

  git(...args: string[]): Promise<string> {
    return $`git ${args}`.cwd(this.root).quiet().text()
  }

  lift(...args: string[]): Promise<string> {
    return lift.lift(args, this.root, REGISTRIES, this.run)
  }

  read(path: string): Promise<string> {
    return Bun.file(join(this.root, path)).text()
  }
}

/**
 * The cell each row of a table holds in `column`, counted from the end where
 * negative.
 */
const columnOf = (table: string, column: number) =>
  table.split('\n').map(row => row.split(/\s{2,}/).at(column))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe.concurrent('lift', () => {
  it('lists each pin behind its newest release, linked pins at the lower newest',
    async ({ expect, scratch }) =>
      expect(await (await Repo.seeded(scratch)).lift()).toMatchInlineSnapshot(`
        "SOURCE   PIN                               CURRENT  NEWEST   HOLD
        actions  jdx/mise-action                   v5.2.7   v5.2.9
        bun      katex                             0.19.1   0.19.2
        bun      typescript                        6.0.3    7.0.2
        cargo    serde                             1.0.229  1.0.230
        cargo    wasm-bindgen                      0.2.130  0.2.131
        mise     github:wasm-bindgen/wasm-bindgen  0.2.130  0.2.131
        mise     rust                              1.99.1   1.100.0"
      `))

  it('records a hold, which holds the pin linked to the one named out of a trial',
    async ({ expect, scratch }) => {
      const repo  = await Repo.seeded(scratch)
      const table = await repo.lift('--try', '--hold', 'wasm-bindgen', 'Waits', 'on', 'the', 'bindings')
      expect(await repo.read(lift.HOLDS)).toBe('wasm-bindgen = "Waits on the bindings"\n')
      expect(columnOf(table, -1))
        .toEqual(['TRIAL', 'passes', 'passes', 'passes', 'passes', 'held', 'held', 'passes'])
      expect(columnOf(table, -2).slice(5, 7)).toEqual(['Waits on the bindings', 'Waits on the bindings'])
    })

  it('lifts and holds bun and its types as one pin, at the lower newest', async ({ expect, scratch }) => {
    const repo     = await Repo.seeded(scratch)
    const manifest = JSON.parse(SEEDED['package.json'])
    await repo.commit({
      '.mise/config.toml' : SEEDED['.mise/config.toml'].replace('[tools]', '[tools]\nbun = "1.4.4"'),
      'package.json' : `${JSON.stringify({
        ...manifest, devDependencies: { '@types/bun': '1.4.4', ...manifest.devDependencies }
      }, null, 2)}\n`
    })
    const bun = (table: string) => table.split('\n').filter(row => / (@types\/)?bun /.test(row))
    expect(bun(await repo.lift())).toEqual([
      expect.stringMatching(/^bun +@types\/bun +1\.4\.4 +1\.4\.5$/),
      expect.stringMatching(/^mise +bun +1\.4\.4 +1\.4\.5$/)
    ])
    expect(bun(await repo.lift('--hold', '@types/bun', 'Waits')).map(row => row.endsWith('Waits')))
      .toEqual([true, true])
    await Bun.write(join(scratch, lift.HOLDS), '')
    await repo.lift('--write')
    expect(await repo.read('.mise/config.toml')).toContain('bun = "1.4.5"')
    expect(JSON.parse(await repo.read('package.json')).devDependencies['@types/bun']).toBe('1.4.5')
  })

  it('lifts and holds each tied package set as one pin, at the lowest newest among its members',
    async ({ expect, scratch }) => {
      const repo     = await Repo.seeded(scratch)
      const manifest = JSON.parse(SEEDED['package.json'])
      await repo.commit({
        'package.json': `${JSON.stringify({
          ...manifest,
          devDependencies: {
            ...manifest.devDependencies,
            '@vitest/coverage-istanbul': '5.1.0', '@zag-js/dialog': '1.49.0', '@zag-js/tabs': '1.49.0', 'vitest': '5.1.0'
          }
        }, null, 2)}\n`
      })
      const tied = (table: string) =>
        table.split('\n').filter(row => /@zag-js|vitest/.test(row)).map(row => row.split(/\s{2,}/).slice(1))
      expect(tied(await repo.lift())).toEqual([
        ['@vitest/coverage-istanbul', '5.1.0', '5.1.1'], ['vitest', '5.1.0', '5.1.1'],
        ['@zag-js/dialog', '1.49.0', '1.49.1'], ['@zag-js/tabs', '1.49.0', '1.49.1']
      ])
      expect((await repo.lift('--hold', '@zag-js/tabs', 'Waits')).split('\n')
        .filter(row => /@zag-js|vitest/.test(row)).map(row => row.endsWith('Waits')))
        .toEqual([false, false, true, true])
      await Bun.write(join(scratch, lift.HOLDS), '')
      await repo.lift('--write')
      const pins = JSON.parse(await repo.read('package.json')).devDependencies
      expect([pins['@zag-js/dialog'], pins['@zag-js/tabs'], pins.vitest, pins['@vitest/coverage-istanbul']])
        .toEqual(['1.49.1', '1.49.1', '5.1.1', '5.1.1'])
    })

  it('reads a hold recorded by an earlier run into the table', async ({ expect, scratch }) => {
    const repo = await Repo.seeded(scratch)
    await Bun.write(join(scratch, lift.HOLDS), 'rust = "Waits on the toolchain"\n')
    expect((await repo.lift()).split('\n').at(-1)).toMatch(/rust .* Waits on the toolchain$/)
  })

  it('replaces the reason an earlier hold on the same pin recorded', async ({ expect, scratch }) => {
    const repo = await Repo.seeded(scratch)
    await repo.lift('--hold', 'rust', 'Waits')
    await repo.lift('--hold', 'katex', 'Waits', 'on', 'KaTeX')
    await repo.lift('--hold', 'rust', 'Waits', 'longer')
    expect(await repo.read(lift.HOLDS)).toBe('rust = "Waits longer"\nkatex = "Waits on KaTeX"\n')
  })

  it('refuses to try or write over a change the last commit lacks', async ({ expect, scratch }) => {
    const repo   = await Repo.seeded(scratch)
    const edited = SEEDED['.mise/config.toml'].replace('"1.99.1"', '"1.99.2"')
    await Bun.write(join(scratch, '.mise/config.toml'), edited)
    await expect(repo.lift('--write')).rejects.toThrow(/refusing a change to \.mise\/config\.toml$/)
    expect(await repo.read('.mise/config.toml')).toBe(edited)
    expect(repo.calls).toEqual([])
  })

  it('tries the lifts over a hold changed since the last commit', async ({ expect, scratch }) => {
    const repo = await Repo.seeded(scratch)
    await repo.commit({ [lift.HOLDS]: 'rust = "Waits"\n' })
    await Bun.write(join(scratch, lift.HOLDS), 'rust = "Waits longer"\n')
    expect((await repo.lift('--try')).split('\n').at(-1)).toMatch(/rust .* Waits longer +held$/)
  })

  it('runs every command of a trial under the scratch homes', async ({ expect, scratch }) => {
    const repo  = await Repo.seeded(scratch)
    const homes = new Set<string | undefined>()
    await lift.lift(['--try'], scratch, REGISTRIES, async (command, cwd, env) => {
      if (command[0] === 'mise') homes.add(env?.MISE_DATA_DIR)
      return repo.run(command, cwd, env)
    })
    expect([...homes]).toEqual([expect.stringMatching(/\/upstairs-lift-\w+\/homes\/mise-data$/)])
  })

  it('runs no trial where every lift is held', async ({ expect, scratch }) => {
    const repo  = await Repo.seeded(scratch)
    const names = ['jdx/mise-action', 'katex', 'typescript', 'serde', 'wasm-bindgen', 'rust']
    await Bun.write(join(scratch, lift.HOLDS), names.map(name => `"${name}" = "Waits"\n`).join(''))
    expect((await repo.lift('--try')).split('\n')[0]).not.toContain('TRIAL')
    expect(repo.calls).toEqual([])
  })

  it('copies the ignored catalog into the tree each trial runs in', async ({ expect, scratch }) => {
    const repo  = await Repo.seeded(scratch)
    const found = new Set<boolean>()
    await Bun.write(join(scratch, 'docs/public/catalog.bin'), 'catalog')
    const run: lift.Run = async (command, cwd, env) => {
      if (command[0] === 'mise') found.add(await Bun.file(join(cwd, 'docs/public/catalog.bin')).exists())
      return repo.run(command, cwd, env)
    }
    await lift.lift(['--try'], scratch, REGISTRIES, run)
    expect([...found]).toEqual([true])
  })

  it.for([
    { args: ['--hold', 'rust'], message: '--hold rust takes a reason after the pin' },
    { args: ['--hold', 'rustc', 'Waits'], message: '--hold rustc names no pin' }
  ])('refuses a hold with $message, recording nothing', async ({ args, message }, { expect, scratch }) => {
    const repo = await Repo.seeded(scratch)
    await expect(repo.lift(...args)).rejects.toThrow(message)
    expect(await Bun.file(join(scratch, lift.HOLDS)).exists()).toBe(false)
  })

  it('tries the lifts together, then each alone where that fails, naming its failures',
    async ({ expect, scratch }) => {
      const repo  = await Repo.seeded(scratch, FAILING)
      const table = await repo.lift('--try')
      expect(columnOf(table, -1)).toEqual([
        'TRIAL', 'passes', 'passes', 'fails site:check', 'fails crate:test', 'passes', 'passes', 'passes'
      ])
      expect(repo.calls.filter(call => call[1] === 'lock')).toHaveLength(7)
      expect((await repo.git('worktree', 'list')).trim().split('\n')).toHaveLength(1)
      expect(await repo.read('.mise/config.toml')).toBe(SEEDED['.mise/config.toml'])
    })

  it('runs one trial where the lifts pass together, each step and check in order',
    async ({ expect, scratch }) => {
      const repo = await Repo.seeded(scratch)
      expect(columnOf(await repo.lift('--try'), -1)).toEqual(['TRIAL', ...Array(7).fill('passes')])
      expect(repo.calls).toEqual([
        ['mise', 'lock'], ['mise', 'install'], ['mise', 'run', 'lock:sync'],
        ...lift.CHECKS.map(check => ['mise', 'run', check])
      ])
    })

  it('names the step resolving the lockfiles that fails and runs no check after it',
    async ({ expect, scratch }) => {
      const repo = await Repo.seeded(scratch, { install: ['1.100.0'] })
      expect((await repo.lift('--try')).split('\n').at(-1)).toMatch(/rust .* fails install$/)
      expect(repo.calls.at(-1)).toEqual(['mise', 'install'])
    })

  it('writes the passing lifts onto the branch, leaving each failing pin as it stands',
    async ({ expect, scratch }) => {
      const repo = await Repo.seeded(scratch, FAILING)
      await repo.lift('--write')
      expect(await repo.git('diff')).toContain(`jdx/mise-action@${LIFTED}`)
      expect(await repo.read('.github/workflows/ci.yml')).not.toContain(MISE)
      expect(await repo.read('.github/actions/provision/action.yml')).not.toContain(MISE)
      expect(await repo.read('.mise/config.toml')).toBe(SEEDED['.mise/config.toml']
        .replace('"0.2.130"', '"0.2.131"')
        .replace('"1.99.1"', '"1.100.0"'))
      expect(await repo.read('rust/Cargo.toml'))
        .toBe(SEEDED['rust/Cargo.toml'].replace('=0.2.130', '=0.2.131'))
      expect(JSON.parse(await repo.read('package.json'))).toEqual({
        dependencies    : { katex: '0.19.2', vitepress: '2.0.0-alpha.21' },
        devDependencies : { typescript: '6.0.3' },
        overrides       : { katex: '0.19.2' }
      })
    })

  it('writes every lift passing together except a held one and its linked pin',
    async ({ expect, scratch }) => {
      const repo = await Repo.seeded(scratch)
      await repo.lift('--write', '--hold', 'github:wasm-bindgen/wasm-bindgen', 'Waits')
      expect(await repo.read('rust/Cargo.toml'))
        .toBe(SEEDED['rust/Cargo.toml'].replace('=1.0.229', '=1.0.230'))
      expect(await repo.read('.mise/config.toml'))
        .toBe(SEEDED['.mise/config.toml'].replace('"1.99.1"', '"1.100.0"'))
    })

  it('writes the pin of an action named by a path inside its repository', async ({ expect, scratch }) => {
    const repo     = await Repo.seeded(scratch)
    const workflow = '.github/workflows/scan.yml'
    await repo.commit({
      [workflow]: `jobs:\n  scan:\n    steps:\n      - uses : github/codeql-action/init@${CODEQL}\n`
    })
    expect((await repo.lift()).split('\n')[1]).toMatch(/^actions +github\/codeql-action /)
    await repo.lift('--write')
    expect(await repo.read(workflow)).toContain(`github/codeql-action/init@${LIFTED}`)
  })

  it('writes nothing where the lifts passing alone fail together, naming the check',
    async ({ expect, scratch }) => {
      const repo  = await Repo.seeded(scratch, { 'lock:check': ['0.19.2', '1.100.0'] })
      const table = await repo.lift('--write')
      expect(columnOf(table, -1)).toEqual(['TRIAL', ...Array(7).fill('fails lock:check together')])
      expect(await repo.git('status', '--porcelain')).toBe('')
    })
})

describe('Bench', () => {
  test('drops every variable a mise run set and points each tool home into the scratch folder', () => {
    vi.stubEnv('MISE_PROJECT_ROOT', '/elsewhere')
    vi.stubEnv('__MISE_DIFF', 'diff')
    const env = new lift.Bench('/repository', '/scratch').env
    expect(Object.keys(env).filter(key => key.includes('MISE_') && !key.endsWith('_DIR'))).toEqual([
      'MISE_TRUSTED_CONFIG_PATHS'
    ])
    expect(env).toMatchObject({
      CARGO_HOME                : '/scratch/homes/cargo',
      MISE_CACHE_DIR            : '/scratch/homes/mise-cache',
      MISE_CONFIG_DIR           : '/scratch/homes/mise-config',
      MISE_DATA_DIR             : '/scratch/homes/mise-data',
      MISE_STATE_DIR            : '/scratch/homes/mise-state',
      MISE_TRUSTED_CONFIG_PATHS : '/scratch',
      RUSTUP_HOME               : '/scratch/homes/rustup'
    })
  })
})

describe('LiveRegistries', () => {
  const answered = (body: string, status = 200) => {
    const fetch = vi.fn(async () => new Response(body, { status }))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }
  const indexed = (releases: { vers: string, yanked: boolean }[]) =>
    answered(releases.map(release => JSON.stringify(release)).join('\n'))

  test.each([
    ['a', '1/a'], ['ab', '2/ab'], ['abc', '3/a/abc'], ['Wasm-Bindgen', 'wa/sm/wasm-bindgen']
  ])('reads the newest stable unyanked release of %s from its index file', async (name, path) => {
    const fetch = indexed([
      { vers: '0.2.130', yanked: false }, { vers: '0.2.132', yanked: true },
      { vers: '0.2.131', yanked: false }, { vers: '0.3.0-rc.1', yanked: false }
    ])
    expect(await new lift.LiveRegistries('.').crate(name)).toBe('0.2.131')
    expect(fetch).toHaveBeenCalledWith(`https://index.crates.io/${path}`)
  })

  test.each([
    ['the latest tag for a stable pin', '2.0.0', '1.6.4'],
    ['the highest tag for a prerelease pin', '2.0.0-alpha.20', '2.0.0-alpha.21']
  ])('reads %s', async (_, current, newest) => {
    answered(JSON.stringify({ latest: '1.6.4', next: '2.0.0-alpha.21' }))
    expect(await new lift.LiveRegistries('.').pack('vitepress', current)).toBe(newest)
  })

  test('fails by name on a crate with no stable unyanked release', async () => {
    indexed([{ vers: '0.3.0-rc.1', yanked: false }, { vers: '0.2.0', yanked: true }])
    await expect(new lift.LiveRegistries('.').crate('sgp4')).rejects.toThrow('sgp4 has no stable release')
  })

  test('fails by the address and status a registry answers', async () => {
    answered('', 404)
    await expect(new lift.LiveRegistries('.').pack('missing', '1.0.0'))
      .rejects.toThrow('https://registry.npmjs.org/-/package/missing/dist-tags answered 404')
  })

  test.each([
    ['the most specific tag naming the pinned commit', 'v7\nv7.0.1\n', 'v7.0.1'],
    ['the short commit where no tag names it', '', CHECKOUT.slice(0, 7)]
  ])('reads an action as %s beside its latest release', async (_, tags, current) => {
    const answers: Record<string, string> = { '.sha': `${LIFTED}\n`, '.tag_name': 'v7.0.2\n' }
    const run: lift.Run = async command => ({ exitCode: 0, output: answers[command.at(-1)!] ?? tags })
    expect(await new lift.LiveRegistries('.', run).action('actions/checkout', CHECKOUT))
      .toEqual({ commits: { current: CHECKOUT, newest: LIFTED }, current, newest: 'v7.0.2' })
  })

  test('reads a tool through mise latest and fails with what a failing command printed', async () => {
    const run: lift.Run = async command => command[1] === 'latest'
      ? { exitCode: 0, output: '1.100.0\n' }
      : { exitCode: 1, output: 'HTTP 404' }
    const registries = new lift.LiveRegistries('.', run)
    expect(await registries.tool('rust')).toBe('1.100.0')
    await expect(registries.action('gone/away', CHECKOUT)).rejects.toThrow('failed with HTTP 404')
  })
})
