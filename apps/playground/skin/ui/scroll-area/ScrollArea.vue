<script setup lang="ts">
import type { ScrollAreaRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed, useTemplateRef } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui'
import { cn } from '@/lib/utils'
import ScrollBar from './ScrollBar.vue'

const props = defineProps<
  ScrollAreaRootProps & {
    class?: HTMLAttributes['class']
    viewportClass?: HTMLAttributes['class']
    viewportAttrs?: HTMLAttributes
  }
>()

const delegatedProps = reactiveOmit(
  props,
  'class',
  'viewportClass',
  'viewportAttrs'
)
const viewport =
  useTemplateRef<InstanceType<typeof ScrollAreaViewport>>('viewport')
defineExpose({
  viewportElement: computed(() => viewport.value?.viewportElement)
})
</script>

<template>
  <ScrollAreaRoot
    data-slot="scroll-area"
    v-bind="delegatedProps"
    :class="cn('relative', props.class)"
  >
    <ScrollAreaViewport
      ref="viewport"
      data-slot="scroll-area-viewport"
      v-bind="viewportAttrs"
      :class="
        cn(
          'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1',
          viewportClass
        )
      "
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
