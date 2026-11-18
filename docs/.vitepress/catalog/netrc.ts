/**
 * Reads and rewrites one machine's entry of a `.netrc` file, leaving every
 * other entry, comment, and macro as it was. A value holding whitespace, a
 * double quote, or a backslash is quoted with the escapes curl reads since
 * 7.84.0, per https://everything.curl.dev/usingcurl/netrc.html.
 */
import { readFile } from 'node:fs/promises'

export interface Login {
  identity : string
  password : string
}

interface Entry {
  end       : number
  login?    : string
  machine?  : string
  password? : string
  start     : number
}

const ESCAPES = { '\n': 'n', '\r': 'r', '\t': 't' } as { [character: string]: string }
/**
 * A comment line, a quoted token capturing what sits between its quotes, or a
 * bare token.
 */
const TOKEN   = /(?<=^|\n)[ \t]*#[^\n]*|"((?:\\.|[^"\\])*)"|(\S+)/g
const VALUED  = ['account', 'login', 'password'] as const
const ESCAPED = Object.fromEntries(Object.entries(ESCAPES).map(([character, escape]) => [escape, character]))

const quoted = (value: string) =>
  /^$|^#|[\s"\\]/.test(value)
    ? `"${value.replaceAll(/[\\"\n\r\t]/g, character => `\\${ESCAPES[character] ?? character}`)}"`
    : value

const unquoted = (value: string) =>
  value.replaceAll(/\\(.)/gs, (_, escape: string) => ESCAPED[escape] ?? escape)

/**
 * The entries of one `.netrc` file, each spanning from its `machine` or
 * `default` keyword to its last token.
 */
export class Netrc {
  private constructor(readonly text: string, private readonly entries: Entry[]) {}

  /**
   * Reads the entries of `text`, skipping each comment line and each macro's
   * body up to the blank line ending it.
   */
  static parse(text: string) {
    const entries: Entry[] = []
    const pattern = new RegExp(TOKEN)
    let key: (typeof VALUED)[number] | 'machine' | undefined
    for (let match; (match = pattern.exec(text)); ) {
      if (match[1] === undefined && match[2] === undefined) continue
      const token = match[2] ?? unquoted(match[1]!)
      const entry = entries.at(-1)
      if (key !== undefined) {
        if (entry) {
          if (key !== 'account') entry[key] = token
          entry.end = pattern.lastIndex
        }
        key = undefined
      } else if (token === 'machine' || token === 'default') {
        entries.push({ end: pattern.lastIndex, start: match.index })
        if (token === 'machine') key = token
      } else if (token === 'macdef') {
        const blank = text.indexOf('\n\n', pattern.lastIndex)
        pattern.lastIndex = blank < 0 ? text.length : blank
      } else key = VALUED.find(name => name === token)
    }
    return new Netrc(text, entries)
  }

  /**
   * Reads the entries of the file at `path`, reading none where no file is
   * there.
   */
  static async read(path: string) {
    return Netrc.parse(await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return ''
      throw error
    }))
  }

  /**
   * Returns the login and password the first entry for `machine` holds, each
   * left out where the entry names none.
   */
  savedFor(machine: string): Partial<Login> {
    const entry = this.entryFor(machine)
    return {
      ...entry?.login    === undefined ? {} : { identity: entry.login },
      ...entry?.password === undefined ? {} : { password: entry.password }
    }
  }

  /**
   * Returns the file's text with the entry for `machine` holding `login`,
   * replacing the first entry for that machine in place or appending one where
   * none exists.
   */
  withLogin(machine: string, login: Login) {
    const line = `machine ${quoted(machine)} login ${quoted(login.identity)} `
               + `password ${quoted(login.password)}`
    const entry = this.entryFor(machine)
    if (entry) return this.text.slice(0, entry.start) + line + this.text.slice(entry.end)
    return `${this.text}${this.text === '' || this.text.endsWith('\n') ? '' : '\n'}${line}\n`
  }

  private entryFor(machine: string) {
    return this.entries.find(entry => entry.machine === machine)
  }
}
