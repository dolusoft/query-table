import type { Column } from '@dolusoft/query-table'

// The shape of one demo dataset. The example pages are written against the
// roles below (the main text column, a category, a count, an amount, ...),
// not against field names, so every page draws whichever dataset the
// playground header selects.

export type DatasetId = 'vigil' | 'ticker' | 'harbor'

export type DemoValue = string | number | boolean

/** One row of a demo dataset: an integer `id` and plain values. */
export type DemoRow = { id: number } & Record<string, DemoValue>

/** The field that plays each part in the example pages. */
interface DatasetRoles {
  /** The text that names a row (pinned next to ID, filtered by text). */
  primary: string
  /** A short text that repeats across rows (an equal-filter target). */
  category: string
  /** An integer column. */
  count: string
  /** A number column with decimals or a unit. */
  amount: string
  /** The date or date-time column of the list pages. */
  when: string
  /** A `date` column. */
  date: string
  /** A `datetime` column. */
  datetime: string
  /** A `bool` column. */
  flag: string
  /** The number column the footer adds up. */
  sum: string
}

interface DatasetDetail {
  /** The heading over the nested table of a row. */
  title: (row: DemoRow) => string
  columns: () => Column[]
  /** The nested rows of one row; the same rows for the same row. */
  rows: (row: DemoRow) => DemoRow[]
  /** The `row-key` of the nested rows. */
  key: string
}

export interface Dataset {
  id: DatasetId
  /** The product name the header shows. */
  name: string
  /** What the rows are, under the name in the header menu. */
  kind: string
  noun: { one: string; many: string }
  fields: DatasetRoles
  /** Title, type and showcase width of every field. */
  columns: Record<string, Column>
  /** Field order of the plain list pages (ID first). */
  list: string[]
  /** Field order of the wide pages: ID and the primary field pinned. */
  wide: string[]
  /** Field order of the home page table. */
  showcase: string[]
  /** The fields a global search matches (C-58 is the server's call). */
  searchFields: [string, string]
  /** 200 rows, a fresh array with the same content on every call. */
  createRows: () => DemoRow[]
  flagLabels: { on: string; off: string }
  /** The unit line under the amount title on the header slot page. */
  amountUnit: string
  /** One sentence about a row, for the simple subtable slots. */
  describe: (row: DemoRow) => string
  detail: DatasetDetail
  /** Values the filtering page's preset buttons use. */
  samples: {
    prefix: string
    exact: string
    category: string
    countBelow: number
    countAbove: number
  }
  /** Typed text and quick examples of the filter parser page. */
  parser: { text: string; examples: string[] }
  /** Turkish titles and noun of the labels page. */
  turkish: { primary: string; count: string; flag: string; noun: string }
  /** The "try it" line over the home page table; `code` in backticks. */
  hint: string
  /** Display text of a cell on the home page table, when not plain. */
  format?: Partial<Record<string, (value: DemoValue) => string>>
}
