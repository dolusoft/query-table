<script setup lang="ts">
import { SearchIcon } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { ref, watch } from 'vue'

import { Button } from '@/ui/button'
import { Kbd } from '@/ui/kbd'
import { ScrollArea, ScrollBar } from '@/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@/ui/sidebar'

import { guidePages } from './guides/guides'
import { setTheme, themeFromUrl, type Theme } from './harness/theme'
import { repositoryUrl } from './home/home-content'
import { pages } from './manifest'
import DocSearch from './search/DocSearch.vue'
import ThemeToggle from './shell/ThemeToggle.vue'

// The playground shell is shadcn-vue. The home page (`meta.landing`) has a
// top bar and the page below it. A documentation page sits next to a
// `Sidebar` (always expanded) with the search button, the page list and the
// theme switch: on a desktop a column on the left, below `lg` a bar above the
// page whose page list scrolls sideways.

// System follows the OS (`prefers-color-scheme`); light and dark set
// `data-theme` on <html>, which wins. `?theme=light|dark` picks one on load.
// The API examples first, then the guide pages (features, TanStack, AI).
const navigation = [...pages, ...guidePages]

const theme = ref<Theme | 'system'>(themeFromUrl() ?? 'system')
watch(theme, value => setTheme(value === 'system' ? null : value), {
  immediate: true
})

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
  <div v-if="$route.meta.landing" class="flex min-h-svh flex-col bg-background">
    <header
      class="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
    >
      <div
        class="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6"
      >
        <RouterLink to="/" class="mr-auto text-sm font-semibold">
          Query Table
        </RouterLink>
        <nav aria-label="Site" class="flex items-center gap-1">
          <Button
            as-child
            variant="ghost"
            size="sm"
            class="min-h-11 sm:min-h-7"
          >
            <RouterLink to="/overview">Docs</RouterLink>
          </Button>
          <Button
            as-child
            variant="ghost"
            size="sm"
            class="min-h-11 sm:min-h-7"
          >
            <a :href="repositoryUrl" target="_blank" rel="noopener">GitHub</a>
          </Button>
        </nav>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="doc-search-button"
          class="min-h-11 min-w-11 gap-2 sm:min-h-7 sm:min-w-0 bg-background font-normal text-muted-foreground"
          @click="searchOpen = true"
        >
          <SearchIcon class="opacity-60" />
          <span class="sr-only sm:not-sr-only">Search docs</span>
          <Kbd class="hidden sm:inline-flex">{{ shortcut }}</Kbd>
        </Button>
      </div>
    </header>
    <main class="flex-1">
      <RouterView />
    </main>
    <footer class="border-t">
      <div
        class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6"
      >
        <p>
          Query Table ·
          <a
            :href="repositoryUrl"
            target="_blank"
            rel="noopener"
            class="underline-offset-4 hover:underline"
            >Source on GitHub</a
          >
        </p>
        <ThemeToggle v-model="theme" />
      </div>
    </footer>
  </div>
  <SidebarProvider v-else class="flex-col lg:flex-row">
    <aside
      class="min-w-0 shrink-0 border-b lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0"
    >
      <Sidebar collapsible="none" class="h-full w-full lg:w-(--sidebar-width)">
        <SidebarHeader class="gap-3 p-4 pb-2 lg:pb-3">
          <RouterLink
            to="/"
            class="self-start rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span class="block text-sm font-semibold">Query Table</span>
            <span class="block text-xs text-muted-foreground">Playground</span>
          </RouterLink>
          <Button
            type="button"
            variant="outline"
            data-testid="doc-search-button"
            class="min-h-11 w-full justify-start gap-2 bg-background px-2 font-normal text-muted-foreground lg:min-h-8"
            @click="searchOpen = true"
          >
            <SearchIcon class="opacity-60" />
            <span class="flex-1 text-left">Search docs</span>
            <Kbd>{{ shortcut }}</Kbd>
          </Button>
        </SidebarHeader>
        <SidebarContent class="overflow-visible px-2 lg:min-h-0">
          <nav aria-label="Examples" class="min-h-0 lg:flex-1">
            <!-- shadcn-vue ScrollArea: sideways on a phone, down on a desktop. -->
            <ScrollArea class="w-full lg:h-full">
              <SidebarMenu
                class="w-max flex-row gap-1 pb-2 lg:w-full lg:flex-col lg:pb-0"
              >
                <SidebarMenuItem v-for="page in navigation" :key="page.id">
                  <RouterLink
                    v-slot="{ href, navigate, isActive }"
                    :to="`/${page.id}`"
                    custom
                  >
                    <SidebarMenuButton
                      as="a"
                      :href="href"
                      :is-active="isActive"
                      :aria-current="isActive ? 'page' : undefined"
                      class="min-h-11 whitespace-nowrap text-muted-foreground data-active:text-sidebar-accent-foreground lg:min-h-8"
                      @click="navigate"
                    >
                      {{ page.title }}
                    </SidebarMenuButton>
                  </RouterLink>
                </SidebarMenuItem>
              </SidebarMenu>
              <ScrollBar orientation="horizontal" class="lg:hidden" />
            </ScrollArea>
          </nav>
        </SidebarContent>
        <SidebarFooter class="p-4 pt-2 lg:pt-3">
          <ThemeToggle v-model="theme" />
        </SidebarFooter>
      </Sidebar>
    </aside>
    <main class="min-w-0 flex-1 p-4 lg:p-8">
      <!-- A new page instance per route: each page mounts its own example. -->
      <RouterView :key="$route.path" />
    </main>
  </SidebarProvider>
  <DocSearch v-model:open="searchOpen" />
</template>
