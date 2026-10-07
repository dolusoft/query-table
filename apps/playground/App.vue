<script setup lang="ts">
import { SearchIcon, SparklesIcon } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

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

import { aiNav, guidePages } from './guides/guides'
import { setTheme, themeFromUrl, type Theme } from './harness/theme'
import { repositoryUrl } from './home/home-content'
import { pages } from './manifest'
import DocSearch from './search/DocSearch.vue'
import DatasetMenu from './shell/DatasetMenu.vue'
import ExternalLinks from './shell/ExternalLinks.vue'
import SiteHeader from './shell/SiteHeader.vue'
import ThemeToggle from './shell/ThemeToggle.vue'

// The playground shell is shadcn-vue. The home page (`meta.landing`) has a
// top bar and the page below it. A documentation page sits next to a
// `Sidebar` (always expanded) with the search button, the page list and the
// theme switch: on a desktop a column on the left, below `lg` a bar above the
// page whose page list scrolls sideways.

// System follows the OS (`prefers-color-scheme`); light and dark set
// `data-theme` on <html>, which wins. `?theme=light|dark` picks one on load.
// The API examples first, then the guide pages (features, TanStack); the AI
// page and its two parts are a group of their own below them.
const navigation = [
  ...pages,
  ...guidePages.filter(page => !aiNav.some(entry => entry.id === page.id))
]

// The AI entries share a route; the hash tells them apart.
const route = useRoute()
const isAiActive = (to: string) => {
  const [path, hash = ''] = to.split('#')
  return route.path === path && route.hash.replace('#', '') === hash
}

const theme = ref<Theme | 'system'>(themeFromUrl() ?? 'system')
watch(theme, value => setTheme(value === 'system' ? null : value), {
  immediate: true
})

// Documentation search: Ctrl+K / ⌘K anywhere, `/` when not typing. The
// shortcut's Kbd takes the foreground color: the CLI's muted-foreground on
// bg-muted is 4.35:1 in the light theme, under WCAG 1.4.3's 4.5:1.
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
    <SiteHeader
      v-model:theme="theme"
      :shortcut="shortcut"
      @search="searchOpen = true"
    />
    <main class="flex-1">
      <RouterView />
    </main>
    <footer class="border-t">
      <div
        class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted-foreground sm:px-6"
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
        <ExternalLinks label="Elsewhere" />
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
            <Kbd class="text-foreground">{{ shortcut }}</Kbd>
          </Button>
          <DatasetMenu align="start" class="w-full bg-background" />
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
          <!-- The AI group stays outside the scrolling page list, so it is
               always on screen: a tinted block with a label and three
               entries. The AI page's own sections are the hash targets. -->
          <nav
            aria-label="AI"
            class="mt-1 mb-2 shrink-0 overflow-x-auto rounded-lg [scrollbar-width:none] border border-primary/25 bg-primary/5 p-1 lg:mb-0 lg:overflow-visible"
            data-testid="nav-ai"
          >
            <SidebarMenu
              class="w-max flex-row items-center gap-1 lg:w-full lg:flex-col lg:items-stretch"
            >
              <li
                role="presentation"
                class="flex items-center gap-1.5 px-2 text-xs font-semibold tracking-wide text-primary uppercase lg:py-1"
              >
                <SparklesIcon aria-hidden="true" class="size-3.5" />
                AI
              </li>
              <SidebarMenuItem v-for="entry in aiNav" :key="entry.id">
                <RouterLink v-slot="{ href, navigate }" :to="entry.to" custom>
                  <SidebarMenuButton
                    as="a"
                    :href="href"
                    :is-active="isAiActive(entry.to)"
                    :aria-current="isAiActive(entry.to) ? 'page' : undefined"
                    :data-testid="`nav-${entry.id}`"
                    class="min-h-11 whitespace-nowrap text-foreground data-active:text-sidebar-accent-foreground lg:min-h-8"
                    @click="navigate"
                  >
                    {{ entry.title }}
                  </SidebarMenuButton>
                </RouterLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter class="p-4 pt-2 lg:pt-3">
          <ExternalLinks label="Elsewhere" class="-ml-2.5" />
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
