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
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'

import { setTheme, themeFromUrl, type Theme } from './harness/theme'
import { pages } from './manifest'
import DocSearch from './search/DocSearch.vue'

// The playground shell is shadcn-vue: a `Sidebar` (always expanded) with the
// search button, the page list and the theme switch. On a desktop it is a
// column on the left; below `lg` it is a bar above the page whose page list
// scrolls sideways.

// System follows the OS (`prefers-color-scheme`); light and dark set
// `data-theme` on <html>, which wins. `?theme=light|dark` picks one on load.
const theme = ref<Theme | 'system'>(themeFromUrl() ?? 'system')
watch(theme, value => setTheme(value === 'system' ? null : value), {
  immediate: true
})
const themes = ['system', 'light', 'dark'] as const
// A single toggle group can be emptied by pressing the active item; the
// theme always has a value.
const pickTheme = (value: unknown) => {
  if (themes.includes(value as (typeof themes)[number])) {
    theme.value = value as (typeof themes)[number]
  }
}

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
  <SidebarProvider class="flex-col lg:flex-row">
    <aside
      class="min-w-0 shrink-0 border-b lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0"
    >
      <Sidebar collapsible="none" class="h-full w-full lg:w-(--sidebar-width)">
        <SidebarHeader class="gap-3 p-4 pb-2 lg:pb-3">
          <div>
            <p class="text-sm font-semibold">Query Table</p>
            <p class="text-xs text-muted-foreground">Playground</p>
          </div>
          <Button
            type="button"
            variant="outline"
            data-testid="doc-search-button"
            class="min-h-10 w-full justify-start gap-2 bg-background px-2 font-normal text-muted-foreground lg:min-h-8"
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
                <SidebarMenuItem v-for="page in pages" :key="page.id">
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
                      class="min-h-10 whitespace-nowrap text-muted-foreground data-active:text-sidebar-accent-foreground lg:min-h-8"
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
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            role="radiogroup"
            aria-label="Theme"
            :model-value="theme"
            @update:model-value="pickTheme"
          >
            <!-- A single-choice toggle group is announced as radios. -->
            <ToggleGroupItem
              v-for="option in themes"
              :key="option"
              :value="option"
              role="radio"
              :aria-checked="theme === option"
              class="min-h-10 px-3 capitalize lg:min-h-0"
            >
              {{ option }}
            </ToggleGroupItem>
          </ToggleGroup>
        </SidebarFooter>
      </Sidebar>
    </aside>
    <main class="min-w-0 flex-1 p-4 lg:p-8">
      <!-- A new page instance per route: each page mounts its own example. -->
      <RouterView :key="$route.path" />
    </main>
    <DocSearch v-model:open="searchOpen" />
  </SidebarProvider>
</template>
