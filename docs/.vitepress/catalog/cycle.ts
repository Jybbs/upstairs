/**
 * Runs the download cycle, sending the request from each region in turn until
 * one reaches CelesTrak and storing each catalog in Workers KV. A refusal, a
 * catalog that fails its check, no region reaching CelesTrak, no headers within
 * the wait, or a failed write to Workers KV halts the cycle until it is
 * resumed, and the halt is logged once and kept in the storage of the Durable
 * Object. Any other error fails the run without halting.
 */
import { FILE }       from '../lib/orbit/catalog.ts'
import * as celestrak from './celestrak.ts'
import { encode }     from './encode.ts'

export interface Bindings {
  CATALOG: Pick<KVNamespace, 'put'>
}

type Fault =
  | (celestrak.Failure | { kind: 'unstored', reason: string }) & { region: Region }
  | { kind: 'unreached', reason: string, regions: Misses }

/**
 * The record of a halt, naming the kind of failure, the reason, and the region
 * the failure came through, or the result of each region where none reached
 * CelesTrak.
 */
type Halt = Fault & { event: 'catalog.halted', time: string }

/**
 * The result of each region that failed to reach CelesTrak.
 */
type Misses = { [region in Region]?: string }

export type Region = typeof REGIONS[number]

/**
 * The shortest time between two downloads, in milliseconds.
 */
export const EVERY = 2 * 3_600_000
/**
 * The location hints of the relays sending the request, in the order a cycle
 * tries them after the one that last reached CelesTrak.
 */
export const REGIONS = ['weur', 'apac', 'enam', 'wnam', 'eeur'] as const satisfies DurableObjectLocationHint[]

/**
 * Runs one download each cycle, keeping the time of the last attempt, the
 * region that last reached CelesTrak, and the halt in the storage of the
 * Durable Object.
 */
export class Cycle {
  constructor(
    private readonly state : Pick<SyncKvStorage, 'delete' | 'get' | 'put'>,
    private readonly env   : Bindings,
    private readonly send  : (region: Region) => Promise<Response>
  ) {}

  /**
   * The halt the cycle stopped on, kept until the cycle is resumed.
   */
  get halt() {
    return this.state.get<Halt>('halted')
  }

  /**
   * Clears the halt, logging the restart beside the halt it clears, and returns
   * that halt, leaving the next download to the next cycle.
   */
  resume() {
    const halt = this.halt
    if (halt === undefined) return undefined
    this.state.delete('halted')
    console.log({ event: 'catalog.resumed', halt })
    return halt
  }

  /**
   * Downloads and stores the catalog unless the cycle has halted or the last
   * attempt was under two hours before `time`. A fault `refresh` returns keeps
   * the stored file and halts the cycle, logging the halt at error level, and
   * each run the halt blocks logs it again. Any other error rejects the run
   * without halting.
   */
  async run(time: number): Promise<'early' | 'halted' | 'stored'> {
    const kept = this.halt
    if (kept !== undefined) {
      console.error({ event: 'catalog.blocked', halt: kept })
      return 'halted'
    }
    if (time - (this.state.get<number>('attempted') ?? -Infinity) < EVERY) return 'early'
    this.state.put('attempted', time)
    const fault = await this.refresh(time)
    if (fault === undefined) return 'stored'
    const halt: Halt = { ...fault, event: 'catalog.halted', time: new Date(time).toISOString() }
    console.error(halt)
    this.state.put('halted', halt)
    return 'halted'
  }

  /**
   * Downloads the catalog from the first region that reaches CelesTrak,
   * starting from the one that last did, and stores it, returning the fault
   * that halts the cycle where the download or the write fails.
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
}
