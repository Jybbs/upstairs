import * as dialog                    from '@zag-js/dialog'
import { normalizeProps, useMachine } from '@zag-js/vue'
import { computed, inject, provide, useId, type ComputedRef, type InjectionKey } from 'vue'

import { sky } from '../state/sky.ts'

type Chooser = ComputedRef<dialog.Api>

const CHOOSER: InjectionKey<Chooser> = Symbol('chooser')

/**
 * Runs the spot chooser as a non-modal dialog open while the chooser stands
 * over the map, dismissed on Escape and on a press outside it other than on
 * the map.
 *
 * A component below the one that called `provideChooser` reads that
 * component's dialog, so the readout's spot button and the chooser it opens
 * share one machine.
 */
export const useChooser = (): Chooser => inject(CHOOSER, () => {
  const id      = useId()
  const service = useMachine(dialog.machine, computed(() => ({
    closeOnInteractOutside : true,
    id                     : id,
    modal                  : false,
    onFocusOutside         : (event: dialog.FocusOutsideEvent) => event.preventDefault(),
    open                   : sky.choosing.value === 'open',

    onInteractOutside: (event: dialog.InteractOutsideEvent) => {
      if ((event.detail.originalEvent.target as Element | null)?.closest('[data-map]')) event.preventDefault()
    },

    onOpenChange: ({ open }: dialog.OpenChangeDetails) => {
      if (open) sky.choose()
      else sky.shut()
    }
  })))
  return computed(() => dialog.connect(service, normalizeProps))
}, true)

/**
 * Runs the spot chooser's dialog for every component under the caller.
 */
export const provideChooser = () => provide(CHOOSER, useChooser())
