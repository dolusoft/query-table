/**
 * The row-change tracker (C-92): which rows are new and which cells
 * changed between consecutive `rows`, and which updates are answers to a
 * query rather than live changes. A pure module of the core (ADR 0011):
 * it imports only the protocol and keeps no table state.
 *
 * @packageDocumentation
 */
export { sameValue } from './same-value'
export {
  createRowChangeTracker,
  type RowChangeInput,
  type RowChangeKey,
  type RowChanges,
  type RowChangeTracker,
  type RowsUpdate
} from './tracker'
