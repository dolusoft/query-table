<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/ui/scroll-area'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ScrollArea
    data-slot="sidebar-content"
    data-sidebar="content"
    :class="cn('min-h-0 flex-1', props.class)"
    viewport-class="overscroll-contain"
  >
    <div class="flex flex-col gap-0 pb-4 pr-3">
      <slot />
    </div>
  </ScrollArea>
</template>
