import { UNLOADED } from '../orbit/catalog.ts'

/**
 * The lines the map, the readout, and the Focus panel show for each failure
 * and for the download, and the label of the button loading the catalog
 * again.
 */
export const WORDS = {
  blank    : 'This browser cannot draw the map',
  fetching : 'Fetching the catalog',
  partial  : 'The rest of the catalog did not load',
  retry    : 'Try again',
  unloaded : UNLOADED,
  untraced : 'The passes could not be traced'
} as const
