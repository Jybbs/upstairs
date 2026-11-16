import { UNLOADED } from '../orbit/catalog.ts'

type Failure = 'blank' | 'partial' | 'unloaded' | 'untraced'
type Key     = (typeof STEPS)[number]

/**
 * How a step the map waits on stands: finished, failed, under way, or not yet
 * begun.
 */
export type Mark = 'done' | 'fail' | 'now' | 'wait'

/**
 * What the readout and the Focus panel show while the map waits or fails: each
 * step, the one they lead with, the failure that stopped the map, its line and
 * note, the way back from it, and whether loading the catalog again is that
 * way.
 */
export interface Moment {
  catalog : Step
  failure : Failure | null
  lead    : Key
  line    : string
  map     : Step
  next    : string
  note    : string
  passes  : Step
  retry   : boolean
}

/**
 * Where the catalog and the scan stand: the catalog downloading, failing
 * before any of it arrived or partway, too old to draw, the scan tracing,
 * failing, or finished.
 */
export type Stage = 'expired' | 'fetching' | 'partial' | 'traced' | 'tracing' | 'unloaded' | 'untraced'

/**
 * What a moment reads from the shared state: how many satellites stand above
 * the horizon, whether the map cannot draw, how many the catalog holds,
 * whether the scan finished, the share it traced, and the stage.
 */
export interface Standing {
  above : number
  blank : boolean
  count : number
  done  : boolean
  share : number
  stage : Stage
}

/**
 * One step's mark, its reading in the legend, and the share of it done where
 * that is known.
 */
export interface Step {
  mark    : Mark
  reading : string
  share?  : number
}

/**
 * The way back from each failure.
 */
const NEXT: Record<Failure, string> = {
  blank    : 'Turning on hardware acceleration, or opening the page in a browser with WebGL2, draws it.',
  partial  : 'Try again loads the whole catalog from the start.',
  unloaded : 'Try again loads the catalog from the start.',
  untraced : 'Choosing another spot or hour traces the passes again.'
}
export const NAMES = { catalog: 'Catalog', map: 'Map', passes: 'Passes' } as const
/**
 * The steps the map waits on, outermost first.
 */
export const STEPS = ['catalog', 'passes', 'map'] as const
/**
 * The lines the readout and the Focus panel show for each failure and for the
 * download, and the label of the button loading the catalog again.
 */
export const WORDS = {
  blank    : 'This browser cannot draw the map',
  fetching : 'Fetching the catalog',
  partial  : 'The rest of the catalog did not load',
  retry    : 'Try again',
  unloaded : UNLOADED,
  untraced : 'The passes could not be traced'
} as const

const catalogOf = ({ count, stage }: Standing): Step => {
  if (stage === 'fetching') return { mark: 'now', reading: 'Fetching' }
  if (stage === 'unloaded') return { mark: 'fail', reading: 'Did not load', share: 0 }
  return { mark: stage === 'partial' ? 'fail' : 'done', reading: `${count.toLocaleString()} read` }
}

const mapOf = (blank: boolean): Step => blank
  ? { mark: 'fail', reading: 'No WebGL2', share: 0 }
  : { mark: 'done', reading: 'Drawn' }

const passesOf = ({ above, done, share, stage }: Standing): Step => {
  if (stage === 'untraced') return { mark: 'fail', reading: `Stopped ${percent(share)}`, share }
  if (done) return { mark: 'done', reading: `${above.toLocaleString()} up` }
  return stage === 'tracing' || stage === 'partial'
    ? { mark: 'now', reading: `${percent(share)} traced`, share }
    : { mark: 'wait', reading: 'Waiting' }
}

const percent = (share: number) => `${Math.round(share * 100)}%`

/**
 * Writes what each moment says under its line, as a sentence with no closing
 * period.
 */
const noteOf = (key: Failure | 'fetching' | 'tracing', { count, share }: Standing) => ({
  blank    : 'This browser offers no WebGL2, which the map is drawn with',
  fetching : 'The passes over this spot are traced once the orbits arrive',
  partial  : `The download stopped after ${count.toLocaleString()} orbits arrived`,
  tracing  : 'Each satellite joins the map as its pass is traced, and the pass to follow opens here once '
           + 'the trace ends',
  unloaded : 'No orbits arrived, so no pass over this spot can be traced',
  untraced : `The trace over this spot stopped at ${percent(share)}`
})[key]

/**
 * Reads where each step stands, the failure leading where the catalog failed,
 * then where the scan did, then where the map cannot draw.
 */
export const momentOf = (standing: Standing): Moment => {
  const { blank, share, stage } = standing

  const failure = stage === 'unloaded' || stage === 'partial' || stage === 'untraced'
    ? stage
    : blank ? 'blank' : null
  const steps  = { catalog: catalogOf(standing), map: mapOf(blank), passes: passesOf(standing) }
  const marked = (mark: Mark) => STEPS.find(key => steps[key].mark === mark)
  const line   = stage === 'fetching' ? WORDS.fetching : `Tracing passes ${percent(share)}`
  return {
    ...steps,
    failure : failure,
    lead    : marked('fail') ?? marked('now') ?? 'passes',
    line    : failure ? WORDS[failure] : line,
    next    : failure ? NEXT[failure] : '',
    note    : noteOf(failure ?? (stage === 'fetching' ? 'fetching' : 'tracing'), standing),
    retry   : stage === 'unloaded' || stage === 'partial'
  }
}
