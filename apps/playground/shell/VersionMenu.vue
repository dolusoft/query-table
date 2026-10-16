<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue'

import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/ui/dropdown-menu'

import { version } from '../../../packages/vue/package.json'
import { channelHref, playgroundChannel } from '../channel'

const options = [
  { value: 'release', label: '3.x (release)' },
  { value: 'next', label: 'next' }
] as const

const label = playgroundChannel === 'next' ? 'next' : version

const pick = (value: unknown) => {
  const option = options.find(entry => entry.value === value)
  if (option) {
    window.location.assign(
      channelHref(
        import.meta.env.BASE_URL,
        playgroundChannel,
        option.value,
        window.location.hash,
        window.location.search
      )
    )
  }
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        :aria-label="`Version: ${label}`"
        class="min-h-11 shrink-0 gap-1 px-2 sm:pointer-fine:min-h-8"
      >
        {{ label }}
        <ChevronDownIcon aria-hidden="true" class="size-3" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-40">
      <DropdownMenuRadioGroup
        :model-value="playgroundChannel"
        @update:model-value="pick"
      >
        <DropdownMenuRadioItem
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          class="min-h-11 sm:pointer-fine:min-h-0"
        >
          {{ option.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
