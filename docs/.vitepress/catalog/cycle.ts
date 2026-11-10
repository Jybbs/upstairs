/**
 * Runs the download cycle, storing each catalog in Workers KV and halting with
 * an alert on any failure until the cycle is resumed.
 */
import { FILE }     from '../lib/orbit/catalog.ts'
import { download } from './celestrak.ts'
import { encode }   from './encode.ts'
import { RESUME }   from './serve.ts'

/**
 * The shortest time between two downloads, in milliseconds.
 */
export const EVERY = 2 * 3_600_000

export interface Bindings {
  ALERT_FROM : string
  ALERT_TO   : string
  CATALOG    : Pick<KVNamespace, 'put'>
  EMAIL      : Pick<SendEmail, 'send'>
}

/**
 * Runs one download each cycle, keeping the time of the last attempt, the
 * reason it halted, and whether the alert went out in the storage of the
 * Durable Object.
 */
export class Cycle {
  constructor(
    private readonly state   : Pick<SyncKvStorage, 'delete' | 'get' | 'put'>,
    private readonly env     : Bindings,
    private readonly fetcher : typeof fetch
  ) {}

  /**
   * Downloads and stores the catalog unless the cycle has halted or the last
   * attempt was under two hours before `time`. A failure keeps the stored file,
   * halts the cycle, and sends the alert, which each halted run sends again
   * until a send succeeds.
   */
  async run(time: number): Promise<'early' | 'halted' | 'stored'> {
    const halted = this.state.get<string>('halted')
    if (halted !== undefined) {
      if (this.state.get('alerted') === undefined) await this.alert(halted)
      return 'halted'
    }
    if (time - (this.state.get<number>('attempted') ?? -Infinity) < EVERY) return 'early'
    this.state.put('attempted', time)
    try {
      await this.env.CATALOG.put(FILE, encode(time, await download(this.fetcher)))
      return 'stored'
    } catch (error) {
      const reason = String(error)
      this.state.put('halted', reason)
      await this.alert(reason)
      return 'halted'
    }
  }

  /**
   * Clears the halt and the record of its alert, leaving the next download to
   * the next cycle.
   */
  resume() {
    this.state.delete('halted')
    this.state.delete('alerted')
  }

  /**
   * Sends the alert for `reason`, recording that it went out once the send
   * succeeds.
   */
  private async alert(reason: string) {
    await this.env.EMAIL.send({
      from    : this.env.ALERT_FROM,
      subject : 'The Upstairs catalog stopped refreshing',
      text    : `${reason}\n\nThe last good catalog stays in place. POST to ${RESUME} with the resume `
              + 'token to start the cycle again.',
      to      : this.env.ALERT_TO
    })
    this.state.put('alerted', true)
  }
}
