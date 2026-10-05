<script lang="ts">
export default {
  name: 'buttonExpand'
}
</script>
<script setup lang="ts">
import { Icon } from '@iconify/vue'

const props = withDefaults(
  defineProps<{
    item?: any
    expandedrows?: Map<any, boolean>
  }>(),
  {
    item: () => ({}),
    expandedrows: () => new Map()
  }
)

// Row id: _rowIndex first, then id
const itemId = (item: any) =>
  item._rowIndex !== undefined ? item._rowIndex : item.id || 0

function expandRow() {
  const id = itemId(props.item)
  props.expandedrows.set(id, !props.expandedrows.get(id))
}
</script>
<template>
  <button class="expandbtn" @click="expandRow">
    <Icon
      :icon="
        expandedrows.get(itemId(item)) === true
          ? 'mdi:chevron-down'
          : 'mdi:chevron-right'
      "
    />
  </button>
</template>
