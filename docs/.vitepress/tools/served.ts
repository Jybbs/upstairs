/**
 * Checks that the site's own address serves a catalog, failing where it
 * answers anything else and writing that answer into the step summary.
 */
import { appendFile } from 'node:fs/promises'

import manifest     from '../../package.json' with { type: 'json' }
import * as catalog from '../lib/orbit/catalog.ts'

/**
 * The address the site reads its catalog from.
 */
const SERVED = new URL(catalog.FILE, manifest.homepage)

/**
 * Returns `undefined` where `response` is a 200 holding a catalog of one record
 * or more, and otherwise the answer it holds, naming the status and the start
 * of the body or why the file is not a catalog.
 */
export const answerOf = async (response: Response) => {
  if (response.status !== 200 || !response.body)
    return `${response.status} with ${JSON.stringify((await response.text()).slice(0, 200))}`
  try {
    let count = 0
    for await (const { records } of catalog.segmentsOf(response.body)) count += records.length
    return count ? undefined : '200 with a catalog holding no records'
  } catch (error) {
    return `200 with a file that is not a catalog, ${String(error)}`
  }
}

if (import.meta.main) {
  const answer = await answerOf(await fetch(SERVED))
  if (answer !== undefined) {
    const summary = process.env.GITHUB_STEP_SUMMARY ?? '/dev/stdout'
    await appendFile(summary, `[${SERVED}](${SERVED}) answered ${answer}.\n`)
    process.exit(1)
  }
}
