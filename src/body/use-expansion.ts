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
 * when `rows` changes; with a key, keys of rows no longer supplied are
 * dropped. A row may also arrive with a boolean `isExpanded` field: it seeds
 * the state each time `rows` changes, `true` opens the row and `false` closes
 * it. Print or report style views can seed the expansion this way (C-26).
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

  // Only the rows given: the table never fetches rows to open (C-55).
  const expandAll = () => {
    if (options.enabled()) {
      options.rows().forEach((row, index) => {
        expanded.value.add(keyOf(row, index))
      })
    }
  }

  watch(
    options.rows,
    rows => {
      if (options.rowKey() === undefined) {
        expanded.value.clear()
      } else if (expanded.value.size > 0) {
        // Only keys of the supplied rows are kept, so the state never grows
        // past one page (C-26).
        const present = new Set(rows.map(keyOf))
        for (const key of expanded.value) {
          if (!present.has(key)) {
            expanded.value.delete(key)
          }
        }
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

  return { keyOf, isExpanded, toggle, collapseAll, expandAll }
}
