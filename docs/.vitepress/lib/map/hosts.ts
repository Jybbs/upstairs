import { ref } from 'vue'

/**
 * The host serving each source of the map's style, by source id.
 */
export const HOSTS: Readonly<Record<string, string>> = {
  base     : 'OpenFreeMap',
  contours : 'Terrain Tiles',
  dem      : 'Terrain Tiles'
}
const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })

/**
 * Records which hosts the map cannot reach, counting a source as down once it
 * fails before any of its tiles has loaded, and as up again once one loads.
 */
export class Hosts {
  /**
   * The caption naming each host that is down, or an empty string while every
   * host answers.
   */
  readonly message = ref('')

  private readonly down   = new Set<string>()
  private readonly loaded = new Set<string>()

  fail(source: string | undefined) {
    if (!source || !(source in HOSTS) || this.loaded.has(source)) return
    this.down.add(source)
    this.write()
  }

  load(source: string) {
    this.loaded.add(source)
    if (this.down.delete(source)) this.write()
  }

  private write() {
    const hosts        = new Set([...this.down].map(source => HOSTS[source]))
    this.message.value = hosts.size ? `Could not reach ${listFormat.format(hosts)}` : ''
  }
}
