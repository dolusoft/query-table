// `DataTable`: a table for rows held in the page, `useLocalQuery` and
// `QueryTable` composed behind their own entry (ADR 0021, P9, P14). The
// default entry and `/local` never import it.
import DataTable from './data-table.vue'

export { DataTable }
export default DataTable

export type {
  DataTableEmits,
  DataTableOmittedProp,
  DataTableProps,
  DataTableSlots,
  ErrorSlotProps
} from './contract'
