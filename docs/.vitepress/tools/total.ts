import { writeFile } from 'node:fs/promises'
import { join }      from 'node:path'

interface Summary {
  total : { lines: { pct: number } }
}

/**
 * Returns the share of lines a Vitest `json-summary` report covered, rounded
 * down to a whole number.
 */
export const totalOf = (summary: Summary): number => Math.floor(summary.total.lines.pct)

if (import.meta.main) {
  const summary = await Bun.file('.cache/coverage/coverage-summary.json').json()
  await writeFile(join(process.argv[2]!, 'coverage.json'), `${totalOf(summary)}\n`)
}
