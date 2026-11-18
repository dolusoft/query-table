import { columnTypeOf, type ColumnType } from '@dolusoft/query-protocol'
import {
  defineDataset,
  type Dataset,
  type DatasetField
} from '@dolusoft/query-protocol/local'

import type { Column } from '../contract'

/** What the dataset of a `DataTable` is built from, and nothing else (C-126). */
export interface DatasetSpec {
  key: string
  search: string[]
  fields: Array<{
    name: string
    type: ColumnType
    sortable: boolean
    filterable: boolean
  }>
  /** The `ip` columns, left out of the fields (C-118). */
  ip: string[]
}

export interface DatasetSource {
  rowKey: string
  columns: readonly Column[]
  search: readonly string[] | undefined
  sortable: boolean
  filterable: boolean
}

/**
 * The spec of the columns: one field per column `field` (the first column of
 * a name wins), hidden ones included, `ip` columns left out (C-118).
 */
export const datasetSpecOf = (source: DatasetSource): DatasetSpec => {
  const fields: DatasetSpec['fields'] = []
  const ip: string[] = []
  const seen = new Set<string>()
  for (const column of source.columns) {
    if (seen.has(column.field)) {
      continue
    }
    seen.add(column.field)
    const type = columnTypeOf(column)
    if (type === 'ip') {
      ip.push(column.field)
      continue
    }
    fields.push({
      name: column.field,
      type,
      sortable: source.sortable && column.sortable !== false,
      filterable: source.filterable && column.filterable !== false
    })
  }
  // The order of the fields and of the search means nothing to the
  // evaluator: sorted, a reordered column list gives an equal spec.
  const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  fields.sort((a, b) => byName(a.name, b.name))
  return {
    key: source.rowKey,
    search: [...new Set(source.search ?? [])].sort(byName),
    fields,
    ip: ip.sort(byName)
  }
}

/** Equal specs build the same dataset. */
export const sameSpec = (a: DatasetSpec, b: DatasetSpec): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/** The dataset of a spec. Throws a `TypeError` for a malformed one (C-126). */
export const datasetOf = <T>(spec: DatasetSpec): Dataset<T> => {
  // QueryTable reads `row[rowKey]` (C-26) while the evaluator reads a dotted
  // path: only a top-level name means the same field to both.
  if (spec.key.includes('.')) {
    throw new TypeError(
      `DataTable: the rowKey "${spec.key}" is not a top-level field`
    )
  }
  // No prototype: a field named `__proto__` or `toString` stays a field.
  const fields = Object.create(null) as Record<string, DatasetField<T>>
  for (const field of spec.fields) {
    fields[field.name] = {
      type: field.type,
      sortable: field.sortable,
      filterable: field.filterable
    }
  }
  for (const name of spec.search) {
    if (!Object.prototype.hasOwnProperty.call(fields, name)) {
      throw new TypeError(
        spec.ip.includes(name)
          ? `DataTable: the search field "${name}" is an ip column; only string columns are searched`
          : `DataTable: the search field "${name}" is not a column`
      )
    }
    fields[name] = { ...fields[name], search: true }
  }
  return defineDataset<T>({ key: spec.key, fields })
}
