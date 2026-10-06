<script setup lang="ts">
import { XIcon } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue'

import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import { ScrollArea } from '@/ui/scroll-area'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/ui/sheet'

import {
  commitDraft,
  conditionsFor,
  draftFrom,
  isComposing,
  same,
  titleOf,
  typeOf,
  type FilterDraft
} from './column-filter'
import type { Column, TableQuery } from '../../src/contract'

// A bottom sheet that filters one column, for headers too narrow for a filter
// row: shadcn-vue `Sheet` (reka-ui `Dialog`). The dialog keeps focus inside
// it, hides the page behind it from assistive technology and closes on Escape
// or a click on the overlay. The sheet edits a local draft; only Apply (or
// Enter) writes `query.filters`, once.
const props = defineProps<{
  columns: Column[]
  /** Focused when the control that opened the sheet is gone on close. */
  fallbackFocus?: () => HTMLElement | null | undefined
}>()
const query = defineModel<TableQuery>('query', { required: true })

const isOpen = ref(false)
const valueId = useId()
const conditionId = useId()
const errorId = useId()
const hintId = useId()
const field = ref<string | null>(null)
const draft = ref<FilterDraft>({
  condition: 'Contains',
  text: '',
  summary: null
})
const error = ref('')
const keyboardInset = ref(0)
let trigger: HTMLElement | null = null

const column = computed(() =>
  props.columns.find(candidate => candidate.field === field.value)
)
const type = computed(() => (column.value ? typeOf(column.value) : 'string'))
const conditions = computed(() =>
  column.value ? conditionsFor(column.value) : []
)
const rulesOf = (name: string) =>
  query.value.filters.filter(rule => rule.field === name)
const active = computed(() => !!field.value && rulesOf(field.value).length > 0)
const inputType = computed(() => {
  if (type.value === 'date') {
    return 'date'
  }
  if (type.value === 'datetime') {
    return 'datetime-local'
  }
  return 'text'
})
const inputMode = computed(() => {
  if (type.value === 'number') {
    return 'decimal'
  }
  if (type.value === 'integer') {
    return 'numeric'
  }
  return undefined
})

// The value control: the native select of a boolean column, or the input.
const valueControl = () => document.getElementById(valueId)

// Keep the actions above an on-screen keyboard: the visual viewport shrinks
// while the sheet is pinned to the bottom of the layout viewport.
const fitKeyboard = () => {
  const viewport = window.visualViewport
  keyboardInset.value = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0
}

const open = async (name: string, from?: HTMLElement | null) => {
  const target = props.columns.find(candidate => candidate.field === name)
  if (!target) {
    return
  }
  trigger = from ?? (document.activeElement as HTMLElement | null)
  field.value = name
  draft.value = draftFrom(target, rulesOf(name))
  error.value = ''
  isOpen.value = true
  window.visualViewport?.addEventListener('resize', fitKeyboard)
  fitKeyboard()
  await nextTick()
  valueControl()?.focus()
}

// Every way out ends here: put focus back on the control that opened the
// sheet, or on the fallback when that control is gone (a removed chip). The
// dialog stops trapping focus as soon as it is closed, so focus moves on the
// next tick instead of after the closing animation.
const setOpen = async (value: boolean) => {
  isOpen.value = value
  if (value) {
    return
  }
  window.visualViewport?.removeEventListener('resize', fitKeyboard)
  keyboardInset.value = 0
  const target = trigger?.isConnected ? trigger : props.fallbackFocus?.()
  trigger = null
  await nextTick()
  target?.focus()
}
const close = () => setOpen(false)
onBeforeUnmount(() =>
  window.visualViewport?.removeEventListener('resize', fitKeyboard)
)

// Unchanged rules write nothing: a write is a request to the server, resets
// the page and moves the column's rules to the end of `query.filters`.
const write = (name: string, rules: TableQuery['filters']) => {
  if (same(rulesOf(name), rules)) {
    return
  }
  query.value = {
    ...query.value,
    page: 1,
    filters: [
      ...query.value.filters.filter(rule => rule.field !== name),
      ...rules
    ]
  }
}

const apply = () => {
  if (!column.value || !field.value) {
    return
  }
  const result = commitDraft(column.value, draft.value)
  if (result.kind === 'error') {
    error.value = result.message
    valueControl()?.focus()
    return
  }
  if (result.kind === 'rules') {
    write(field.value, result.rules)
  }
  void close()
}

const clear = () => {
  if (field.value && active.value) {
    write(field.value, [])
  }
  void close()
}

// Enter applies, but not while an input method is composing a word.
const onEnter = (event: KeyboardEvent) => {
  if (isComposing(event)) {
    return
  }
  event.preventDefault()
  apply()
}

// Only an element that is rendered: the hint shows for a text column alone.
const describedBy = computed(() => {
  if (error.value) {
    return errorId
  }
  return type.value === 'string' ? hintId : undefined
})

const placeholder = computed(() =>
  type.value === 'string' ? 'Text to match' : ''
)

defineExpose({ open })
</script>

<template>
  <Sheet :open="isOpen" @update:open="setOpen">
    <SheetContent
      v-if="column"
      side="bottom"
      :show-close-button="false"
      :aria-describedby="undefined"
      class="max-h-[85dvh] gap-0 rounded-t-xl bg-background sm:mx-auto sm:max-w-md sm:border-x"
      :style="{ bottom: `${keyboardInset}px` }"
      data-testid="column-filter-sheet"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
    >
      <SheetHeader
        class="flex-row items-center justify-between gap-2 px-4 pt-3 pb-0"
      >
        <SheetTitle class="text-base font-semibold">
          Filter {{ titleOf(column) }}
        </SheetTitle>
        <SheetClose as-child>
          <Button
            variant="ghost"
            size="icon"
            class="size-11"
            aria-label="Close"
          >
            <XIcon />
          </Button>
        </SheetClose>
      </SheetHeader>
      <ScrollArea class="min-h-0 flex-1">
        <div class="flex flex-col gap-3 px-4 py-3">
          <p
            v-if="draft.summary"
            class="rounded-lg bg-muted px-3 py-2 text-sm"
            data-testid="column-filter-summary"
          >
            Now: {{ draft.summary }}. A value below replaces it; leave it empty
            to keep it.
          </p>
          <div v-if="conditions.length > 1" class="flex flex-col gap-2">
            <Label :for="conditionId">Condition</Label>
            <NativeSelect
              :id="conditionId"
              v-model="draft.condition"
              class="w-full [&_select]:h-11 [&_select]:bg-background [&_select]:text-base"
            >
              <NativeSelectOption
                v-for="option in conditions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div class="flex flex-col gap-2">
            <Label :for="valueId">Value</Label>
            <NativeSelect
              v-if="type === 'bool'"
              :id="valueId"
              v-model="draft.text"
              class="w-full [&_select]:h-11 [&_select]:bg-background [&_select]:text-base"
              :aria-invalid="error ? 'true' : undefined"
              :aria-describedby="error ? errorId : undefined"
              @keydown.enter="onEnter"
            >
              <NativeSelectOption value="">Any</NativeSelectOption>
              <NativeSelectOption value="true">Yes</NativeSelectOption>
              <NativeSelectOption value="false">No</NativeSelectOption>
            </NativeSelect>
            <Input
              v-else
              :id="valueId"
              v-model="draft.text"
              :type="inputType"
              :inputmode="inputMode"
              :placeholder="placeholder"
              enterkeyhint="done"
              autocomplete="off"
              class="h-11 text-base md:text-base"
              :aria-invalid="error ? 'true' : undefined"
              :aria-describedby="describedBy"
              @keydown.enter="onEnter"
            />
          </div>
          <p
            v-if="error"
            :id="errorId"
            role="alert"
            class="text-sm text-destructive"
          >
            {{ error }}
          </p>
          <p
            v-else-if="type === 'string'"
            :id="hintId"
            class="text-xs text-muted-foreground"
          >
            Shortcuts in the value win over the condition:
            <code>ank*</code> starts with, <code>!ank</code> is not,
            <code>a,b</code> either one.
          </p>
        </div>
      </ScrollArea>
      <SheetFooter
        class="flex-row flex-wrap justify-end gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <Button
          v-if="active"
          type="button"
          variant="ghost"
          class="mr-auto h-11 text-destructive"
          @click="clear"
        >
          Clear filter
        </Button>
        <Button type="button" variant="outline" class="h-11" @click="close">
          Close
        </Button>
        <Button type="button" class="h-11 px-5" @click="apply">Apply</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
