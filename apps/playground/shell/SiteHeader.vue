<script setup lang="ts">
import { MenuIcon, SearchIcon, Table2Icon } from '@lucide/vue'
import { ref } from 'vue'

import { Button } from '@/ui/button'
import { Kbd } from '@/ui/kbd'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle
} from '@/ui/navigation-menu'
import { Separator } from '@/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/ui/sheet'

import BrandIcon from './BrandIcon.vue'
import DatasetMenu from './DatasetMenu.vue'
import ThemeMenu from './ThemeMenu.vue'
import type { Theme } from '../harness/theme'
import { repositoryUrl } from '../home/home-content'

// The home page's top bar, after the shadcn-vue site header: the name and a
// NavigationMenu on the left; search, GitHub and the theme menu on the
// right. Below `md` the links move into a Sheet behind a menu button. The
// documentation pages pass a menu button of their own (`#menu`, the
// sidebar's) and `wide`: their header spans the window, as on the
// shadcn-vue docs.
const theme = defineModel<Theme | 'system'>('theme', { required: true })
defineProps<{ shortcut: string; wide?: boolean }>()
const emit = defineEmits<{ search: [] }>()

const links = [
  { to: '/overview', label: 'Docs' },
  { to: '/features', label: 'Features' },
  { to: '/tanstack', label: 'TanStack' },
  { to: '/ai', label: 'AI' }
]

const menuOpen = ref(false)
</script>

<template>
  <header
    class="sticky top-0 z-20 w-full bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
  >
    <div
      class="mx-auto flex h-16 w-full items-center gap-2 px-4 sm:px-6"
      :class="wide ? '' : 'max-w-6xl'"
    >
      <slot name="menu" />
      <Sheet v-if="!$slots.menu" v-model:open="menuOpen">
        <SheetTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menu"
            class="-ml-2 size-11 md:hidden"
          >
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" class="w-72">
          <SheetHeader>
            <SheetTitle>Query Table</SheetTitle>
            <SheetDescription class="sr-only">Site links</SheetDescription>
          </SheetHeader>
          <nav aria-label="Site" class="flex flex-col gap-1 px-2">
            <Button
              v-for="link in links"
              :key="link.to"
              as-child
              variant="ghost"
              class="min-h-11 justify-start text-base"
            >
              <RouterLink :to="link.to" @click="menuOpen = false">
                {{ link.label }}
              </RouterLink>
            </Button>
          </nav>
          <!-- The demo data switch of the top bar, here on a phone. -->
          <div class="px-4">
            <DatasetMenu align="start" class="w-full" />
          </div>
        </SheetContent>
      </Sheet>
      <RouterLink
        to="/"
        class="flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0 md:mr-2"
      >
        <Table2Icon aria-hidden="true" class="size-4" />
        Query Table
      </RouterLink>
      <NavigationMenu
        :viewport="false"
        aria-label="Site"
        class="hidden md:flex"
      >
        <NavigationMenuList>
          <NavigationMenuItem v-for="link in links" :key="link.to">
            <RouterLink
              v-slot="{ href, navigate, isActive }"
              :to="link.to"
              custom
            >
              <NavigationMenuLink
                :href="href"
                :active="isActive"
                :class="navigationMenuTriggerStyle({ class: 'h-8' })"
                @click="navigate"
              >
                {{ link.label }}
              </NavigationMenuLink>
            </RouterLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
      <div class="ml-auto flex items-center gap-1">
        <DatasetMenu collapse class="hidden sm:inline-flex" />
        <Button
          type="button"
          variant="secondary"
          data-testid="doc-search-button"
          class="min-h-11 min-w-11 gap-2 font-normal text-muted-foreground sm:min-h-8 sm:w-56 sm:justify-start sm:pr-1 lg:w-64"
          @click="emit('search')"
        >
          <SearchIcon class="sm:hidden" />
          <span class="sr-only sm:not-sr-only sm:flex-1 sm:text-left"
            >Search docs…</span
          >
          <Kbd class="hidden bg-background text-foreground sm:inline-flex">{{
            shortcut
          }}</Kbd>
        </Button>
        <Separator
          orientation="vertical"
          class="mx-1 hidden h-4! self-center! sm:block"
        />
        <Button as-child variant="ghost" size="icon" class="size-11 sm:size-8">
          <a
            :href="repositoryUrl"
            target="_blank"
            rel="noopener"
            aria-label="GitHub (opens in a new tab)"
          >
            <BrandIcon name="github" />
          </a>
        </Button>
        <ThemeMenu v-model="theme" />
      </div>
    </div>
  </header>
</template>
