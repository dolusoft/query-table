# Local query evaluation

Use the opt-in `/local` entries when the browser already holds **all rows of the resolved source context**. A server page or a truncated list is not the full source. Authorization, source context and fetching remain the consumer's responsibility. The table only renders the rows supplied.

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { QueryTable, type TableQuery } from '@dolusoft/query-table'
import { defineDataset } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'

interface Person { id: number; name: string; age: number }
const allRows = shallowRef<Person[]>([])
const dataset = defineDataset<Person>({
  key: 'id',
  fields: {
    id: { type: 'integer' },
    name: { type: 'string', search: true },
    age: { type: 'integer' }
  }
})
const columns = [
  { field: 'name', title: 'Name', type: 'string' as const },
  { field: 'age', title: 'Age', type: 'integer' as const }
]
const query = ref<TableQuery>({ page: 1, pageSize: 10, sort: null, filters: [] })
const print = ref(false)
const local = useLocalQuery({
  allRows, dataset, query, profile: 'tr-1', paginate: () => !print.value
})
</script>

<template>
  <p v-if="local.error.value" role="alert">Query error: {{ local.error.value.code }}</p>
  <QueryTable v-else v-model:query="query" :columns="columns"
    :rows="local.rows.value" :total-rows="local.totalRows.value"
    row-key="id" sortable filterable>
    <template v-if="!print" #pagination="p">
      <button :disabled="!p.canPrevious" @click="p.previousPage()">Previous</button>
      {{ p.page }} / {{ p.pageCount }}
      <button :disabled="!p.canNext" @click="p.nextPage()">Next</button>
    </template>
  </QueryTable>
</template>
```

`defineDataset` copies, validates and freezes an explicit schema. Field types must match the raw values: no conversion is implicit. Supply a unique `integer` or `string` key; rows whose sort values are equal come out in that key's ascending order. Equal means the same value; for text, texts equal at the primary level (`S(C(·))`, for example `Ali` and `ali`) are ordered by the ordinal tertiary level, and the key breaks a tie only between texts that compose to the same text (`I` U+0049 followed by U+0307 and `pek`, and `İpek`). Column configuration and dataset fields are separate; keep their types aligned. The required profile `tr-1` is specified in [semantics.md](../../../docs/guide/semantics.md).

`paginate: false` returns every matching row in the chosen order for printing or export. Hide the pagination slot in that view. Page values are still validated. A page beyond the end stays empty; the consumer decides when to reset it. Page-only, page-size-only and pagination-mode changes reuse filtering, search and sorting.

Show `error` separately from a valid empty result: on an error `rows` is `[]` and `totalRows` is `0`. Development builds log each new error once; production returns it silently. Cursor queries are unsupported.

With `shallowRef`, replace the array (`allRows.value = nextRows`) instead of mutating a row in place. Deeply reactive arrays also work and observe nested changes. When the source schema changes, replace rows and dataset together in a single snapshot assignment and pass getters for both; reset the page explicitly if appropriate.

Rules on one field are OR unless every rule is negative, in which case they are AND. Different fields are AND; search is AND with the filters and OR across fields marked `search: true`. **`age > 20` and `age < 40` on one field is OR, not a range.** See [composition and search](../../../docs/guide/semantics.md#composition-and-search).

The protocol ships its conformance suite at `@dolusoft/query-protocol/conformance/manifest.json` and `@dolusoft/query-protocol/conformance/*` (physical `dist/conformance/` in the package). A backend claiming `tr-1` must pass the same suite with no applicable failures; passing an allow-list is only partial alignment.

## DataTable

`DataTable` from `@dolusoft/query-table/data-table` is the composition above in one component (ADR 0021): `useLocalQuery` and `QueryTable`, with no markup or table behavior of its own. Its props, events, slots, methods and DOM are those of `QueryTable` (C-124, C-127), so the skin and every feature carry over.

```vue
<script setup lang="ts">
import { DataTable } from '@dolusoft/query-table/data-table'

interface Person { id: number; name: string; city: string }
const people: Person[] = [{ id: 1, name: 'Ada', city: 'İzmir' }]
const columns = [
  { field: 'id', title: 'ID', type: 'integer' as const, hide: true },
  { field: 'name', title: 'Name' },
  { field: 'city', title: 'City' }
]
</script>

<template>
  <DataTable :columns="columns" :rows="people" row-key="id"
    :search="['name', 'city']" sortable filterable
    :pagination="{ pageSizeOptions: [10, 25] }">
    <template #error="{ error }">Query error: {{ error.code }}</template>
  </DataTable>
</template>
```

- `rows` is every row of the source. `rowKey` is required: a top-level field that is a `string` or `integer` column (it may be `hide: true`).
- Without `v-model:query` the table holds the query (C-125), starting at page 1 with the first of `pageSizeOptions` (or 10). With it the query is yours, as with `QueryTable`; give it to start with a sort or a filter, or to restore a view.
- The dataset comes from the columns (C-126): each column a field of its type, sortable and filterable only where the table and the column allow it, the fields of `search` searched. An `ip` column is not a field. Give `dataset` for a field that needs `get` or `offset`, or a queryable field with no column.
- `profile` defaults to `'tr-2'`. `paginate: false` draws every match and no pagination block. The `error` slot is drawn in the empty row while the query is invalid.
- `totalRows`, `cursors`, `infinite` and `rowsUpdate` are not props: the table knows the total and tells the flash a new query from changed rows.
