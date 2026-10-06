<script setup lang="ts">
import { FileTextIcon, TagIcon } from '@lucide/vue'

import { githubPath, tanstackPath } from './brand-paths'
import type { ExternalLinkIcon } from './external-links'

// One logo: TanStack and GitHub are brand paths, the others are lucide icons.
// Decorative: the link around it carries the name.
defineProps<{ name: ExternalLinkIcon }>()
</script>

<template>
  <svg
    v-if="name === 'tanstack' || name === 'github'"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="name === 'tanstack' ? tanstackPath : githubPath" />
  </svg>
  <TagIcon v-else-if="name === 'releases'" aria-hidden="true" />
  <FileTextIcon v-else aria-hidden="true" />
</template>
