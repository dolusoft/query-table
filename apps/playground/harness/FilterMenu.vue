<script setup lang="ts">
import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  EyeOffIcon,
  FunnelIcon
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Separator } from '@/ui/separator'
import type { FilterMenuSlotProps } from '@dolusoft/query-table'

import { titleOf } from './column-filter'

// What a consumer writes in the `filter-menu` slot: the table's own trigger
// wrapped in a real shadcn-vue Popover, with the condition list, the sort
// buttons and "Clear filter" inside. The menu's own texts are the consumer's
// (the table only names the conditions, through `labels.filterCondition`), so
// a localised page passes `texts`.
//
// With `controls` the slot also draws the column's layout actions (pin, move,
// hide) on a row of their own under the filter.
//
// A narrow header never wraps (playground.css draws the states): the header
// is narrow when its filter row is narrower than the controls row needs, a
// width measured from the row itself, or, without controls, when the skin
// drops the filter input (`@container qt-filter (width < 4rem)`). Then the
// controls fold into one "⋯" menu and the input into a funnel button that
// opens the table's own filter input in a panel under the header. The input
// stays the table's, so typing in the panel gives the same `update:query`.
interface MenuTexts {
  heading: string
  sortAscending: string
  sortDescending: string
  clearFilter: string
}
const props = defineProps<{
  menu: FilterMenuSlotProps
  texts?: Partial<MenuTexts>
  controls?: boolean
}>()
const open = ref(false)

const text = (key: keyof MenuTexts) =>
  props.texts?.[key] ??
  {
    heading: 'Filter Condition',
    sortAscending: 'Sort Ascending',
    sortDescending: 'Sort Descending',
    clearFilter: 'Clear filter'
  }[key]

const pick = (run: () => void) => {
  run()
  open.value = false
}

const title = computed(() => titleOf(props.menu.column))
const active = computed(() => props.menu.rules.length > 0)
const control = computed(() => props.menu.control)

const pinLeftName = computed(() =>
  control.value.pinned === 'left' ? 'Unpin' : 'Pin left'
)
const pinRightName = computed(() =>
  control.value.pinned === 'right' ? 'Unpin' : 'Pin right'
)
const pinLeft = () =>
  control.value.pin(control.value.pinned === 'left' ? false : 'left')
const pinRight = () =>
  control.value.pin(control.value.pinned === 'right' ? false : 'right')

// Narrow state, from the width of the filter row (`.qt-filter`, a size
// container, so its width never depends on what it holds) against the width
// the controls row needs on one line (`w-max`, measured even while hidden).
const tools = ref<HTMLElement | null>(null)
const row = ref<HTMLElement | null>(null)
const narrow = ref(false)
const panelOpen = ref(false)
const toggle = ref<{ $el: HTMLElement } | null>(null)

const filterRow = () => tools.value?.parentElement ?? null
const measure = () => {
  const box = filterRow()
  if (!props.controls || !box || !row.value) {
    return
  }
  narrow.value = box.clientWidth < row.value.offsetWidth
}

let observer: ResizeObserver | null = null
onMounted(() => {
  const box = filterRow()
  if (props.controls && box) {
    observer = new ResizeObserver(measure)
    observer.observe(box)
    measure()
  }
})

// The panel is `position: fixed`, so the table's scroll box cannot clip it
// (a filter that leaves no rows leaves no room under the header). Its place
// is set once on open, as custom properties on the filter row; a scroll or a
// resize closes it instead of chasing the header. It opens under the header
// cell toward the table's end, or toward its start when the viewport has no
// room for it there.
const place = (box: HTMLElement) => {
  const rect = box.getBoundingClientRect()
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  const width =
    parseFloat(getComputedStyle(box).getPropertyValue('--filter-panel-width')) *
    rem
  const right = document.documentElement.clientWidth - 0.5 * rem
  const x =
    rect.left + width <= right ? rect.left : Math.max(0, rect.right - width)
  box.style.setProperty('--filter-panel-x', `${Math.round(x)}px`)
  box.style.setProperty(
    '--filter-panel-y',
    `${Math.round((box.closest('th') ?? box).getBoundingClientRect().bottom + 0.25 * rem)}px`
  )
}
const unplace = (box: HTMLElement | null) => {
  box?.style.removeProperty('--filter-panel-x')
  box?.style.removeProperty('--filter-panel-y')
  if (box?.getAttribute('style') === '') {
    box.removeAttribute('style')
  }
}

const inside = (target: EventTarget | null) =>
  target instanceof Node &&
  (filterRow()?.contains(target) ||
    (target instanceof Element &&
      target.closest('[data-reka-popper-content-wrapper]') !== null))

const outside = (event: Event) => {
  if (!inside(event.target)) {
    close(false)
  }
}
const moved = () => close(false)

const listen = (on: boolean) => {
  const method = on ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', outside, true)
  document[method]('scroll', outside, true)
  window[method]('resize', moved)
}

const close = (refocus: boolean) => {
  if (!panelOpen.value) {
    return
  }
  panelOpen.value = false
  listen(false)
  unplace(filterRow())
  if (refocus) {
    toggle.value?.$el.focus()
  }
}

const togglePanel = async () => {
  if (panelOpen.value) {
    close(true)
    return
  }
  const box = filterRow()
  if (!box) {
    return
  }
  place(box)
  panelOpen.value = true
  listen(true)
  await nextTick()
  // The first control the panel shows: the input, or a page's date picker.
  box
    .querySelector<HTMLElement>(
      ':scope > :is(input, select, button):not(.qt-filter-button)'
    )
    ?.focus()
}

// Escape in the panel closes it and gives the focus back to the funnel. An
// Escape inside the condition menu closes only that menu: reka stops it there.
const onKeydown = (event: KeyboardEvent) => {
  if (panelOpen.value && event.key === 'Escape') {
    close(true)
  }
}
onMounted(() => filterRow()?.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  observer?.disconnect()
  filterRow()?.removeEventListener('keydown', onKeydown)
  close(false)
})
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <component :is="props.menu.trigger" />
    </PopoverTrigger>
    <PopoverContent align="start" class="w-56">
      <p class="text-xs font-medium text-muted-foreground">
        {{ text('heading') }}
      </p>
      <Button
        v-for="option in props.menu.conditions"
        :key="option.value"
        variant="ghost"
        size="sm"
        class="justify-start data-active:bg-muted data-active:text-foreground"
        :data-active="props.menu.condition === option.value ? '' : undefined"
        @click="pick(() => props.menu.setCondition(option.value))"
      >
        {{ option.label }}
      </Button>
      <template v-if="props.menu.sortable">
        <Separator />
        <Button
          variant="ghost"
          size="sm"
          class="justify-start"
          @click="pick(() => props.menu.setSort('asc'))"
        >
          {{ text('sortAscending') }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="justify-start"
          @click="pick(() => props.menu.setSort('desc'))"
        >
          {{ text('sortDescending') }}
        </Button>
      </template>
      <Separator />
      <Button
        variant="ghost"
        size="sm"
        class="justify-start text-destructive"
        @click="pick(() => props.menu.clear())"
      >
        {{ text('clearFilter') }}
      </Button>
    </PopoverContent>
  </Popover>
  <!-- The narrow header's buttons, hidden (`hidden`, a utility) unless the
       page's playground.css shows them; without it the filter row is the
       table's alone, as the test skin's own measurements expect. -->
  <span
    ref="tools"
    class="hidden"
    data-header-tools
    :data-narrow="narrow ? '' : undefined"
    :data-filter-open="panelOpen ? '' : undefined"
  >
    <Button
      ref="toggle"
      type="button"
      variant="ghost"
      size="icon-xs"
      data-filter-toggle
      class="text-muted-foreground data-active:text-primary dark:data-active:text-sidebar-primary"
      :data-active="active ? '' : undefined"
      :aria-label="`Filter ${title}${active ? ', active' : ''}`"
      :aria-expanded="panelOpen"
      @click="togglePanel"
    >
      <FunnelIcon :fill="active ? 'currentColor' : 'none'" />
    </Button>
    <DropdownMenu v-if="props.controls">
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-controls-menu
          :aria-label="`Column actions for ${title}`"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-40">
        <DropdownMenuItem @select="pinLeft">
          <ArrowLeftToLineIcon />{{ pinLeftName }}
        </DropdownMenuItem>
        <DropdownMenuItem @select="pinRight">
          <ArrowRightToLineIcon />{{ pinRightName }}
        </DropdownMenuItem>
        <DropdownMenuItem
          :disabled="!control.canMoveLeft"
          @select="control.move('left')"
        >
          <ChevronLeftIcon />Move left
        </DropdownMenuItem>
        <DropdownMenuItem
          :disabled="!control.canMoveRight"
          @select="control.move('right')"
        >
          <ChevronRightIcon />Move right
        </DropdownMenuItem>
        <DropdownMenuItem @select="control.hide()">
          <EyeOffIcon />Hide
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </span>
  <!-- The column controls take a row of their own under the filter. The
       inner box keeps its one-line width, which sets the narrow state. -->
  <div v-if="props.controls" class="basis-full" data-header-controls>
    <span ref="row" class="flex w-max flex-nowrap gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        :aria-label="pinLeftName"
        :title="pinLeftName"
        :data-active="control.pinned === 'left' ? '' : undefined"
        class="data-active:bg-muted"
        @click="pinLeft"
      >
        <ArrowLeftToLineIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        :aria-label="pinRightName"
        :title="pinRightName"
        :data-active="control.pinned === 'right' ? '' : undefined"
        class="data-active:bg-muted"
        @click="pinRight"
      >
        <ArrowRightToLineIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Move left"
        title="Move left"
        :disabled="!control.canMoveLeft"
        @click="control.move('left')"
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Move right"
        title="Move right"
        :disabled="!control.canMoveRight"
        @click="control.move('right')"
      >
        <ChevronRightIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Hide"
        title="Hide"
        @click="control.hide()"
      >
        <EyeOffIcon />
      </Button>
    </span>
  </div>
  <!-- The panel's box; the table's input and condition button are laid over
       it while it is open. -->
  <span class="hidden" data-filter-panel aria-hidden="true" />
</template>
