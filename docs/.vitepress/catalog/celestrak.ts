/**
 * Requests CelesTrak's SATCAT directory and its SATCAT file, reading the time
 * the directory lists for the file and the operational status of each payload
 * the file holds, and tells a connection Cloudflare could not open apart from a
 * request that reached CelesTrak.
 */

/**
 * What starts a wait of the download cycle once a request reaches CelesTrak,
 * where a refusal or a 403 for data that has not updated keeps the status, the
 * headers in `KEPT`, and the first `EXCERPT` characters of the body CelesTrak
 * answered with, and a 403 for data that has not updated keeps the time of the
 * download its body names under `since`.
 */
export type Failure =
  | {
      body    : string
      headers : { [name: string]: string }
      kind    : 'refused' | 'unchanged'
      reason  : string
      since?  : string
      status  : number
    }
  | { kind: 'unanswered' | 'unchecked', reason: string }

/**
 * The SATCAT the cycle keeps, the time the directory lists for its file beside
 * the operational status code of each payload, keyed by catalog number.
 */
export interface Satcat {
  codes : { [id: string]: string }
  time  : number
}

const AGENT = 'upstairs-catalog'
/**
 * The fewest payloads a SATCAT file holds before the cycle keeps it.
 */
const AT_LEAST = 5000
/**
 * The columns of the SATCAT file the cycle reads, per
 * https://celestrak.org/satcat/satcat-format.php.
 */
const COLUMNS = ['NORAD_CAT_ID', 'OBJECT_TYPE', 'OPS_STATUS_CODE'] as const
/**
 * The directory of CelesTrak's SATCAT files, which CelesTrak asks to be
 * queried no more than once an hour, per
 * https://celestrak.org/usage-policy.php.
 */
export const DIRECTORY = 'https://celestrak.org/satcat/jsonDir.php'
/**
 * The most characters of a refusal's body a wait keeps.
 */
export const EXCERPT = 4096
/**
 * One field of a row of the SATCAT file, quoted where it holds a comma and
 * capturing what sits between the quotes, or bare.
 */
const FIELD = /(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g
/**
 * The longest wait for the headers of an answer, in milliseconds, which runs
 * past the 19 seconds Cloudflare waits for a connection before answering 522.
 */
export const HEADER_WAIT = 30_000
/**
 * The headers of a refusal a wait keeps.
 */
export const KEPT = ['cf-ray', 'content-type', 'location', 'retry-after']
/**
 * The time the directory lists for a file, as `2026-10-24 01:47:21 UTC`.
 */
const LISTED = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/
/**
 * CelesTrak's SATCAT file, linked from https://celestrak.org/satcat/ as its
 * raw SATCAT data.
 */
export const SATCAT = 'https://celestrak.org/pub/satcat.csv'
/**
 * The message of the 403 CelesTrak answers while its data has not updated
 * since the last download from the same address, per its GP data documentation
 * at https://celestrak.org/NORAD/documentation/gp-data-formats.php, matched
 * for any data set once each run of whitespace in the body reads as one space
 * and capturing the day and the time of that download in UTC.
 */
const UNCHANGED = /[A-Z]+ data has not updated since your last successful download(?: of \S+ at (\S+) (\S+) UTC)?/
/**
 * The statuses Cloudflare answers with when it cannot open a connection to
 * CelesTrak.
 */
const UNCONNECTED = [521, 522, 523]

/**
 * Marks a download that starts a wait of the cycle, carrying the failure the
 * wait records.
 */
export class Failed extends Error {
  constructor(readonly failure: Failure) {
    super(failure.reason)
  }
}

/**
 * Marks a connection Cloudflare could not open, which the cycle then opens from
 * the next region.
 */
export class Unreachable extends Error {}

/**
 * Returns the fields of one row of the SATCAT file.
 */
const fieldsOf = (row: string) => [...row.matchAll(FIELD)].map(([, quoted, bare]) => quoted ?? bare)

/**
 * Reads the refusal out of an answer other than 200, canceling its body once
 * `EXCERPT` characters have arrived, and marks a 403 whose body holds
 * `UNCHANGED` as unchanged, keeping the time of the download it names where
 * that time reads as a date. Where reading the body fails, the refusal keeps
 * the characters already read and names the error in its reason.
 */
const refusalOf = async (response: Response): Promise<Failure> => {
  let body   = ''
  let reason = `CelesTrak answered ${response.status}`
  try {
    for await (const text of response.body?.pipeThrough(new TextDecoderStream()) ?? []) {
      body += text
      if (body.length >= EXCERPT) break
    }
  } catch (error) {
    reason += `, and reading its body failed with ${String(error)}`
  }
  const unchanged = response.status === 403 ? UNCHANGED.exec(body.replaceAll(/\s+/g, ' ')) : null
  const since     = Date.parse(`${unchanged?.[1]}T${unchanged?.[2]}Z`)
  return {
    body    : body.slice(0, EXCERPT),
    headers : Object.fromEntries([...response.headers].filter(([name]) => KEPT.includes(name))),
    kind    : unchanged === null ? 'refused' : 'unchanged',
    reason  : reason,
    status  : response.status,
    ...Number.isNaN(since) ? {} : { since: new Date(since).toISOString() }
  }
}

const unchecked = (reason: string) => new Failed({ kind: 'unchecked', reason })

/**
 * Returns the codes of a SATCAT file, the operational status code of each
 * payload keyed by its catalog number, failing where the file lacks a column
 * `COLUMNS` names or holds fewer than `AT_LEAST` payloads.
 */
export const codesOf = (text: string) => {
  const [head = '', ...rows] = text.split(/\r?\n/)
  const columns              = COLUMNS.map(column => fieldsOf(head).indexOf(column))
  if (columns.includes(-1))
    throw unchecked(`Expected a SATCAT file with ${COLUMNS.join(', ')}, got ${head.slice(0, 60)}`)
  const codes: Satcat['codes'] = Object.fromEntries(rows
    .map(fieldsOf)
    .map(fields => columns.map(column => fields[column]))
    .filter(([id, type]) => type === 'PAY' && id)
    .map(([id, , code]) => [id, code ?? '']))
  const payloads = Object.keys(codes).length
  if (payloads < AT_LEAST) throw unchecked(`Expected ${AT_LEAST} or more payloads, got ${payloads}`)
  return codes
}

/**
 * Reads `answer` through `read`, failing with `Unreachable` where Cloudflare
 * could not connect or `answer` rejects with anything but a `TimeoutError`. A
 * `TimeoutError`, any other answer but 200, a redirect included, a body that
 * fails to arrive, and a body `read` throws on each fail with `Failed`.
 */
export const download = async <T>(answer: Promise<Response>, read: (body: string) => T): Promise<T> => {
  const response = await answer.catch((error: Error) => {
    throw error.name === 'TimeoutError'
      ? new Failed({ kind: 'unanswered', reason: error.message })
      : new Unreachable(String(error))
  })
  if (UNCONNECTED.includes(response.status)) {
    await response.body?.cancel()
    throw new Unreachable(`Cloudflare answered ${response.status}`)
  }
  if (response.status !== 200) throw new Failed(await refusalOf(response))
  try {
    return read(await response.text())
  } catch (error) {
    throw error instanceof Failed ? error : unchecked(String(error))
  }
}

/**
 * Sends a request for `source` through `fetcher` with redirects left
 * unfollowed, aborting it with a `TimeoutError` where no headers arrive within
 * `HEADER_WAIT` milliseconds.
 */
export const fetchFrom = async (fetcher: typeof fetch, source: string) => {
  const bound   = new AbortController()
  const timeout = new DOMException(`No answer within ${HEADER_WAIT} ms`, 'TimeoutError')
  const timer   = setTimeout(() => bound.abort(timeout), HEADER_WAIT)
  const init    = { headers: { 'user-agent': AGENT }, redirect: 'manual', signal: bound.signal } as const
  try {
    return await fetcher(source, init)
  } catch (error) {
    throw bound.signal.aborted ? timeout : error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Returns the time the SATCAT directory lists for the file `SATCAT` names,
 * read from the `FILE_MTIME` of the entry whose `FILE_NAME` ends on that
 * file's name, failing where the directory holds no such entry.
 */
export const listedOf = (body: string) => {
  const entries = JSON.parse(body) as unknown
  const name    = SATCAT.split('/').at(-1)
  const entry   = Array.isArray(entries)
    ? entries.find(entry => String(Object(entry).FILE_NAME).split('/').at(-1) === name) as unknown
    : undefined
  const match   = LISTED.exec(String(Object(entry).FILE_MTIME))
  if (!match) throw unchecked(`Expected a directory listing ${name}, got ${body.slice(0, 60)}`)
  return Date.parse(`${match[1]}T${match[2]}Z`)
}
