<script setup lang="ts">
import { MonitorIcon, MoonIcon, SunIcon } from '@lucide/vue'

import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/ui/dropdown-menu'

import type { Theme } from '../harness/theme'

// The theme switch of the site header: a shadcn-vue dropdown menu with
// light, dark and system. The shell holds the value.
const theme = defineModel<Theme | 'system'>({ required: true })

const options = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon }
] as const

const pick = (value: unknown) => {
  const option = options.find(entry => entry.value === value)
  if (option) {
    theme.value = option.value
  }
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Theme"
        class="size-11 sm:pointer-fine:size-8"
      >
        <SunIcon class="dark:hidden" />
        <MoonIcon class="hidden dark:block" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-36">
      <DropdownMenuRadioGroup :model-value="theme" @update:model-value="pick">
        <DropdownMenuRadioItem
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          class="min-h-11 sm:pointer-fine:min-h-0"
        >
          <component :is="option.icon" aria-hidden="true" />
          {{ option.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
