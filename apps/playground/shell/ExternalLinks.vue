<script setup lang="ts">
import { Button } from '@/ui/button'

import BrandIcon from './BrandIcon.vue'
import { externalLinks as links, hrefOf } from './external-links'

// Small links with a logo, each opening in a new tab. Only the two footers
// show them: the sidebar footer and the home page footer.
defineProps<{ label: string }>()

const base = import.meta.env.BASE_URL
</script>

<template>
  <ul :aria-label="label" class="flex flex-wrap items-center gap-1">
    <li v-for="link in links" :key="link.id">
      <Button
        as-child
        variant="ghost"
        size="sm"
        class="min-h-11 text-muted-foreground sm:pointer-fine:min-h-7"
      >
        <a
          :href="hrefOf(link, base)"
          target="_blank"
          rel="noopener"
          :aria-label="`${link.label} (opens in a new tab)`"
          :data-testid="`external-${link.id}`"
        >
          <BrandIcon :name="link.id" />
          <span>{{ link.label }}</span>
        </a>
      </Button>
    </li>
  </ul>
</template>
