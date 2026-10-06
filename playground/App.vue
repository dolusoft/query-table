<script setup lang="ts">
import { SearchIcon } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { ref, watch } from 'vue'

import { setTheme, themeFromUrl, type Theme } from './harness/theme'
import { pages } from './manifest'
import DocSearch from './search/DocSearch.vue'

// System follows the OS (`prefers-color-scheme`); light and dark set
// `data-theme` on <html>, which wins. `?theme=light|dark` picks one on load.
const theme = ref<Theme | 'system'>(themeFromUrl() ?? 'system')
watch(theme, value => setTheme(value === 'system' ? null : value), {
  immediate: true
})
const themes = ['system', 'light', 'dark'] as const

// Documentation search: Ctrl+K / ⌘K anywhere, `/` when not typing.
const searchOpen = ref(false)
const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.key.toLowerCase() === 'k'
  ) {
    event.preventDefault()
    searchOpen.value = !searchOpen.value
  } else if (
    event.key === '/' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !searchOpen.value &&
    !isTyping(event.target)
  ) {
    event.preventDefault()
    searchOpen.value = true
  }
})
</script>

<template>
  <div class="flex min-h-screen flex-col lg:flex-row">
    <aside
      class="min-w-0 shrink-0 border-b p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-r lg:border-b-0"
    >
      <p class="pb-1 text-sm font-semibold">Query Table</p>
      <p class="pb-4 text-xs text-muted-foreground">Playground</p>
      <button
        type="button"
        data-testid="doc-search-button"
        class="mb-3 flex min-h-10 w-full items-center gap-2 rounded-md border bg-input/30 px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground lg:mb-4 lg:min-h-8"
        @click="searchOpen = true"
      >
        <SearchIcon class="size-4 shrink-0 opacity-60" />
        <span class="flex-1 text-left">Search docs</span>
        <kbd
          class="rounded border bg-muted px-1.5 font-mono text-[10px] tracking-widest"
          >{{ shortcut }}</kbd
        >
      </button>
      <nav
        aria-label="Examples"
        class="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        <RouterLink
          v-for="page in pages"
          :key="page.id"
          :to="`/${page.id}`"
          class="flex min-h-10 shrink-0 items-center rounded-md px-2 py-1 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground lg:min-h-0"
          active-class="bg-muted text-foreground font-medium"
        >
          {{ page.title }}
        </RouterLink>
      </nav>
      <div
        class="mt-3 inline-flex rounded-lg border p-0.5 text-xs lg:mt-4"
        role="radiogroup"
        aria-label="Theme"
      >
        <button
          v-for="option in themes"
          :key="option"
          type="button"
          role="radio"
          :aria-checked="theme === option"
          class="min-h-10 rounded-md px-3 py-1 capitalize text-muted-foreground aria-checked:bg-muted aria-checked:text-foreground lg:min-h-0 lg:px-2"
          @click="theme = option"
        >
          {{ option }}
        </button>
      </div>
    </aside>
    <main class="min-w-0 flex-1 p-4 lg:p-8">
      <!-- A new page instance per route: each page mounts its own example. -->
      <RouterView :key="$route.path" />
    </main>
    <DocSearch v-model:open="searchOpen" />
  </div>
</template>
