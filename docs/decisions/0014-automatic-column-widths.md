# 0014 Automatic column widths (3.7)

Status: Accepted (2026-10-13), decided by Enes ([query-table#124](https://github.com/dolusoft/query-table/issues/124) S1 (a) and S2 (b); proposed 2026-10-13). Amends P2 and P5, and the part of ADR 0013 K36-1 that leaves every width to the consumer; the rest of the principles and of ADR 0013 stand.

## Context

ADR 0013 gave the consumer the measure (`measureColumnWidths`, C-99) and left the rest to it: which width to write back as `Column.width`, and when. frontendx's Data View then fitted its columns to their content when data arrives (`dolusoft/frontendx#2849`), and the code it needed is a set of rules, not a measure: measure after new rows are drawn, only the columns without a width, clamp to the column's limits and to a cap for long text, keep the widths out of the saved layout, and do not make columns jump while the data changes under the same query. The other four frontend products will need the same rules, which is the reason ADR 0013 gave for taking the measure into the table: every consumer writing the same code.

DataTables ships this as `autoWidth`, on by default. Its calculation was compared with ours ([query-table#124](https://github.com/dolusoft/query-table/issues/124)). It picks a sample by character count (the three longest cells and the three longest words of a column, across all the data), lays them out in a hidden copy of the table, and computes again only when the container's width changes; the widths stay put across pages and sorts. C-99 measures the drawn cells themselves, in pixels and with their slot content, so the sample is not taken. The container measure is not either: DataTables bakes the spread of the slack over the columns into its widths, while with the CSS C-50 recommends (`table-layout: fixed; width: max-content; min-width: 100%`) the browser spreads it on every layout. What is taken is the option itself and the stability across pages.

## Decision

- **An `autoWidth` prop (K37-1).** With `autoWidth`, a visible column without `Column.width` is drawn at its automatic width: what `measureColumnWidths` measures for it, clamped as a resize is (C-49), with `autoWidthMax` standing in for a missing `maxWidth`. A column with a `width` keeps it; a resize writes one (C-49, C-50), so a column the user sized leaves the automatic width. Off by default, so 3.6 consumers see no change. New rule C-100.
- **The width is transient (K37-2).** The table keeps the automatic widths as UI state with a clear lifetime, as it keeps a drag preview: written as the header cell's `width`, never emitted, never written to `columns`. They last while the column has no `width` and `autoWidth` is on. P2 lists them; P5's `width` on a header cell includes them. The lasting width stays the consumer's `Column.width` (ADR 0004).
- **When it measures (K37-3).** After the drawn rows change (`rows`), after the set of columns without a width changes, and once the table is displayed, each time after the DOM update. A table that is not displayed measures nothing, keeps its widths and measures when it is displayed again. With no data rows nothing is measured.
- **Stable within a query (K37-4).** While the query stays the same apart from its paging position, page size and sort, the widths only grow: a page, a sort, `append` and `live` rows never make a column narrower. A query that differs in anything else (filters, search, the consumer's own keys), `rowsUpdate: 'reset'`, a new `autoWidthMax` and `autoWidth` turned on measure from scratch. A consumer whose search lives outside the query passes `rowsUpdate: 'reset'` with the answer to a new search.
- **Vue code (K37-5).** Measuring needs the DOM, so the behavior lives next to `measureColumnWidths` in the Vue package (P10: no TanStack option, plugin or pure core module can measure). The comparison of two queries apart from their position is the protocol's `sameQuery` on copies without it.

## Options considered

- **Leave it to the consumer (ADR 0013 as it stands).** For: the table stays a measure, P2 and P5 stay as written. Against: each product writes the same rules against the same measure, and the subtle one (stability within a query) is the one most likely to differ. Rejected.
- **Emit the widths as `update:columns` (reason `resize`).** For: the table keeps no width, P2 stays. Against: every arrival of rows becomes a layout change the consumer must store or drop, a stored automatic width can no longer be told from one the user chose, and a saved view fills with widths of data that is gone. Rejected.
- **Measure again on every change of `rows`, narrowing too.** For: always the tightest fit. Against: columns jump while paging and on every live tick; DataTables keeps them still for that reason. Rejected; S2 of query-table#124.
- **Sample by character count across all rows (DataTables).** For: rows not drawn (another page, outside a virtual window) count. Against: a server-side table has only the page; character count is not width in a proportional font, and slot content has no characters to count. Rejected.

## Consequences

- C-31 and C-99 change, C-100 is new; `TableProps` gains `autoWidth` and `autoWidthMax` (`contract/api.json`, `CONTRACT.md`).
- P2 lists the automatic widths among the UI state; P5's header `width` includes them.
- One synchronous layout per measure (ADR 0013): with `autoWidth` that is one per change of `rows`, and on a live stream one per tick.
- With `virtual` only the drawn rows count (C-99), and scrolling does not measure: rows that come into view later can be wider than their column.
- The filter floor (amendment below) follows the skin's geometry: the padding, border and gap of the filter controls and the width of the filter button are the consumer's CSS, so the same table is wider in a skin with roomier controls. A skin that reserves a share of the row (a percentage padding) makes every filtered column grow by more than that share.
- Since the widths only grow within one result, the first measure of a result, its floor included, stays until the query moves: a column a skin later draws with smaller controls keeps the wider width until then.
- A consumer that saves the drawn header widths (none should; `columnResize` carries the width the user chose) would save automatic ones.

## Trade-off

The table keeps a width it was not given, for as long as no width is given. In exchange the rules that fit columns to their content live once, next to the measure, and every product gets the same stable behavior with one prop.

## Amendment: the filter row is a floor (2026-10-16)

C-99 leaves the filter row out of the measure, so a short column (an ID) was drawn at its label's width and its filter input kept about two characters: in the playground's `column-layout` and `filtering` pages the ID column was 88px with a 27px text box. The automatic width now counts the filter row as a floor (C-100): the table's own controls side by side (six characters of text in a text or number input, a select or date input at its own width, the filter buttons), read out of the cell's flow and from the controls alone, so slot content never counts and a measure never feeds on the width it gave. A consumer's `maxWidth` or `autoWidthMax` below the floor wins, as in AG Grid, where an explicit limit beats the fitted width. `measureColumnWidths` is unchanged: it measures content, and a width the user chose stays the user's. The floor is not an option: a column drawn too narrow for its filter is a defect, not a preference, and a table without filters is measured as before. Options considered: a prop `autoWidthIncludeFilters` (rejected: one more prop for the only sensible value, P9), a floor computed from the controls' current boxes (rejected: a skin's narrow form, a container query, changes those boxes with the width being chosen).

Autofit takes the same floor (decided by Zahid, 2026-10-16). A double click or Enter on a resize handle (C-50) fitted a short column to its label and cells and left its filter as unusable as the automatic width did; the width it emits is now never less than the filter controls side by side, read as for `autoWidth`. A column without a filter row fits as before. Autofit stays a user action: the width is emitted as `columnResize` and is the consumer's to write back, so a column the user narrows by dragging can still go below the floor.
