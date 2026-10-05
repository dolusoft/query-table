import type { ParsedFilterRule } from './filter-input-parser'

export interface ColumnDefinition {
  field?: string
  title?: string
  value?: any
  condition?: any
  type?: string // string|date|number|bool
  width?: string | undefined
  minWidth?: string | undefined
  maxWidth?: string | undefined // default: the table's defaultMaxWidth
  hide?: boolean
  dataOnly?: boolean // hide from UI but include in data/query
  filter?: boolean // column filter
  sort?: boolean
  html?: boolean
  headerClass?: string
  cellClass?: string
  // Parsed filter rules from operator shortcuts (auto-populated by filter-input-parser)
  parsedFilterRules?: ParsedFilterRule[]
}
