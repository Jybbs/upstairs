import * as toggleGroup               from '@zag-js/toggle-group'
import { normalizeProps, useMachine } from '@zag-js/vue'
import { computed, useId }            from 'vue'

import { kindOrder } from '../orbit/kinds.ts'
import { sky }       from '../state/sky.ts'

/**
 * Runs a toggle group whose pressed items are `pressed`, handing each press to
 * `press` as the values pressed after it, its arrow keys moving along
 * `orientation`.
 *
 * The group takes several values at once, so each item carries `aria-pressed`,
 * and a group meant to hold one value at a time narrows the values through
 * `pressedOf`.
 */
export const useToggles = (
  pressed      : () => string[],
  press        : (value: string[]) => void,
  orientation? : toggleGroup.Orientation
) => {
  const id      = useId()
  const service = useMachine(toggleGroup.machine, computed(() => ({
    id            : id,
    multiple      : true,
    onValueChange : ({ value }: toggleGroup.ValueChangeDetails) => press(value),
    orientation   : orientation,
    value         : pressed()
  })))
  return computed(() => toggleGroup.connect(service, normalizeProps))
}

/**
 * Runs a toggle group over the kinds along `orientation`, its pressed items
 * the kinds shown, each press showing the kinds pressed after it.
 */
export const useKinds = (orientation?: toggleGroup.Orientation) => useToggles(
  () => sky.showing.value,
  value => sky.trace(kindOrder.filter(kind => value.includes(kind))),
  orientation
)

/**
 * Reads the value a press added to a group holding `held`, or `undefined` where
 * the press let `held` go.
 */
export const pressedOf = (value: string[], held: string | null) => value.find(item => item !== held)
