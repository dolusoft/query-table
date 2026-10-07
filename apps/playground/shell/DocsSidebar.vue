<script setup lang="ts">
import { SparklesIcon } from '@lucide/vue'
import { useRoute } from 'vue-router'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/ui/sidebar'

import { navigation } from './docs-nav'
import { aiNav } from '../guides/guides'

// The documentation sidebar, after the shadcn-vue docs: an offcanvas
// shadcn-vue `Sidebar` below the 4rem site header with two groups, the pages
// and AI. Below `md` the same Sidebar is a Sheet that the header's menu
// button opens; following a link closes it.
const route = useRoute()
const { setOpenMobile } = useSidebar()

// The AI entries share a route; the hash tells them apart.
const isAiActive = (to: string) => {
  const [path, hash = ''] = to.split('#')
  return route.path === path && route.hash.replace('#', '') === hash
}

const follow = (
  navigate: (event?: MouseEvent) => unknown,
  event: MouseEvent
) => {
  setOpenMobile(false)
  navigate(event)
}

const link =
  'min-h-11 text-[0.8rem] font-medium lg:min-h-0 lg:h-[30px] data-active:text-sidebar-accent-foreground'
</script>

<template>
  <Sidebar
    collapsible="offcanvas"
    class="top-16 h-[calc(100svh-4rem)]! border-r-0! *:data-[slot=sidebar-inner]:bg-background"
  >
    <SidebarContent class="pt-4">
      <SidebarGroup>
        <SidebarGroupLabel class="text-muted-foreground"
          >Pages</SidebarGroupLabel
        >
        <SidebarGroupContent>
          <nav aria-label="Examples">
            <SidebarMenu class="gap-0.5">
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
                    :class="link"
                    @click="follow(navigate, $event)"
                  >
                    {{ page.title }}
                  </SidebarMenuButton>
                </RouterLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel
          class="gap-1.5 text-primary dark:text-sidebar-primary"
        >
          <SparklesIcon aria-hidden="true" />
          AI
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <!-- The AI page's own sections are the hash targets. -->
          <nav aria-label="AI" data-testid="nav-ai">
            <SidebarMenu class="gap-0.5">
              <SidebarMenuItem v-for="entry in aiNav" :key="entry.id">
                <RouterLink v-slot="{ href, navigate }" :to="entry.to" custom>
                  <SidebarMenuButton
                    as="a"
                    :href="href"
                    :is-active="isAiActive(entry.to)"
                    :aria-current="isAiActive(entry.to) ? 'page' : undefined"
                    :data-testid="`nav-${entry.id}`"
                    :class="link"
                    @click="follow(navigate, $event)"
                  >
                    {{ entry.title }}
                  </SidebarMenuButton>
                </RouterLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>
