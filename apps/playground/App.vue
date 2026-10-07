<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { ref, useTemplateRef, watch } from 'vue'

import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/ui/sidebar'

import { setTheme, themeFromUrl, type Theme } from './harness/theme'
import { repositoryUrl } from './home/home-content'
import DocSearch from './search/DocSearch.vue'
import DocPager from './shell/DocPager.vue'
import DocsSidebar from './shell/DocsSidebar.vue'
import DocToc from './shell/DocToc.vue'
import ExternalLinks from './shell/ExternalLinks.vue'
import SiteHeader from './shell/SiteHeader.vue'

// The playground shell is shadcn-vue. Every page has the site header. The
// home page (`meta.landing`) has the page below it. A documentation page
// follows the shadcn-vue docs: the sidebar on the left (a Sheet behind the
// header's menu button below `md`), the page in a 40rem reading column, and
// "On This Page" on the right from `xl`.

// System follows the OS (`prefers-color-scheme`); light and dark set
// `data-theme` on <html>, which wins. `?theme=light|dark` picks one on load.
const theme = ref<Theme | 'system'>(themeFromUrl() ?? 'system')
watch(theme, value => setTheme(value === 'system' ? null : value), {
  immediate: true
})

const column = useTemplateRef<HTMLElement>('column')

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
  <SidebarProvider v-else class="flex-col bg-background">
    <SiteHeader
      v-model:theme="theme"
      wide
      :shortcut="shortcut"
      @search="searchOpen = true"
    >
      <template #menu>
        <SidebarTrigger class="-ml-2 size-11 min-[769px]:hidden" />
      </template>
    </SiteHeader>
    <div class="flex flex-1">
      <DocsSidebar />
      <SidebarInset class="min-w-0 flex-row">
        <div ref="column" class="flex min-w-0 flex-1 flex-col">
          <!-- Text keeps the 40rem measure of the shadcn-vue docs; a part
               marked `data-wide` (an example's preview) takes the whole
               column, or a table example drops to its phone layout. -->
          <div
            class="flex w-full min-w-0 flex-1 flex-col px-4 py-6 text-[1.05rem] leading-relaxed sm:text-[15px] md:px-6 lg:py-8 [&_article>*]:mx-auto [&_article>*]:w-full [&_article>*:not([data-wide])]:max-w-160"
          >
            <!-- A new page instance per route: each page mounts its own example. -->
            <RouterView :key="$route.path" />
            <DocPager />
          </div>
        </div>
        <aside
          class="sticky top-16 hidden h-[calc(100svh-4rem)] w-56 shrink-0 flex-col overflow-y-auto pt-8 xl:flex"
        >
          <DocToc :root="column" />
        </aside>
      </SidebarInset>
    </div>
  </SidebarProvider>
  <DocSearch v-model:open="searchOpen" />
</template>
