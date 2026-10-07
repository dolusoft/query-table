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
      class="min-h-11 lg:min-h-8"
    >
      <RouterLink :to="`/${around.previous.id}`">
        <ArrowLeftIcon />
        {{ around.previous.title }}
      </RouterLink>
    </Button>
    <Button
      v-if="around.next"
      as-child
      variant="secondary"
      class="ml-auto min-h-11 lg:min-h-8"
    >
      <RouterLink :to="`/${around.next.id}`">
        {{ around.next.title }}
        <ArrowRightIcon />
      </RouterLink>
    </Button>
  </nav>
</template>
