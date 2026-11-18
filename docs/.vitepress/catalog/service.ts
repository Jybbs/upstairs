/**
 * Wires the download cycle to a cron trigger and to the run path through one
 * Durable Object, which sends each request to CelesTrak through a relay placed
 * in each region and each request to Space-Track itself, and serves the catalog
 * on every other request.
 */
import { DurableObject } from 'cloudflare:workers'

import { fetchFrom }                 from './celestrak.ts'
import { Cycle, type Bindings }      from './cycle.ts'
import { type Requested, requested } from './requested.ts'
import { serve, type Served }        from './serve.ts'
import { SpaceTrack }                from './spacetrack.ts'

interface Env extends Bindings, Requested, Served {
  CATALOG   : KVNamespace
  REFRESHER : DurableObjectNamespace<Refresher>
  RELAYS    : DurableObjectNamespace<Relay>
}

/**
 * The one Durable Object running the download cycle.
 */
export class Refresher extends DurableObject<Env> {
  private readonly cycle = new Cycle(this.ctx.storage.kv, this.env, (region, source) =>
    this.env.RELAYS.getByName(region, { locationHint: region }).fetchFrom(source), new SpaceTrack())

  run(time: number) { return this.cycle.run(time) }
}

/**
 * The Durable Object sending each request to CelesTrak from the data center
 * Cloudflare chose near its location hint when the object was first created.
 */
export class Relay extends DurableObject {
  fetchFrom(source: string) { return fetchFrom(fetch, source) }
}

const refresher = (env: Env) => env.REFRESHER.getByName('catalog')

export default {
  fetch: async (request, env, ctx) =>
       await requested(env, request, () => refresher(env).run(Date.now()))
    ?? serve(caches.default, env, request, promise => ctx.waitUntil(promise)),

  async scheduled(controller, env) {
    await refresher(env).run(controller.scheduledTime)
  }
} satisfies ExportedHandler<Env>
