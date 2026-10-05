import { ref, watch } from 'vue'

import type { TableProps } from '../contract'

export interface ExpansionOptions<T extends object> {
  rows: () => T[]
  rowKey: () => TableProps<T>['rowKey']
  /** Whether the table has the `subtable` column at all. */
  enabled: () => boolean
}

/**
 * Which rows are expanded, by `rowKey` or by index (C-26). Without a row
 * identity the state belongs to the rows array it was set on, so it resets
 * when `rows` changes. A row may also arrive with `isExpanded` set (print mode
 * opens rows that way).
 */
export const useExpansion = <T extends object>(
  options: ExpansionOptions<T>
) => {
  const expanded = ref(new Set<string | number>())

  const keyOf = (row: T, index: number): string | number => {
    const rowKey = options.rowKey()
    if (typeof rowKey === 'function') {
      return rowKey(row, index)
    }
    if (typeof rowKey === 'string') {
      return (row as Record<string, string | number>)[rowKey]
    }
    return index
  }

  const isExpanded = (row: T, index: number) =>
    options.enabled() && expanded.value.has(keyOf(row, index))

  const toggle = (row: T, index: number) => {
    const key = keyOf(row, index)
    if (!expanded.value.delete(key)) {
      expanded.value.add(key)
    }
  }

  const collapseAll = () => expanded.value.clear()

  watch(
    options.rows,
    rows => {
      if (options.rowKey() === undefined) {
        expanded.value.clear()
      }
      if (!options.enabled()) {
        return
      }
      rows.forEach((row, index) => {
        const seeded = (row as { isExpanded?: boolean }).isExpanded
        if (seeded === true) {
          expanded.value.add(keyOf(row, index))
        } else if (seeded === false) {
          expanded.value.delete(keyOf(row, index))
        }
      })
    },
    { immediate: true }
  )

  return { keyOf, isExpanded, toggle, collapseAll }
}
