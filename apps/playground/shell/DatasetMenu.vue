<script setup lang="ts">
import { ChevronsUpDownIcon, DatabaseIcon } from '@lucide/vue'
import { computed } from 'vue'

import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/ui/dropdown-menu'

import { currentDataset, datasets, selectDataset } from '../scenarios/datasets'

// The demo data switch: a shadcn-vue dropdown menu with one radio item per
// dataset, named for what its rows are. Every example page and the home
// page table draw the one picked here; the choice is kept in the browser.
// Classes given by the shell go to the trigger button, not the menu root.
// The trigger and the items are 2.75rem touch targets; they take the compact
// shadcn height only on a wide screen with a fine pointer (a mouse), so a
// touch screen of any width keeps 2.75rem.
defineOptions({ inheritAttrs: false })
// `collapse`: only the icon below `lg`, where the top bar has no room for
// the name.
withDefaults(defineProps<{ align?: 'start' | 'end'; collapse?: boolean }>(), {
  align: 'end',
  collapse: false
})

const selected = computed(currentDataset)

const pick = (value: unknown) => {
  const dataset = datasets.find(entry => entry.id === value)
  if (dataset) {
    selectDataset(dataset.id)
  }
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        :aria-label="`Demo data: ${selected.name}`"
        data-testid="dataset-menu"
        class="min-h-11 gap-1.5 font-normal sm:pointer-fine:min-h-8"
        v-bind="$attrs"
      >
        <DatabaseIcon aria-hidden="true" class="text-muted-foreground" />
        <span
          class="flex-1 truncate text-left"
          :class="collapse && 'hidden lg:inline'"
          >{{ selected.name }}</span
        >
        <ChevronsUpDownIcon
          aria-hidden="true"
          class="opacity-50"
          :class="collapse && 'hidden lg:block'"
        />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :align="align" class="w-56">
      <DropdownMenuRadioGroup
        :model-value="selected.id"
        @update:model-value="pick"
      >
        <DropdownMenuRadioItem
          v-for="dataset in datasets"
          :key="dataset.id"
          :value="dataset.id"
          :data-dataset="dataset.id"
          class="min-h-11 sm:pointer-fine:min-h-0"
        >
          {{ dataset.name }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
