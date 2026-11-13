import { readFileSync } from 'node:fs'

/**
 * The README as the repository ships it.
 */
export const README = readFileSync(new URL('../../../../.github/README.md', import.meta.url), 'utf8')

/**
 * Reads a file under `docs/public/` as the site ships it.
 */
export const publicOf = (file: string) =>
  readFileSync(new URL(`../../../public/${file}`, import.meta.url), 'utf8')
