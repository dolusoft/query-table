<script setup lang="ts">
import { ref, watch } from 'vue'

import { setTheme, themeFromUrl, type Theme } from './harness/theme'
import { pages } from './manifest'

// System follows the OS (`prefers-color-scheme`); light and dark set
// `data-theme` on <html>, which wins. `?theme=light|dark` picks one on load.
const theme = ref<Theme | 'system'>(themeFromUrl() ?? 'system')
watch(theme, value => setTheme(value === 'system' ? null : value), {
  immediate: true
})
const themes = ['system', 'light', 'dark'] as const
</script>

<template>
  <div class="flex min-h-screen flex-col md:flex-row">
    <aside
      class="shrink-0 border-b p-4 md:sticky md:top-0 md:h-screen md:w-60 md:border-r md:border-b-0"
    >
      <p class="pb-1 text-sm font-semibold">Query Table</p>
      <p class="pb-4 text-xs text-muted-foreground">Playground</p>
      <nav class="flex flex-wrap gap-1 md:flex-col">
        <RouterLink
          v-for="page in pages"
          :key="page.id"
          :to="`/${page.id}`"
          class="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          active-class="bg-muted text-foreground font-medium"
        >
          {{ page.title }}
        </RouterLink>
      </nav>
      <div
        class="mt-4 inline-flex rounded-lg border p-0.5 text-xs"
        role="radiogroup"
        aria-label="Theme"
      >
        <button
          v-for="option in themes"
          :key="option"
          type="button"
          role="radio"
          :aria-checked="theme === option"
          class="rounded-md px-2 py-1 capitalize text-muted-foreground aria-checked:bg-muted aria-checked:text-foreground"
          @click="theme = option"
        >
          {{ option }}
        </button>
      </div>
    </aside>
    <main class="min-w-0 flex-1 p-4 md:p-8">
      <!-- A new page instance per route: each page mounts its own example. -->
      <RouterView :key="$route.path" />
    </main>
  </div>
</template>
