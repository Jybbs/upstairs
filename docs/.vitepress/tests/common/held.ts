import type { Dirent }                              from 'node:fs'
import { tmpdir }                                   from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath }                            from 'node:url'

import type { GlobScanOptions }  from 'bun'
import { afterAll, expect, vi } from 'vitest'

import { ROOT, declares } from './reads.ts'

type Call  = (...args: never[]) => unknown
type Found = Dirent | string
type Run   = (args: unknown[]) => [unknown[], unknown]
type Verb  = 'reads' | 'runs'

vi.mock('node:fs', async load => {
  const fs      = await load<typeof import('node:fs')>()
  const checked = {
    ...readingAll(fs, [
      'access', 'accessSync', 'createReadStream', 'existsSync', 'lstat', 'lstatSync', 'open', 'openSync',
      'readFile', 'readFileSync', 'readlink', 'readlinkSync', 'stat', 'statSync'
    ]),
    ...readingAll(fs, ['copyFile', 'copyFileSync', 'cp', 'cpSync'], filesUnder),
    globSync    : finding(fs.globSync, 1),
    readdirSync : finding(fs.readdirSync, 0)
  }
  return { ...fs, ...checked, default: { ...fs, ...checked } }
})

vi.mock('node:fs/promises', async load => {
  const fs = await load<typeof import('node:fs/promises')>()
  return {
    ...fs,
    ...readingAll(fs, ['access', 'lstat', 'open', 'readFile', 'readlink', 'stat']),
    ...readingAll(fs, ['copyFile', 'cp'], filesUnder),
    glob    : finding(fs.glob, 1),
    readdir : finding(fs.readdir, 0)
  }
})

vi.mock('node:child_process', async load => {
  const processes = await load<typeof import('node:child_process')>()
  return {
    ...processes,
    ...runningAll(processes, ['execFile', 'execFileSync', 'fork', 'spawn', 'spawnSync'], filedOf),
    ...runningAll(processes, ['exec', 'execSync'], commandedOf)
  }
})

vi.mock('bun', async load => {
  const bun = await load<typeof import('bun')>()
  return {
    ...bun,
    $    : running(bun.$, shelledOf),
    Glob : class extends bun.Glob {
      override scan(options?: string | GlobScanOptions) {
        return heldEach(super.scan(options), holder(cwdOf(options)))
      }

      override scanSync(options?: string | GlobScanOptions) {
        return heldEach(super.scanSync(options), holder(cwdOf(options)))
      }
    }
  }
})

const { file, spawn, spawnSync } = Bun
Object.assign(Bun, readingAll(Bun, ['file']), runningAll(Bun, ['spawn', 'spawnSync'], spawnedOf))
afterAll(() => Object.assign(Bun, { file, spawn, spawnSync }))

const actual = await vi.importActual<typeof import('node:fs')>('node:fs')

/**
 * Lists the modules of the suite and the site on the stack of the current
 * call, and the running test, which stands in for a module whose frame a
 * proper tail call drops.
 */
function callers(): string[] {
  const { stackTraceLimit } = Error
  Error.stackTraceLimit     = Infinity
  const { stack = '' }      = new Error()
  Error.stackTraceLimit     = stackTraceLimit

  const frames = [...stack.matchAll(/(\/[^\s():]+):\d+:\d+\)?$/gm)].map(([, path]) => path!)
  const ours   = frames.filter(path => within(ROOT, path) && !path.split(sep).includes('node_modules'))
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
  return typeof entry === 'string' ? entry : join(entry.parentPath, entry.name)
}

/**
 * Lists every file under `path` where it is a folder, which a recursive copy
 * reads whole, or else `path` itself.
 */
function filesUnder(path: string): string[] {
  return actual.statSync(path, { throwIfNoEntry: false })?.isDirectory()
    ? actual.readdirSync(path, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entryOf)
    : [path]
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
 * in its arguments, for the modules making the call.
 */
function holding<T extends Call>(call: T, verb: Verb, filesOf: (args: unknown[]) => string[]): T {
  return new Proxy(call, {
    apply(target, self, args) {
      hold(callers(), filesOf(args), verb)
      return Reflect.apply(target, self, args)
    }
  })
}

function isFile(path: string): boolean {
  return actual.statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
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
  return wrappedAll(module, names, call => holding(call, 'reads', ([path]) => pathsOf(path).flatMap(filesOf)))
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
    const cwd              = cwdOf(options)
    return words.flatMap(word => pathsOf(word, cwd)).filter(isFile)
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
 * and each value it interpolates, which runs from the folder the suite runs
 * in until the shell's own `cwd` moves it.
 */
function shelledOf([strings, ...values]: unknown[]): [unknown[], unknown] {
  return [[...(strings as string[]).join(' ').split(/\s+/), ...values.flat()], undefined]
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
