<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import type { HTMLAttributes } from 'vue'
import { ref, useTemplateRef } from 'vue'
import { cn } from '@/lib/utils'
import { ScrollArea, ScrollBar } from '@/ui/scroll-area'

const props = defineProps<{
  class?: HTMLAttributes['class']
  /** Id of the heading that names the table: the scroll container becomes a named region. */
  labelledby?: string
}>()

// A container that scrolls sideways is a Tab stop, so a keyboard can scroll
// it (WCAG 2.1.1); one that fits is not, so it adds no empty stop.
const container = useTemplateRef<InstanceType<typeof ScrollArea>>('container')
const table = useTemplateRef<HTMLElement>('table')
const overflows = ref(false)
useResizeObserver([() => container.value?.viewportElement, table], () => {
  const element = container.value?.viewportElement
  overflows.value = !!element && element.scrollWidth > element.clientWidth
})
</script>

<template>
  <!-- Keep the skin's table-container classes; the constrained viewport
       inside owns scrolling, so this wrapper never overflows itself. -->
  <div data-slot="table-container" class="relative w-full overflow-x-auto">
    <ScrollArea
      ref="container"
      class="w-full"
      :viewport-attrs="{
        role: labelledby ? 'region' : undefined,
        'aria-labelledby': labelledby,
        tabindex: overflows ? 0 : -1
      }"
    >
      <table
        ref="table"
        data-slot="table"
        :class="cn('w-full caption-bottom text-sm', props.class)"
      >
        <slot />
      </table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  </div>
</template>
