import { describe, expect, it } from 'vitest'

import { Netrc } from '../../../docs/.vitepress/catalog/netrc.ts'

const HOST   = 'www.space-track.org'
const LOGIN  = { identity: 'observer', password: 'orbit-2026' }
const OTHERS = [
  '# urs.earthdata.nasa.gov stays as written',
  'machine urs.earthdata.nasa.gov',
  '  login reader',
  '  password "two words"',
  '',
  'macdef init',
  'machine www.space-track.org login inside-a-macro password ignored',
  '',
  'default login anonymous password guest',
  ''
].join('\n')

describe('a saved login', () => {
  it.each([
    ['an entry on one row', `machine ${HOST} login observer password orbit-2026\n`, LOGIN],
    ['an entry across rows', `machine ${HOST}\n  login observer\n  password orbit-2026\n`, LOGIN],
    ['quoted values', `machine ${HOST} login "observer" password "a \\"b\\"\\tc\\\\"`,
      { identity: 'observer', password: 'a "b"\tc\\' }],
    ['an entry naming no password', `machine ${HOST} login observer`, { identity: 'observer' }],
    ['a password reading as a keyword', `machine ${HOST} login observer password machine`,
      { identity: 'observer', password: 'machine' }],
    ['the machine inside a macro alone', OTHERS, {}],
    ['a commented entry alone', `# machine ${HOST} login observer password orbit-2026\n`, {}],
    ['an empty file', '', {}]
  ])('reads %s', (_, text, saved) => {
    expect(Netrc.parse(text).savedFor(HOST)).toEqual(saved)
  })

  it('reads the first of two entries for the machine', () => {
    const text = `machine ${HOST} login first password one\nmachine ${HOST} login second password two\n`
    expect(Netrc.parse(text).savedFor(HOST)).toEqual({ identity: 'first', password: 'one' })
  })
})

describe('a rewritten file', () => {
  it.each([
    ['an empty file', '', ''],
    ['a file ending on its last newline', OTHERS, ''],
    ['a file ending without one', OTHERS.trimEnd(), '\n']
  ])('appends the entry to %s, leaving the rest as it was', (_, text, separator) => {
    expect(Netrc.parse(text).withLogin(HOST, LOGIN))
      .toBe(`${text}${separator}machine ${HOST} login observer password orbit-2026\n`)
  })

  it('replaces the entry in place, leaving every other entry, comment, and macro as it was', () => {
    const entry = `machine ${HOST}\n  login old\n  password stale # kept`
    const text  = `${OTHERS}${entry}\nmachine example.org login else password other\n`
    expect(Netrc.parse(text).withLogin(HOST, LOGIN)).toBe(
      `${OTHERS}machine ${HOST} login observer password orbit-2026 # kept\n`
    + 'machine example.org login else password other\n')
  })

  it.each([
    'two words', 'a "quoted" part', 'back\\slash', 'tab\tand\nnewline\rreturn', '#leading', ''
  ])('reads back the password %j as it was written', password => {
    const written = Netrc.parse(OTHERS).withLogin(HOST, { identity: 'observer', password })
    expect(Netrc.parse(written).savedFor(HOST)).toEqual({ identity: 'observer', password })
  })

  it('quotes a password opening on a comment mark', () => {
    expect(Netrc.parse(OTHERS).withLogin(HOST, { identity: 'observer', password: '#leading' }))
      .toBe(`${OTHERS}machine ${HOST} login observer password "#leading"\n`)
  })
})
