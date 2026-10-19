<script setup lang="ts">
import { useAttrs } from 'vue'

import QueryTable, { type Column, type TableQuery } from '@dolusoft/query-table'

// A consumer component that forwards every slot it is given, as the Task
// Monitor of frontendx does (`TaskMonitorTable.vue`): the slots reach the
// table as dynamic slots, so the table gets new slot functions on each
// render of this component.
defineOptions({ inheritAttrs: false })
// The table's props come through `$attrs`.
const attrs = useAttrs() as { query: TableQuery; columns: Column[] }
</script>

<template>
  <QueryTable v-bind="attrs">
    <template v-for="(_, name) in $slots" #[name]="p">
      <slot :name="name" v-bind="p ?? {}" />
    </template>
  </QueryTable>
</template>
