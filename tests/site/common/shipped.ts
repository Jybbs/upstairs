import { readFileSync } from 'node:fs'
import { join }         from 'node:path'

import { ROOT } from './reads.ts'

/**
 * The README as the repository ships it.
 */
export const README = readFileSync(join(ROOT, '.github/README.md'), 'utf8')

/**
 * Reads a file under `docs/public/` as the site ships it.
 */
export const publicOf = (file: string) => readFileSync(join(ROOT, 'docs/public', file), 'utf8')
