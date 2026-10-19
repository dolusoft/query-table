<script setup lang="ts">
import { useAttrs } from 'vue'

import type { Column, TableQuery } from '../../packages/vue/src/contract'
import QueryTable from '../../packages/vue/src/index'

// A consumer component that wraps the table and forwards every slot it is
// given with a `v-for`, as the Task Monitor of frontendx does: its slots
// reach the table as dynamic slots, so each render of this wrapper renders
// the table. `tick` is a value of the page that the table does not read;
// the wrapper writes it on its root, so a new tick renders the wrapper.
defineProps<{ tick?: number }>()
defineOptions({ inheritAttrs: false })
// The page passes the table's props through `$attrs`.
const attrs = useAttrs() as { query: TableQuery; columns: Column[] }
</script>

<template>
  <div class="measure-wrapper" :data-tick="tick">
    <QueryTable v-bind="attrs">
      <template v-for="(_, name) in $slots" #[name]="p">
        <slot :name="name" v-bind="p ?? {}" />
      </template>
    </QueryTable>
  </div>
</template>
