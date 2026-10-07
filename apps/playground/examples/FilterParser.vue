<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import type { ColumnType, FilterCondition } from '@dolusoft/query-table'
import { parseFilterInput } from '@dolusoft/query-table'

import { columnOf, currentDataset } from '../scenarios'

// `parseFilterInput` is the table's own filter grammar as a plain function:
// it returns the rules the table would emit for the text typed into a
// column's filter, with the same coercion per column type. Use it to build
// a query from a search box, a saved string or a URL, without a table.
const data = currentDataset()
const column = columnOf(data, data.fields.category)
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
const examples = data.parser.examples

const type = ref<ColumnType>('string')
const condition = ref<FilterCondition | ''>('')
const text = ref(data.parser.text)

const rules = computed(() =>
  parseFilterInput(
    text.value,
    { field: column.field, title: column.title, type: type.value },
    condition.value || null
  )
)
</script>

<template>
  <div class="flex flex-col gap-3 text-sm">
    <div class="flex flex-wrap items-end gap-3">
      <Label class="flex-col items-start gap-1.5">
        Column type
        <NativeSelect v-model="type">
          <NativeSelectOption v-for="name in types" :key="name" :value="name">
            {{ name }}
          </NativeSelectOption>
        </NativeSelect>
      </Label>
      <Label class="flex-col items-start gap-1.5">
        Menu condition
        <NativeSelect v-model="condition">
          <NativeSelectOption value="">type default</NativeSelectOption>
          <NativeSelectOption
            v-for="name in conditions"
            :key="name"
            :value="name"
          >
            {{ name }}
          </NativeSelectOption>
        </NativeSelect>
      </Label>
      <Label class="min-w-64 flex-1 flex-col items-stretch gap-1.5">
        Typed text
        <Input v-model="text" class="font-mono" />
      </Label>
    </div>
    <div
      class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
    >
      Try:
      <Button
        v-for="sample in examples"
        :key="sample"
        variant="outline"
        size="xs"
        class="font-mono"
        @click="text = sample"
      >
        {{ sample }}
      </Button>
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
