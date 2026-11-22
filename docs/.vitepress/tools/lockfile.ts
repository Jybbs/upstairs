import { TOML } from 'bun'

/**
 * One platform entry `mise lock --check --json` prints for a tool version
 * `.mise/config.toml` declares, its `platform` null where the check matches
 * the request to no locked entry, as after a version or an option changes.
 */
interface Checked {
  platform : string | null
  tool     : string
  version  : string
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

const LOCKFILE   = '.mise/mise.lock'
const PLATFORM   = /^platforms\.(?<platform>.+)$/
const UNDECLARED = 'which .mise/config.toml no longer declares'

/**
 * Returns the drifts `mise lock --check` passes, meaning each tool version
 * `tools` locks that no entry of `checked` declares, each platform a declared
 * version locks that no entry of `checked` names, as after narrowing a tool's
 * `os`, and each platform entry holding no URL, which the check requires of
 * `core` tools but not of `aqua` or `github` ones. A version `checked` lists
 * with a null `platform` takes no platform drift, since the check fails on it.
 */
export const driftsOf = (checked: Checked[], tools: Tools): string[] => {
  const declared  = new Set(checked.flatMap(({ platform, tool, version }) =>
    [`${tool}@${version}`, `${tool}@${version} on ${platform}`]))
  const unmatched = new Set(checked.flatMap(({ platform, tool, version }) =>
    platform === null ? [`${tool}@${version}`] : []))
  return Object.entries(tools).flatMap(([tool, entries]) => entries.flatMap(({ version, ...tables }) => {
    const locked = `${tool}@${version}`
    if (!declared.has(locked)) return [`${locked} in ${LOCKFILE}, ${UNDECLARED}`]
    if (unmatched.has(locked)) return []
    return Object.keys(tables).flatMap(key => {
      const platform = PLATFORM.exec(key)?.groups?.platform
      return platform ? [
        ...declared.has(`${locked} on ${platform}`)
          ? []
          : [`${locked} on ${platform} in ${LOCKFILE}, ${UNDECLARED}`],
        ...tables[`platforms.${platform}`].url ? [] : [`no URL for ${locked} on ${platform} in ${LOCKFILE}`]
      ] : []
    })
  }))
}

if (import.meta.main) {
  const { tools } = TOML.parse(await Bun.file(LOCKFILE).text()) as { tools: Tools }
  const drifts    = driftsOf(await Bun.stdin.json(), tools)
  for (const drift of drifts) console.error(`lock:check found ${drift}, so run mise relock`)
  process.exitCode = drifts.length && 1
}
