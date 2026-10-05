import { type Component, defineComponent, h } from 'vue'

import type { Column } from '../contract'
import IconFilter from './filter-icon.vue'

export interface FilterTriggerOptions {
  /** The column of this header cell, as the table has it now. */
  column: () => Column
  isFiltered: () => boolean
}

/**
 * The filter button a `filter-menu` slot receives as `trigger` (C-34). It is
 * created once, so a popover wrapped around it does not remount the button on
 * every render. It reads reactive state when it renders, so it still updates:
 * the column comes from the getter on each render, not from a capture, so a
 * new title shows at once.
 */
export const useFilterTrigger = (options: FilterTriggerOptions): Component =>
  defineComponent({
    name: 'FilterTrigger',
    setup: () => () => {
      const column = options.column()
      const filtered = options.isFiltered()
      return h(
        'button',
        {
          type: 'button',
          class: 'bh-filter-button',
          title: 'Filter options',
          'aria-label': `Filter options for ${column.title ?? column.field}`,
          'data-filtered': filtered ? '' : undefined
        },
        [h(IconFilter, { filled: filtered })]
      )
    }
  })
