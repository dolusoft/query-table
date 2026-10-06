import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref, shallowRef, type Slot } from 'vue'

import QueryTable, {
  type Column,
  type ColumnChangeReason,
  type QueryChangeReason,
  type TableQuery
} from '@dolusoft/query-table'

import { columns as defaultColumns, makeQuery, rows } from './fixtures'
import type { RecordedUpdate } from './helpers'
import { traceUpdate } from './trace'

export interface ColumnsHostOptions {
  /** Write `update:columns` back (`v-model:columns`); default `true`. */
  writeBack?: boolean
  /** Slots handed to the table (`filter-menu`, `header-<field>`, ...). */
  slots?: Record<string, Slot>
}

/**
 * Renders the table inside a consumer that owns both `query` and `columns`
 * (what `v-model:query` and `v-model:columns` do): `columns` lives in a
 * `shallowRef`, every `update:columns` is recorded and, unless `writeBack` is
 * off, written back. The playground skin comes from the browser setup.
 */
export const renderColumnsTable = async (
  props: Record<string, unknown> = {},
  options: ColumnsHostOptions = {}
) => {
  const changes: Array<[Column[], ColumnChangeReason]> = []
  const updates: RecordedUpdate[] = []
  const t0 = performance.now()
  const current = shallowRef<Column[]>(
    (props.columns as Column[] | undefined) ?? defaultColumns()
  )
  const query = ref<TableQuery>(makeQuery())
  const Host = defineComponent({
    setup() {
      const onColumns = (next: Column[], reason: ColumnChangeReason) => {
        changes.push([next, reason])
        if (options.writeBack !== false) {
          current.value = next
        }
      }
      const onQuery = (next: TableQuery, reason: QueryChangeReason) => {
        traceUpdate(next, reason)
        updates.push({ at: performance.now() - t0, query: next, reason })
        query.value = next
      }
      return () =>
        h(
          QueryTable as never,
          {
            rows: rows(),
            totalRows: 50,
            sortable: true,
            filterable: true,
            ...props,
            query: query.value,
            columns: current.value,
            'onUpdate:query': onQuery,
            'onUpdate:columns': onColumns
          },
          options.slots ?? {}
        )
    }
  })
  const screen = await render(Host)
  return {
    screen,
    columns: () => current.value,
    /** Writes `columns` from outside, as the consumer's own code would. */
    setColumns: (next: Column[]) => {
      current.value = next
    },
    changes,
    updates
  }
}
