<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { Button } from '@/ui/button'

import { neighbours } from './docs-nav'

// The previous and next page at the end of a documentation page, as on the
// shadcn-vue docs: secondary buttons with the page titles.
const route = useRoute()
const around = computed(() => neighbours(route.path))
</script>

<template>
  <nav
    aria-label="Previous and next page"
    class="flex w-full max-w-160 items-center gap-2 pt-10"
  >
    <Button
      v-if="around.previous"
      as-child
      variant="secondary"
      class="h-auto min-h-11 min-w-0 max-w-[calc(50%-0.25rem)] whitespace-normal py-2 text-left lg:pointer-fine:min-h-8"
    >
      <RouterLink :to="`/${around.previous.id}`">
        <ArrowLeftIcon />
        <span class="min-w-0 break-words">{{ around.previous.title }}</span>
      </RouterLink>
    </Button>
    <Button
      v-if="around.next"
      as-child
      variant="secondary"
      class="ml-auto h-auto min-h-11 min-w-0 max-w-[calc(50%-0.25rem)] whitespace-normal py-2 text-right lg:pointer-fine:min-h-8"
    >
      <RouterLink :to="`/${around.next.id}`">
        <span class="min-w-0 break-words">{{ around.next.title }}</span>
        <ArrowRightIcon />
      </RouterLink>
    </Button>
  </nav>
</template>
