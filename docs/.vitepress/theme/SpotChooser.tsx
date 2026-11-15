import { useElementSize }                               from '@vueuse/core'
import { defineComponent, onBeforeUnmount, ref, watch } from 'vue'

import { coordinatesOf } from '../lib/orbit/compass.ts'
import { useChooser }    from '../lib/site/chooser.ts'
import { usePhone }      from '../lib/site/phone.ts'
import { sky }           from '../lib/state/sky.ts'

/**
 * Sets the sheet of the spot chooser, naming the spot under the pin with a
 * button setting it and one leaving it, and raising the map on a phone by
 * the height it covers.
 */
export default defineComponent(
  () => {
    const chooser = useChooser()
    const phone   = usePhone()
    const sheet   = ref<HTMLElement>()

    const { height } = useElementSize(sheet, undefined, { box: 'border-box' })
    watch([height, phone], ([covered, small]) => { sky.raised.value = small ? covered : 0 }, {
      immediate: true
    })
    onBeforeUnmount(() => { sky.raised.value = 0 })

    return () => (
      <section
        {...chooser.value.getContentProps()}
        ref={sheet}
        class="grid gap-3 rounded-t-xl border border-b-0 border-rule bg-panel px-4 pt-2 pb-4 shadow-lift"
        hidden={false}
      >
        <div class="h-1 w-10 justify-self-center rounded-full bg-rule" aria-hidden="true" />
        <p {...chooser.value.getTitleProps()} class="caps text-soft">Choose a spot</p>
        {sky.aim.value && [
          <p class="font-mono text-xl font-extrabold uppercase" aria-live="polite">
            {sky.aim.value.place ?? coordinatesOf(sky.aim.value.spot)}
          </p>,
          sky.aim.value.place && <p class="caps text-soft">{coordinatesOf(sky.aim.value.spot)}</p>
        ]}
        <p class="text-soft">Move the map under the pin.</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="caps h-11 basis-full cursor-pointer rounded-full bg-u text-sm! text-page hover:opacity-90"
            onClick={() => sky.land()}
          >Set the spot here</button>
          <button
            {...chooser.value.getCloseTriggerProps()}
            class="caps h-11 cursor-pointer rounded-full border border-rule px-4 text-ink hover:border-soft"
          >Cancel</button>
        </div>
      </section>
    )
  },
  { name: 'SpotChooser' }
)
