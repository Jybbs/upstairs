/**
 * Wires the download cycle to a cron trigger through one Durable Object, and
 * serves the catalog and the resume path on every other request.
 */
import { DurableObject } from 'cloudflare:workers'

import { Cycle, type Bindings } from './cycle.ts'
import { serve, type Served }   from './serve.ts'

interface Env extends Bindings, Served {
  CATALOG   : KVNamespace
  REFRESHER : DurableObjectNamespace<Refresher>
}

/**
 * The one Durable Object running the download cycle.
 */
export class Refresher extends DurableObject<Env> {
  private readonly cycle = new Cycle(this.ctx.storage.kv, this.env, fetch)

  run(time: number) { return this.cycle.run(time) }

  resume() { this.cycle.resume() }
}

const refresher = (env: Env) => env.REFRESHER.getByName('catalog')

export default {
  fetch: (request, env, ctx) =>
    serve(caches.default, env, request, promise => ctx.waitUntil(promise), () => refresher(env).resume()),

  async scheduled(controller, env) {
    await refresher(env).run(controller.scheduledTime)
  }
} satisfies ExportedHandler<Env>
