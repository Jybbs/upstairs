/**
 * Runs the download cycle, sending the request from each region in turn until
 * one reaches CelesTrak and storing each catalog in Workers KV. A refusal, a
 * catalog that fails its check, no region reaching CelesTrak, no headers within
 * the wait, or a failed write to Workers KV starts a wait the cycle ends on its
 * own, and the wait is logged once and kept in the storage of the Durable
 * Object until a download succeeds. Any other error fails the run without a
 * wait.
 */
import { DAY, FILE }  from '../lib/orbit/catalog.ts'
import * as celestrak from './celestrak.ts'
import { encode }     from './encode.ts'

export interface Bindings {
  CATALOG: Pick<KVNamespace, 'put'>
}

type Fault =
  | (celestrak.Failure | { kind: 'unstored', reason: string }) & { region: Region }
  | { kind: 'unreached', reason: string, regions: Misses }

/**
 * A halt kept under `halted` in the storage of the Durable Object, which the
 * cycle turns into a wait.
 */
type Halted = { halt: unknown, kind: 'halted', reason: string }

/**
 * The result of each region that failed to reach CelesTrak.
 */
type Misses = { [region in Region]?: string }

export type Region = typeof REGIONS[number]

/**
 * The record of a wait, naming the kind of failure, the reason, and the region
 * the failure came through, or the result of each region where none reached
 * CelesTrak, beside the refusals in a row up to it and the time it ends.
 */
export type Wait = (Fault | Halted)
  & { event: 'catalog.waiting', refusals: number, time: string, until: string }

/**
 * The shortest time between two downloads, in milliseconds, the period
 * CelesTrak updates on and the spacing of the scheduled runs.
 */
export const EVERY = 2 * 3_600_000
/**
 * The longest wait a run of refusals doubles up to, in milliseconds, unless
 * `retry-after` asks for longer.
 */
export const LONGEST = DAY
/**
 * The latest time a `Date` holds, in milliseconds.
 */
const LATEST = 8.64e15
/**
 * The location hints of the relays sending the request, in the order a cycle
 * tries them after the one that last reached CelesTrak.
 */
export const REGIONS = ['weur', 'apac', 'enam', 'wnam', 'eeur'] as const satisfies DurableObjectLocationHint[]

/**
 * Returns the milliseconds after `time` a `retry-after` value asks the cycle to
 * wait, read as seconds or as an HTTP date, or 0 where it holds neither.
 */
const askedOf = (value: string | undefined, time: number) =>
  value === undefined ? 0 : /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - time || 0

/**
 * Returns how long the cycle waits after `fault`, where a refusal waits
 * `EVERY`, doubled for each refusal before it in the row up to `LONGEST`, or
 * as long as its `retry-after` asks where that is longer, and every other fault
 * waits for the next scheduled run.
 */
const delayOf = (fault: Fault | Halted, refusals: number, time: number) => fault.kind === 'refused'
  ? Math.max(Math.min(EVERY * 2 ** (refusals - 1), LONGEST), askedOf(fault.headers['retry-after'], time))
  : EVERY

const isoOf = (time: number) => new Date(time).toISOString()

/**
 * Runs one download each cycle, keeping the time of the last attempt, the
 * region that last reached CelesTrak, and the wait in the storage of the
 * Durable Object.
 */
export class Cycle {
  constructor(
    private readonly state : Pick<SyncKvStorage, 'delete' | 'get' | 'put'>,
    private readonly env   : Bindings,
    private readonly send  : (region: Region) => Promise<Response>
  ) {}

  /**
   * Downloads and stores the catalog unless a wait runs past `time` or the last
   * attempt was under `EVERY` before it. A fault `refresh` returns keeps the
   * stored file and starts a wait, logging it at error level, and each run the
   * wait blocks logs it again. A halt kept under `halted` turns into a wait of
   * `EVERY` from `time`. A download that succeeds ends the wait, logging the
   * wait it ends. Any other error rejects the run without a wait.
   */
  async run(time: number): Promise<'early' | 'stored' | 'waiting'> {
    const halt = this.state.get('halted')
    if (halt !== undefined) {
      this.state.delete('halted')
      this.wait(time, { halt, kind: 'halted', reason: 'The cycle halted before waits replaced halts' })
      return 'waiting'
    }
    const kept = this.state.get<Wait>('wait')
    if (kept !== undefined && time < Date.parse(kept.until)) {
      console.error({ event: 'catalog.blocked', wait: kept })
      return 'waiting'
    }
    if (time - (this.state.get<number>('attempted') ?? -Infinity) < EVERY) return 'early'
    this.state.put('attempted', time)
    const fault = await this.refresh(time)
    if (fault !== undefined) {
      this.wait(time, fault, kept)
      return 'waiting'
    }
    if (kept !== undefined) {
      this.state.delete('wait')
      console.log({ event: 'catalog.recovered', wait: kept })
    }
    return 'stored'
  }

  /**
   * Downloads the catalog from the first region that reaches CelesTrak,
   * starting from the one that last did, and stores it, returning the fault
   * that starts a wait where the download or the write fails.
   */
  private async refresh(time: number): Promise<Fault | undefined> {
    const reached         = this.state.get<Region>('reached')
    const regions: Misses = {}
    for (const region of REGIONS.toSorted((a, b) => Number(b === reached) - Number(a === reached))) {
      try {
        const records = await celestrak.download(this.send(region))
        this.state.put('reached', region)
        return await this.env.CATALOG.put(FILE, encode(time, records)).then(
          () => undefined,
          (error: unknown) => ({ kind: 'unstored', reason: String(error), region }) as const
        )
      } catch (error) {
        if (error instanceof celestrak.Failed) return { ...error.failure, region }
        if (!(error instanceof celestrak.Unreachable)) throw error
        regions[region] = error.message
      }
    }
    return { kind: 'unreached', reason: 'No region reached CelesTrak', regions }
  }

  /**
   * Starts a wait after `fault` at `time`, counting the refusals in a row from
   * `before`, the wait it follows, and logs it at error level.
   */
  private wait(time: number, fault: Fault | Halted, before?: Wait) {
    const refusals   = (before?.refusals ?? 0) + Number(fault.kind === 'refused')
    const wait: Wait = {
      ...fault,
      event    : 'catalog.waiting',
      refusals : refusals,
      time     : isoOf(time),
      until    : isoOf(Math.min(time + delayOf(fault, refusals, time), LATEST))
    }
    console.error(wait)
    this.state.put('wait', wait)
  }
}
