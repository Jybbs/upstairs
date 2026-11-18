/**
 * Runs the download cycle once an hour, keeping CelesTrak's SATCAT current and
 * storing in Workers KV the elements Space-Track serves for each payload the
 * SATCAT marks active. The SATCAT is downloaded only where its directory lists
 * a file newer than the one kept, each request sent from each region in turn
 * until one reaches CelesTrak with an answer other than a 403 naming a download
 * the cycle did not make. A refusal, a 403 for data that has not updated, an
 * answer that fails its check, no region reaching CelesTrak, or no headers
 * within the wait starts a wait the cycle ends on its own, logged once and kept
 * in the storage of the Durable Object until a request succeeds, while the
 * elements are still queried on the SATCAT kept.
 */
import { DAY, FILE, type Record } from '../lib/orbit/catalog.ts'
import * as celestrak             from './celestrak.ts'
import { encode }                 from './encode.ts'
import * as spacetrack            from './spacetrack.ts'

export type Bindings = Partial<spacetrack.Secrets> & { CATALOG: Pick<KVNamespace, 'put'> }

type Fault =
  | celestrak.Failure & { region: Region, regions?: Misses }
  | { kind: 'unreached', reason: string, regions: Misses }

/**
 * A halt kept under `halted` in the storage of the Durable Object, which the
 * cycle turns into a wait ending `EVERY` after the time the halt records.
 */
type Halted = { halt: unknown, kind: 'halted', reason: string }

/**
 * The result of each region that failed to reach CelesTrak or reached it
 * through an address another client had downloaded from.
 */
type Misses = { [region in Region]?: string }

/**
 * What one run did with the SATCAT, where `current` means the directory listed
 * no newer file, and with the elements.
 */
type Outcome = { elements: 'failed' | 'stored', satcat: 'current' | 'downloaded' | 'waiting' }

export type Region = typeof REGIONS[number]

/**
 * The record of a wait, naming the kind of failure, the reason, and the region
 * the failure came through, with the result of each region where none reached
 * CelesTrak or each reached it through an address another client had
 * downloaded from, beside the refusals since the last request that succeeded
 * and the time it ends.
 */
export type Wait = (Fault | Halted)
  & { event: 'catalog.waiting', refusals: number, time: string, until: string }

/**
 * The operational status codes of a payload the catalog keeps, per
 * https://celestrak.org/satcat/status.php.
 */
export const ACTIVE = ['+', 'B', 'P', 'S', 'X']
/**
 * The shortest time between two runs, in milliseconds, the most often
 * Space-Track's API guidelines ask for the `gp` class and CelesTrak's usage
 * policy allows its SATCAT directory to be queried, and the spacing of the
 * scheduled runs.
 */
export const EVERY = 3_600_000
/**
 * The longest wait, in milliseconds, which the doubled wait and `retry-after`
 * each stop at.
 */
export const LONGEST = DAY
/**
 * The minute past each hour the scheduled run starts at, which Space-Track's
 * API guidelines ask be chosen at random away from the top and the bottom of
 * the hour.
 */
export const MINUTE = 53
/**
 * The location hints of the relays sending the request, in the order a cycle
 * tries them after the one that last reached CelesTrak.
 */
export const REGIONS = ['weur', 'apac', 'enam', 'wnam', 'eeur'] as const satisfies DurableObjectLocationHint[]
/**
 * How far, in milliseconds, a run may fall short of `EVERY` after the last
 * attempt, or of the end of a wait, and still run, covering the seconds by
 * which the time a scheduled run reads varies past the minute, and how far
 * after `downloaded`, or to either side of `aborted`, the download a 403 names
 * may fall and still count as the download of the cycle.
 */
const SLACK = 60_000

/**
 * Returns whether `time` falls more than `SLACK` before `end`.
 */
const ahead = (end: number, time: number) => time < end - SLACK

/**
 * Returns the milliseconds after `time` a `retry-after` value asks the cycle to
 * wait, read as seconds or as an HTTP date, or 0 where it holds neither.
 */
const askedOf = (value: string | undefined, time: number) =>
  value === undefined ? 0 : /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - time || 0

/**
 * Returns how long the cycle waits after `fault`, where a refusal waits
 * `EVERY`, doubled for each refusal before it since the last request that
 * succeeded, or as long as its `retry-after` asks where that is longer, up to
 * `LONGEST`, a 403 for data that has not updated waits until `EVERY` after the
 * download it names, ending at once where that has passed and lasting `EVERY`
 * at most, and every other fault waits for the next scheduled run.
 */
const delayOf = (fault: Fault | Halted, refusals: number, time: number) => {
  if (fault.kind === 'refused') {
    const asked = askedOf(fault.headers['retry-after'], time)
    return Math.min(Math.max(EVERY * 2 ** (refusals - 1), asked), LONGEST)
  }
  if (fault.kind === 'unchanged' && fault.since !== undefined)
    return Math.min(Math.max(Date.parse(fault.since) + EVERY - time, 0), EVERY)
  return EVERY
}

/**
 * Returns whether `failure` is a 403 for data that has not updated naming a
 * download more than `SLACK` after `downloaded`, the time of the last download
 * of the cycle, and more than `SLACK` from `aborted`, the time of its last
 * request that timed out waiting for headers, which marks a download by another
 * client sharing the address. A 403 naming any other time means the data has
 * not updated since a download of the cycle, so it starts a wait.
 */
const elsewhere = (downloaded: number, aborted: number, failure: celestrak.Failure) =>
  failure.kind === 'unchanged' && failure.since !== undefined
    && Date.parse(failure.since) - downloaded > SLACK
    && Math.abs(Date.parse(failure.since) - aborted) > SLACK

/**
 * Returns the time a stored halt records, or `time` where it records none, as
 * a halt stored as text does.
 */
const haltedAt = (halt: unknown, time: number): number => Date.parse(Object(halt).time) || time

const isoOf = (time: number) => new Date(time).toISOString()

/**
 * Returns the records of `records` whose payload `codes` marks active, leaving
 * out a payload `codes` holds no code for.
 */
export const activeOf = (codes: celestrak.Satcat['codes'], records: readonly Record[]) =>
  records.filter(record => ACTIVE.includes(codes[record.NORAD_CAT_ID] ?? ''))

/**
 * Runs the cycle each hour, keeping the time of the last attempt, of the last
 * request CelesTrak answered, the region that last reached CelesTrak, the wait,
 * and the SATCAT in the storage of the Durable Object.
 */
export class Cycle {
  constructor(
    private readonly state      : Pick<SyncKvStorage, 'delete' | 'get' | 'put'>,
    private readonly env        : Bindings,
    private readonly send       : (region: Region, source: string) => Promise<Response>,
    private readonly spaceTrack : Pick<spacetrack.SpaceTrack, 'elements'>
  ) {}

  /**
   * Keeps the SATCAT current and stores the elements of its active payloads,
   * unless the last attempt was under `EVERY` before `time` by more than
   * `SLACK`, which returns `early`. A failure of either logs at error level and
   * keeps the stored file, and any other error rejects the run.
   */
  async run(time: number): Promise<'early' | Outcome> {
    if (ahead((this.state.get<number>('attempted') ?? -Infinity) + EVERY, time)) return 'early'
    this.state.put('attempted', time)
    const satcat = await this.sort(time)
    return { elements: await this.store(time), satcat }
  }

  /**
   * Reads the SATCAT directory from the first region that reaches CelesTrak,
   * starting from the one that last did, and downloads the SATCAT file from
   * that region where the directory lists it newer than the one kept, reading
   * the directory once a run. The time each request was sent is kept under
   * `downloaded` for a SATCAT file CelesTrak answered with 200, and for any
   * answer that fails its check, and under `aborted` for each request that
   * timed out waiting for headers. A region that fails to connect, or whose 403
   * names a download the cycle did not make, passes to the next, and any other
   * failure returns the fault that starts a wait. Where no region is left, the
   * fault is the last such 403 beside each region's result, or `unreached`
   * where there was none.
   */
  private async refresh(): Promise<Fault | 'current' | 'downloaded'> {
    const downloaded      = this.state.get<number>('downloaded') ?? -Infinity
    const aborted         = this.state.get<number>('aborted') ?? -Infinity
    const reached         = this.state.get<Region>('reached')
    const kept            = this.state.get<celestrak.Satcat>('satcat')?.time ?? -Infinity
    const regions: Misses = {}
    let listed: number | undefined
    let shared: celestrak.Failure & { region: Region } | undefined
    for (const region of REGIONS.toSorted((a, b) => Number(b === reached) - Number(a === reached))) {
      let sent = Date.now()
      try {
        listed ??= await celestrak.download(this.send(region, celestrak.DIRECTORY), celestrak.listedOf)
        this.state.put('reached', region)
        if (listed <= kept) return 'current'
        sent        = Date.now()
        const codes = await celestrak.download(this.send(region, celestrak.SATCAT), celestrak.codesOf)
        this.state.put('downloaded', sent)
        this.state.put('satcat', { codes, time: listed } satisfies celestrak.Satcat)
        console.log({ event: 'catalog.sorted', listed: isoOf(listed), payloads: Object.keys(codes).length })
        return 'downloaded'
      } catch (error) {
        if (!(error instanceof celestrak.Failed || error instanceof celestrak.Unreachable)) throw error
        if (error instanceof celestrak.Failed) {
          const { kind } = error.failure
          if (kind === 'unanswered') this.state.put('aborted', sent)
          if (kind === 'unchecked') this.state.put('downloaded', sent)
          shared = { ...error.failure, region }
          if (!elsewhere(downloaded, aborted, error.failure)) return shared
        }
        regions[region] = error.message
      }
    }
    return shared === undefined
      ? { kind: 'unreached', reason: 'No region reached CelesTrak', regions }
      : { ...shared, regions }
  }

  /**
   * Keeps the SATCAT current unless a wait runs past `time` by more than
   * `SLACK`. A fault `refresh` returns starts a wait, logging it at error
   * level, and each run the wait blocks logs it again. A halt kept under
   * `halted` turns into a wait ending `EVERY` after the time the halt records,
   * which ends at once for a halt recorded `EVERY` less `SLACK` or more before
   * `time`, and the `alerted` mark beside it is deleted. A request that
   * succeeds ends the wait, logging the wait it ends.
   */
  private async sort(time: number): Promise<Outcome['satcat']> {
    const halt = this.state.get('halted')
    if (halt !== undefined) {
      this.state.delete('alerted')
      this.state.delete('halted')
      const reason = 'The cycle halted before waits replaced halts'
      if (ahead(Date.parse(this.wait(haltedAt(halt, time), { halt, kind: 'halted', reason }).until), time))
        return 'waiting'
    }
    const kept = this.state.get<Wait>('wait')
    if (kept !== undefined && ahead(Date.parse(kept.until), time)) {
      console.error({ event: 'catalog.blocked', wait: kept })
      return 'waiting'
    }
    const result = await this.refresh()
    if (typeof result === 'object') {
      this.wait(time, result, kept)
      return 'waiting'
    }
    if (kept !== undefined) {
      this.state.delete('wait')
      console.log({ event: 'catalog.recovered', wait: kept })
    }
    return result
  }

  /**
   * Queries Space-Track for the elements with the login the service holds as
   * its secrets and stores those of the payloads the kept SATCAT marks active.
   * No SATCAT kept, no login set, a failure the query names, or a failed write
   * to Workers KV logs one `catalog.failed` record at error level and keeps the
   * stored file.
   */
  private async store(time: number): Promise<Outcome['elements']> {
    const failed = (kind: string, reason: string) => {
      console.error({ event: 'catalog.failed', kind, reason, time: isoOf(time) })
      return 'failed' as const
    }
    const { [spacetrack.SECRETS.identity]: identity, [spacetrack.SECRETS.password]: password } = this.env
    const satcat = this.state.get<celestrak.Satcat>('satcat')
    if (satcat === undefined) return failed('unsorted', 'No SATCAT is kept yet')
    if (identity === undefined || password === undefined)
      return failed('unset', 'No Space-Track login is set as the service’s secrets')
    const records = await this.spaceTrack.elements({ identity, password }).catch((error: unknown) => {
      if (error instanceof spacetrack.Failure) return error
      throw error
    })
    if (records instanceof spacetrack.Failure) return failed(records.kind, records.message)
    const active = activeOf(satcat.codes, records)
    return this.env.CATALOG.put(FILE, encode(time, active)).then(
      () => {
        console.log({ event: 'catalog.stored', active: active.length, queried: records.length })
        return 'stored' as const
      },
      (error: unknown) => failed('unstored', String(error))
    )
  }

  /**
   * Starts a wait after `fault` at `time`, counting the refusals since the last
   * request that succeeded from `before`, the wait it follows, and logs it at
   * error level, returning the wait.
   */
  private wait(time: number, fault: Fault | Halted, before?: Wait) {
    const refusals   = (before?.refusals ?? 0) + Number(fault.kind === 'refused')
    const wait: Wait = {
      ...fault,
      event    : 'catalog.waiting',
      refusals : refusals,
      time     : isoOf(time),
      until    : isoOf(time + delayOf(fault, refusals, time))
    }
    console.error(wait)
    this.state.put('wait', wait)
    return wait
  }
}
