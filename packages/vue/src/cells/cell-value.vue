<script setup lang="ts">
import type { CellValueProps } from './contract'
import { useCellLabels } from '../core/table-labels'

// A value is drawn as bare text, which cannot carry an attribute, so
// CellValue takes none, whether the value is empty or not (C-128): the same
// markup for every row, and no warning for an attribute dropped.
defineOptions({ name: 'CellValue', inheritAttrs: false })

const props = defineProps<CellValueProps>()

const labels = useCellLabels()
const empty = () =>
  props.value === null || props.value === undefined || props.value === ''
</script>

<template>
  <span v-if="empty()" class="qt-cell-empty">{{ labels().emptyValue }}</span>
  <template v-else>{{ String(value) }}</template>
</template>
