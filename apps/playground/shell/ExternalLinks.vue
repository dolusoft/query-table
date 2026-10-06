<script setup lang="ts">
import { Button } from '@/ui/button'

import BrandIcon from './BrandIcon.vue'
import { externalLinks, hrefOf, type ExternalLinkIcon } from './external-links'

// Small links with a logo, each opening in a new tab. `only` picks and orders
// links; `iconOnlyBelow` hides the text on a phone (the name stays for screen
// readers and as `aria-label`).
const props = withDefaults(
  defineProps<{
    only?: ExternalLinkIcon[]
    label: string
    iconOnlyOnPhone?: boolean
  }>(),
  { only: () => ['tanstack', 'github', 'releases', 'llms'] }
)

const base = import.meta.env.BASE_URL
const links = props.only.map(id => externalLinks.find(link => link.id === id)!)
</script>

<template>
  <ul :aria-label="label" class="flex flex-wrap items-center gap-1">
    <li v-for="link in links" :key="link.id">
      <Button
        as-child
        variant="ghost"
        size="sm"
        class="min-h-11 text-muted-foreground sm:min-h-7"
        :class="iconOnlyOnPhone ? 'max-sm:min-w-11 max-sm:px-0' : ''"
      >
        <a
          :href="hrefOf(link, base)"
          target="_blank"
          rel="noopener"
          :aria-label="`${link.label} (opens in a new tab)`"
          :data-testid="`external-${link.id}`"
        >
          <BrandIcon :name="link.id" />
          <span :class="iconOnlyOnPhone ? 'max-sm:sr-only' : ''">{{
            link.label
          }}</span>
        </a>
      </Button>
    </li>
  </ul>
</template>
