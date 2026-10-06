import { type Component, defineComponent, h } from 'vue'

import type { Column, TableLabels } from '../contract'
import { columnName } from '../core/labels'
import IconFilter from '../parts/filter-icon.vue'

export interface FilterTriggerOptions {
  /** The column of this header cell, as the table has it now. */
  column: () => Column
  labels: () => TableLabels
  isFiltered: () => boolean
}

/**
 * The filter button a `filter-menu` slot receives as `trigger` (C-34). It is
 * created once, so a popover wrapped around it does not remount the button on
 * every render. It reads reactive state when it renders, so it still updates:
 * the column and the labels come from getters on each render, not from a
 * capture, so a new title or label shows at once.
 */
export const useFilterTrigger = (options: FilterTriggerOptions): Component =>
  defineComponent({
    name: 'FilterTrigger',
    setup: () => () => {
      const name = options.labels().filterOptions(columnName(options.column()))
      const filtered = options.isFiltered()
      return h(
        'button',
        {
          type: 'button',
          class: 'qt-filter-button',
          title: name,
          'aria-label': name,
          'data-filtered': filtered ? '' : undefined
        },
        [h(IconFilter, { filled: filtered })]
      )
    }
  })
