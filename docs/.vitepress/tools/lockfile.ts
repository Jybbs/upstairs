import { TOML } from 'bun'

/**
 * One platform entry `mise lock --check --json` prints for a tool version
 * `.mise/config.toml` declares.
 */
interface Checked {
  tool    : string
  version : string
}

/**
 * One `[[tools.<name>]]` entry of `.mise/mise.lock`, holding a table under
 * `platforms.<platform>` for each platform it locks beside its `backend`,
 * `specifiers`, and `options`.
 */
interface Locked {
  [field: string]                   : unknown
  [platform: `platforms.${string}`] : { checksum?: string, url?: string }
  version                           : string
}

type Tools = Record<string, Locked[]>

const LOCKFILE = '.mise/mise.lock'
const PLATFORM = /^platforms\.(?<platform>.+)$/

/**
 * Returns the drifts `mise lock --check` passes, meaning each tool version
 * `tools` locks that no entry of `checked` declares, and each platform entry
 * holding no URL, which the check requires of `core` tools but not of `aqua`
 * or `github` ones.
 */
export const driftsOf = (checked: Checked[], tools: Tools): string[] => {
  const declared = new Set(checked.map(({ tool, version }) => `${tool}@${version}`))
  return Object.entries(tools).flatMap(([tool, entries]) => entries.flatMap(entry => [
    ...declared.has(`${tool}@${entry.version}`)
      ? []
      : [`${tool}@${entry.version} in ${LOCKFILE}, which .mise/config.toml no longer declares`],
    ...Object.keys(entry).flatMap(key => {
      const platform = PLATFORM.exec(key)?.groups?.platform
      return platform && !entry[`platforms.${platform}`].url
        ? [`no URL for ${tool}@${entry.version} on ${platform} in ${LOCKFILE}`]
        : []
    })
  ]))
}

if (import.meta.main) {
  const { tools } = TOML.parse(await Bun.file(LOCKFILE).text()) as { tools: Tools }
  const drifts    = driftsOf(await Bun.stdin.json(), tools)
  for (const drift of drifts) console.error(`lock:check found ${drift}, so run mise relock`)
  process.exitCode = drifts.length && 1
}
