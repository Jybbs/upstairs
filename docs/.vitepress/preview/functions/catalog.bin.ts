/**
 * Answers the catalog's path on a preview deployment with the response the
 * catalog service gives on the site's own address at the time of the request.
 */
import manifest from '../../../package.json' with { type: 'json' }
import { FILE } from '../../lib/orbit/catalog.ts'

export const onRequestGet: PagesFunction = () => fetch(new URL(FILE, manifest.homepage))
