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
type Locked = Record<string, unknown> & { version: string }

const PLATFORM = /^platforms\.(?<platform>.+)$/

/**
 * Returns the drifts `mise lock --check` passes, meaning each tool version
 * `tools` locks that no entry of `checked` declares, and each platform entry
 * holding no URL, which the check requires only of the `core` backends.
 */
export const driftsOf = (checked: Checked[], tools: Record<string, Locked[]>): string[] => {
  const declared = new Set(checked.map(({ tool, version }) => `${tool}@${version}`))
  return Object.entries(tools).flatMap(([tool, entries]) => entries.flatMap(entry => [
    ...declared.has(`${tool}@${entry.version}`)
      ? []
      : [`${tool}@${entry.version} in .mise/mise.lock, which .mise/config.toml no longer declares`],
    ...Object.entries(entry).flatMap(([key, table]) => {
      const platform = PLATFORM.exec(key)?.groups?.platform
      return platform && !(table as { url?: string }).url
        ? [`no URL for ${tool}@${entry.version} on ${platform} in .mise/mise.lock`]
        : []
    })
  ]))
}

if (import.meta.main) {
  const { tools } = Bun.TOML.parse(await Bun.file('.mise/mise.lock').text()) as { tools: Record<string, Locked[]> }
  const drifts    = driftsOf(await Bun.stdin.json(), tools)
  for (const drift of drifts) console.error(`lock:check found ${drift}, so run mise relock`)
  process.exitCode = drifts.length && 1
}
