<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import type { HTMLAttributes } from 'vue'
import { ref, useTemplateRef } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  /** Id of the heading that names the table: the scroll container becomes a named region. */
  labelledby?: string
}>()

// A container that scrolls sideways is a Tab stop, so a keyboard can scroll
// it (WCAG 2.1.1); one that fits is not, so it adds no empty stop.
const container = useTemplateRef<HTMLElement>('container')
const table = useTemplateRef<HTMLElement>('table')
const overflows = ref(false)
useResizeObserver([container, table], () => {
  const element = container.value
  overflows.value = !!element && element.scrollWidth > element.clientWidth
})
</script>

<template>
  <div data-slot="table-container" class="relative w-full overflow-x-auto" ref="container" :role="labelledby ? 'region' : undefined" :aria-labelledby="labelledby" :tabindex="overflows ? 0 : undefined" :class="overflows && 'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset'">
    <table ref="table" data-slot="table" :class="cn('w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>
