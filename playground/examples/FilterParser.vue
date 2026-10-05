<script setup lang="ts">
import { computed, ref } from 'vue'

import { Input } from '@/ui/input'

import type { ColumnType, FilterCondition } from '../../src/contract'
import { parseFilterInput } from '../../src/index'

// `parseFilterInput` is the table's own filter grammar as a plain function:
// it returns the rules the table would emit for the text typed into a
// column's filter, with the same coercion per column type. Use it to build
// a query from a search box, a saved string or a URL, without a table.
const types: ColumnType[] = [
  'string',
  'integer',
  'number',
  'date',
  'datetime',
  'bool'
]
const conditions: FilterCondition[] = [
  'Contains',
  'NotContains',
  'Equal',
  'NotEqual',
  'StartsWith',
  'EndsWith',
  'GreaterThan',
  'GreaterThanOrEqual',
  'LessThan',
  'LessThanOrEqual'
]
const examples = ['*ank*', 'ist*,!*mir', '!bursa', '42', 'abc', 'true', '*']

const type = ref<ColumnType>('string')
const condition = ref<FilterCondition | ''>('')
const text = ref('*ank*,izmir')

const rules = computed(() =>
  parseFilterInput(
    text.value,
    { field: 'city', title: 'City', type: type.value },
    condition.value || null
  )
)
</script>

<template>
  <div class="flex flex-col gap-3 text-sm">
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        Column type
        <select
          v-model="type"
          class="h-8 rounded-lg border border-input bg-background px-2"
        >
          <option v-for="name in types" :key="name" :value="name">
            {{ name }}
          </option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        Menu condition
        <select
          v-model="condition"
          class="h-8 rounded-lg border border-input bg-background px-2"
        >
          <option value="">type default</option>
          <option v-for="name in conditions" :key="name" :value="name">
            {{ name }}
          </option>
        </select>
      </label>
      <label class="flex min-w-64 flex-1 flex-col gap-1">
        Typed text
        <Input v-model="text" class="font-mono" />
      </label>
    </div>
    <div
      class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
    >
      Try:
      <button
        v-for="sample in examples"
        :key="sample"
        type="button"
        class="rounded-md border px-2 py-0.5 font-mono text-foreground hover:bg-muted"
        @click="text = sample"
      >
        {{ sample }}
      </button>
    </div>
    <div class="rounded-md border bg-muted/50 p-3">
      <p class="pb-1 text-xs font-medium text-muted-foreground">
        parseFilterInput(text, column{{ condition ? ', condition' : '' }}) →
        {{ rules.length }} {{ rules.length === 1 ? 'rule' : 'rules' }}
      </p>
      <pre class="font-mono text-xs leading-relaxed">{{
        JSON.stringify(rules, null, 2)
      }}</pre>
    </div>
  </div>
</template>
