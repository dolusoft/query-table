<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue'

import { Button } from '@/ui/button'

import {
  commitDraft,
  conditionsFor,
  draftFrom,
  titleOf,
  typeOf,
  type FilterDraft
} from './column-filter'
import type { Column, TableQuery } from '../../src/contract'

// A bottom sheet that filters one column, for headers too narrow for a filter
// row. It is a native modal `<dialog>`: the browser keeps focus inside it,
// makes the page behind it inert and turns Escape into `cancel`. The sheet
// edits a local draft; only Apply (or Enter) writes `query.filters`, once.
const props = defineProps<{
  columns: Column[]
  /** Focused when the control that opened the sheet is gone on close. */
  fallbackFocus?: () => HTMLElement | null | undefined
}>()
const query = defineModel<TableQuery>('query', { required: true })

const dialog = ref<HTMLDialogElement | null>(null)
const input = ref<HTMLInputElement | HTMLSelectElement | null>(null)
const field = ref<string | null>(null)
const draft = ref<FilterDraft>({
  condition: 'Contains',
  text: '',
  summary: null
})
const error = ref('')
const keyboardInset = ref(0)
let trigger: HTMLElement | null = null

const id = useId()
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
  if (!target || !dialog.value) {
    return
  }
  trigger = from ?? (document.activeElement as HTMLElement | null)
  field.value = name
  draft.value = draftFrom(target, rulesOf(name))
  error.value = ''
  dialog.value.showModal()
  window.visualViewport?.addEventListener('resize', fitKeyboard)
  fitKeyboard()
  await nextTick()
  input.value?.focus()
}

const close = () => dialog.value?.close()

// Every way out ends here: put focus back on the control that opened the
// sheet, or on the fallback when that control is gone (a removed chip).
const onClose = () => {
  window.visualViewport?.removeEventListener('resize', fitKeyboard)
  keyboardInset.value = 0
  const target = trigger?.isConnected ? trigger : props.fallbackFocus?.()
  trigger = null
  field.value = null
  target?.focus()
}
onBeforeUnmount(() =>
  window.visualViewport?.removeEventListener('resize', fitKeyboard)
)

const write = (name: string, rules: TableQuery['filters']) => {
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
    input.value?.focus()
    return
  }
  if (result.kind === 'rules') {
    write(field.value, result.rules)
  }
  close()
}

const clear = () => {
  if (field.value && active.value) {
    write(field.value, [])
  }
  close()
}

// Enter applies, but not while an input method is composing a word.
const onEnter = (event: KeyboardEvent) => {
  if (event.isComposing || event.keyCode === 229) {
    return
  }
  event.preventDefault()
  apply()
}

// A click on the backdrop lands on the dialog element itself.
const onDialogClick = (event: MouseEvent) => {
  if (event.target === dialog.value) {
    close()
  }
}

const placeholder = computed(() =>
  type.value === 'string' ? 'Text to match' : ''
)

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    class="column-filter-sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 text-foreground backdrop:bg-black/50 sm:mx-auto sm:max-w-md"
    :style="{ marginBottom: `${keyboardInset}px` }"
    :aria-labelledby="`${id}-title`"
    data-testid="column-filter-sheet"
    @close="onClose"
    @click="onDialogClick"
  >
    <div
      v-if="column"
      class="flex max-h-[85dvh] flex-col rounded-t-xl border border-border bg-background shadow-lg"
    >
      <div class="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 :id="`${id}-title`" class="text-base font-semibold">
          Filter {{ titleOf(column) }}
        </h2>
        <button
          type="button"
          class="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
          aria-label="Close"
          @click="close"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div class="flex flex-col gap-3 overflow-y-auto px-4 py-3">
        <p
          v-if="draft.summary"
          class="rounded-lg bg-muted px-3 py-2 text-sm"
          data-testid="column-filter-summary"
        >
          Now: {{ draft.summary }}. A value below replaces it; leave it empty to
          keep it.
        </p>
        <label
          v-if="conditions.length > 1"
          class="flex flex-col gap-1 text-sm font-medium"
        >
          Condition
          <select
            v-model="draft.condition"
            class="h-11 rounded-lg border border-input bg-background px-2 text-base"
          >
            <option
              v-for="option in conditions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm font-medium">
          Value
          <select
            v-if="type === 'bool'"
            ref="input"
            v-model="draft.text"
            class="h-11 rounded-lg border border-input bg-background px-2 text-base"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="error ? `${id}-error` : undefined"
          >
            <option value="">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
          <input
            v-else
            ref="input"
            v-model="draft.text"
            :type="
              type === 'date'
                ? 'date'
                : type === 'datetime'
                  ? 'datetime-local'
                  : 'text'
            "
            :inputmode="
              type === 'number'
                ? 'decimal'
                : type === 'integer'
                  ? 'numeric'
                  : undefined
            "
            :placeholder="placeholder"
            enterkeyhint="done"
            autocomplete="off"
            class="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal aria-invalid:border-destructive"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="error ? `${id}-error` : `${id}-hint`"
            @keydown.enter="onEnter"
          />
        </label>
        <p
          v-if="error"
          :id="`${id}-error`"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ error }}
        </p>
        <p
          v-else-if="type === 'string'"
          :id="`${id}-hint`"
          class="text-xs text-muted-foreground"
        >
          Shortcuts in the value win over the condition:
          <code>ank*</code> starts with, <code>!ank</code> is not,
          <code>a,b</code> either one.
        </p>
      </div>
      <div
        class="flex flex-wrap justify-end gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
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
      </div>
    </div>
  </dialog>
</template>
