import type { Dirent }                        from 'node:fs'
import { tmpdir }                             from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath }                      from 'node:url'
import { callbackify, promisify }             from 'node:util'

import type { GlobScanOptions } from 'bun'
import { afterAll, expect, vi } from 'vitest'

import { ROOT, declares } from './reads.ts'

type Call  = (...args: never[]) => unknown
type Found = Buffer | Dirent | string
type Run   = (args: unknown[]) => [unknown[], unknown]
type Verb  = 'reads' | 'runs'

vi.mock('node:fs', async load => {
  const fs       = await load<typeof import('node:fs')>()
  const promises = (await import('node:fs/promises')).default
  const checked  = {
    ...readingAll(fs, [
      'access', 'accessSync', 'createReadStream', 'exists', 'existsSync', 'lstat', 'lstatSync', 'open',
      'openSync', 'readFile', 'readFileSync', 'readlink', 'readlinkSync', 'stat', 'statSync'
    ]),
    ...readingAll(fs, ['copyFile', 'copyFileSync', 'cp', 'cpSync'], filesUnder),
    ...listingAll(fs, ['opendir', 'opendirSync']),
    globSync    : finding(fs.globSync, 1),
    promises,
    readdir     : callbackify(promises.readdir),
    readdirSync : finding(fs.readdirSync, 0),

    glob: callbackify((...args: Parameters<typeof promises.glob>) => Array.fromAsync(promises.glob(...args)))
  }
  return { ...fs, ...checked, default: { ...fs, ...checked } }
})

vi.mock('node:fs/promises', async load => {
  const fs      = await load<typeof import('node:fs/promises')>()
  const checked = {
    ...readingAll(fs, ['access', 'lstat', 'open', 'readFile', 'readlink', 'stat']),
    ...readingAll(fs, ['copyFile', 'cp'], filesUnder),
    ...listingAll(fs, ['opendir']),
    glob    : finding(fs.glob, 1),
    readdir : finding(fs.readdir, 0)
  }
  return { ...fs, ...checked, default: { ...fs, ...checked } }
})

vi.mock('node:child_process', async load => {
  const processes = await load<typeof import('node:child_process')>()
  return {
    ...processes,
    ...runningAll(processes, ['execFile', 'execFileSync', 'fork', 'spawn', 'spawnSync'], filedOf),
    ...runningAll(processes, ['exec', 'execSync'], commandedOf)
  }
})

vi.mock('bun', async load => ({ ...await load<typeof import('bun')>(), $: Bun.$, Glob: Bun.Glob }))

const { $, Glob, file, spawn, spawnSync } = Bun
Object.assign(
  Bun,
  {
    $    : shelling($),
    Glob : class extends Glob {
      override scan(options?: string | GlobScanOptions) {
        return heldEach(super.scan(options), holder(cwdOf(options)))
      }

      override scanSync(options?: string | GlobScanOptions) {
        return heldEach(super.scanSync(options), holder(cwdOf(options)))
      }
    }
  },
  readingAll(Bun, ['file']),
  runningAll(Bun, ['spawn', 'spawnSync'], spawnedOf)
)
afterAll(() => Object.assign(Bun, { $, Glob, file, spawn, spawnSync }))

const { fetch } = globalThis
Object.assign(globalThis, { fetch: holding(fetch, 'reads', fetchedOf) })
afterAll(() => Object.assign(globalThis, { fetch }))

const actual = await vi.importActual<typeof import('node:fs')>('node:fs')

/**
 * Lists the modules of the suite and the site on the stack of the current
 * call, and the running test, which stands in for a module whose frame a
 * proper tail call drops.
 */
function callers(): string[] {
  const ours = sitesOf()
    .flatMap(site => site.getFileName() ?? [])
    .filter(path => isAbsolute(path) && within(ROOT, path) && !path.split(sep).includes('node_modules'))
  return [...ours, expect.getState().testPath ?? []].flat()
}

/**
 * Reads the words and the options of a call to `exec`, which runs one command
 * line.
 */
function commandedOf([command, options]: unknown[]): [unknown[], unknown] {
  return [String(command).split(/\s+/), options]
}

/**
 * Reads the folder a call resolves its relative paths against from `options`,
 * a path or an object holding `cwd`, defaulting to the folder the suite runs
 * in.
 */
function cwdOf(options: unknown): string {
  const cwd = typeof options === 'object' && options !== null && 'cwd' in options ? options.cwd : options
  return resolvedOf(cwd) ?? process.cwd()
}

function entryOf(entry: Found): string {
  return typeof entry === 'object' && 'parentPath' in entry
    ? resolve(entry.parentPath, entry.name)
    : String(entry)
}

/**
 * Lists the file a call to `fetch` reads from a `file:` URL, given as a string,
 * a `URL`, or a `Request`, and no file for any other scheme.
 */
function fetchedOf([input]: unknown[]): string[] {
  const url = URL.parse(input instanceof Request ? input.url : String(input))
  return url?.protocol === 'file:' ? pathsOf(url) : []
}

/**
 * Reads the command and the options of a call to `spawn`, `execFile`, or
 * `fork`, each taking a file, then its arguments where it has any, then its
 * options.
 */
function filedOf([file, args, options]: unknown[]): [unknown[], unknown] {
  return Array.isArray(args) ? [[file, ...args], options] : [[file], args]
}

/**
 * Lists the files of the worktree that the words of a command name, each
 * resolved against `cwd`.
 */
function filesNamed(words: unknown[], cwd: string): string[] {
  return words.flatMap(word => pathsOf(word, cwd)).filter(isFile)
}

/**
 * Lists every file under `path` where it is a folder, which a recursive copy
 * reads whole, or only the files directly in it where `recursive` is false,
 * or else `path` itself.
 */
function filesUnder(path: string, recursive = true): string[] {
  return actual.statSync(path, { throwIfNoEntry: false })?.isDirectory()
    ? actual.readdirSync(path, { recursive, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entryOf)
    : [path]
}

/**
 * Wraps `call`, which returns the entries it finds, so each entry, resolved
 * against the folder `cwdOf` reads from the argument at position `at`, is
 * held to `READS`.
 */
function finding<T extends Call>(call: T, at: number): T {
  return new Proxy(call, {
    apply: (target, self, args) => heldEach(Reflect.apply(target, self, args), holder(cwdOf(args[at])))
  })
}

/**
 * Passes each entry of `found`, an array, a promise of one, or an iterator,
 * through `held` as it arrives, returning a value of the same form.
 */
function heldEach<T>(found: T, held: (entry: Found) => Found): T {
  if (Array.isArray(found)) return found.map(held) as T
  if (found instanceof Promise) return found.then((entries: Found[]) => entries.map(held)) as T
  if (Symbol.asyncIterator in (found as object)) {
    return (async function* () {
      for await (const entry of found as AsyncIterable<Found>) yield held(entry)
    })() as T
  }
  return (function* () {
    for (const entry of found as Iterable<Found>) yield held(entry)
  })() as T
}

/**
 * Throws where no module of `readers` declares in `READS` a glob for a file
 * of `files`, naming the running test and the file.
 */
function hold(readers: string[], files: string[], verb: Verb) {
  const path = files
    .map(file => relative(ROOT, file))
    .find(path => !readers.some(reader => declares(path, reader)))
  if (path !== undefined) {
    throw new Error(`${expect.getState().testPath} ${verb} ${path}, which READS gives it no glob for`)
  }
}

/**
 * Returns a function that holds an entry found under `cwd` to `READS`, for the
 * modules making the current call, and then returns the entry.
 */
function holder(cwd: string): <T extends Found>(entry: T) => T {
  const readers = callers()
  return entry => {
    hold(readers, pathsOf(entryOf(entry), cwd).filter(isFile), 'reads')
    return entry
  }
}

/**
 * Wraps `call` so each call first holds to `READS` the files `filesOf` finds
 * in its arguments, for the modules making the call, and so does each call
 * to the promise form `promisify` takes from its `promisify.custom`.
 */
function holding<T extends Call>(call: T, verb: Verb, filesOf: (args: unknown[]) => string[]): T {
  return new Proxy(call, {
    apply(target, self, args) {
      hold(callers(), filesOf(args), verb)
      return Reflect.apply(target, self, args)
    },
    get: (target, key) =>
      key === promisify.custom && key in target
        ? holding(Reflect.get(target, key) as Call, verb, filesOf)
        : Reflect.get(target, key)
  })
}

function isFile(path: string): boolean {
  return actual.statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}

/**
 * Wraps each function of `module` that `names` lists, which opens the folder
 * its first argument names, so each file it lists is held to `READS`, those
 * of every folder below it too where its options set `recursive`.
 */
function listingAll<T extends object>(module: T, names: (keyof T & string)[]): Record<string, unknown> {
  return wrappedAll(module, names, call =>
    holding(call, 'reads', ([path, options]) => {
      const { recursive = false } = (options ?? {}) as { recursive?: boolean }
      return pathsOf(path).flatMap(folder => filesUnder(folder, recursive))
    }))
}

/**
 * Resolves `path`, a string or a file URL, against `cwd`, keeping it only
 * where it lies in the worktree outside the temporary folder.
 */
function pathsOf(path: unknown, cwd = process.cwd()): string[] {
  const file = resolvedOf(path, cwd)
  return file !== undefined && within(ROOT, file) && !within(tmpdir(), file) ? [file] : []
}

/**
 * Wraps each function of `module` that `names` lists, whose first argument
 * is the path it reads, through `filesOf` where one path stands for several
 * files.
 */
function readingAll<T extends object>(
  module  : T,
  names   : (keyof T & string)[],
  filesOf : (path: string) => string[] = path => [path]
): Record<string, unknown> {
  return wrappedAll(module, names, call =>
    holding(call, 'reads', ([path]) => pathsOf(path).flatMap(file => filesOf(file))))
}

/**
 * Resolves `path` against `cwd` where it is a string or a buffer, as `node:fs`
 * takes either, or reads it where it is a file URL.
 */
function resolvedOf(path: unknown, cwd = process.cwd()): string | undefined {
  if (path instanceof URL) return fileURLToPath(path)
  if (path instanceof Uint8Array) return resolve(cwd, Buffer.from(path).toString())
  return typeof path === 'string' ? resolve(cwd, path) : undefined
}

/**
 * Wraps `call` so each word of the command `runOf` reads from its arguments
 * that names a file of the worktree, resolved against the folder the
 * command's options give, is held to `READS`.
 */
function running<T extends Call>(call: T, runOf: Run): T {
  return holding(call, 'runs', args => {
    const [words, options] = runOf(args)
    return filesNamed(words, cwdOf(options))
  })
}

function runningAll<T extends object>(
  module : T,
  names  : (keyof T & string)[],
  runOf  : Run
): Record<string, unknown> {
  return wrappedAll(module, names, call => running(call, runOf))
}

/**
 * Reads the words of a command Bun's shell runs, each word of its template
 * and each value it interpolates.
 */
function shelledOf([strings, ...values]: unknown[]): unknown[] {
  return [...(strings as string[]).join(' ').split(/\s+/), ...values.flat()]
}

/**
 * Wraps Bun's shell, or a shell `new $.Shell()` makes, so each command is held
 * to `READS` as `running` holds it, from the folder the shell's own `cwd` last
 * set or else the folder the suite runs in, and again against the folder the
 * command's `cwd` moves it to. The proxy stands over a function calling
 * `shell` and passes every other read, write, `in` check, and prototype lookup
 * to `shell`, because `$` holds `Shell` as a non-configurable property, which a
 * proxy of `$` itself must return unchanged.
 */
function shelling(shell: typeof Bun.$): typeof Bun.$ {
  let folder: string | undefined
  const Shell = 'Shell' in shell
    ? new Proxy(shell.Shell, { construct: (base, args) => shelling(Reflect.construct(base, args)) })
    : undefined
  const wrapped = new Proxy(((...args: Parameters<typeof shell>) => shell(...args)) as typeof shell, {
    getPrototypeOf : () => Reflect.getPrototypeOf(shell),
    has            : (_, key) => Reflect.has(shell, key),
    set            : (_, key, value) => Reflect.set(shell, key, value),

    apply(_, self, args) {
      const readers = callers()
      const words   = shelledOf(args)
      const held    = (cwd: string) => hold(readers, filesNamed(words, cwd), 'runs')
      held(cwdOf(folder))
      const command = Reflect.apply(shell, self, args)
      const { cwd } = command
      return Object.assign(command, {
        cwd: (path: string) => {
          held(cwdOf(path))
          return cwd.call(command, path)
        }
      })
    },

    get(_, key) {
      if (key === 'cwd') {
        return (path?: string) => {
          folder = path
          shell.cwd(path)
          return wrapped
        }
      }
      return key === 'Shell' ? Shell : Reflect.get(shell, key)
    }
  })
  return wrapped
}

/**
 * Reads the call sites of the current stack, every frame of it, putting back
 * the stack trace settings of `Error` however the read ends.
 */
function sitesOf(): NodeJS.CallSite[] {
  const { prepareStackTrace, stackTraceLimit } = Error
  try {
    Object.assign(Error, {
      prepareStackTrace : (_: Error, sites: NodeJS.CallSite[]) => sites,
      stackTraceLimit   : Infinity
    })
    return new Error().stack as unknown as NodeJS.CallSite[]
  } finally {
    Object.assign(Error, { prepareStackTrace, stackTraceLimit })
  }
}

/**
 * Reads the command and the options of a call to `Bun.spawn`, which takes
 * either the command and its options or one options object holding `cmd`.
 */
function spawnedOf([command, options]: unknown[]): [unknown[], unknown] {
  return Array.isArray(command) ? [command, options] : [(command as { cmd: unknown[] }).cmd, command]
}

function within(folder: string, file: string): boolean {
  const path = relative(folder, file)
  return !isAbsolute(path) && path.split(sep)[0] !== '..'
}

/**
 * Maps each name of `names` to the function `module` holds under it, wrapped
 * through `wrap`.
 */
function wrappedAll<T extends object>(
  module : T,
  names  : (keyof T & string)[],
  wrap   : (call: Call) => Call
): Record<string, unknown> {
  return Object.fromEntries(names.map(name => [name, wrap(module[name] as Call)]))
}
