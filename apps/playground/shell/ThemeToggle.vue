<script setup lang="ts">
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'

import type { Theme } from '../harness/theme'

// System, Light, Dark. The shell holds the value, so it outlives a switch
// between the home layout and the documentation layout.
const theme = defineModel<Theme | 'system'>({ required: true })

const themes = ['system', 'light', 'dark'] as const
// A single toggle group can be emptied by pressing the active item; the
// theme always has a value.
const pick = (value: unknown) => {
  if (themes.includes(value as (typeof themes)[number])) {
    theme.value = value as (typeof themes)[number]
  }
}
</script>

<template>
  <ToggleGroup
    type="single"
    variant="outline"
    size="sm"
    aria-label="Theme"
    :model-value="theme"
    @update:model-value="pick"
  >
    <!-- Each item is a toggle button (`aria-pressed`); the group has a name.
         The pressed item takes the foreground color: in the home footer the
         group inherits muted text, which is 4.35:1 on the pressed bg-muted. -->
    <ToggleGroupItem
      v-for="option in themes"
      :key="option"
      :value="option"
      class="min-h-11 px-3 capitalize data-[state=on]:text-foreground lg:min-h-0"
    >
      {{ option }}
    </ToggleGroupItem>
  </ToggleGroup>
</template>
