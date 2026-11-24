# 0024 Growing columns: the room of a wide container goes where the consumer says (3.21)

Status: Proposed, [query-table#136](https://github.com/dolusoft/query-table/issues/136). Decided by Enes on 2026-11-24: a column's share of the room is a weight, `Column.grow` (#136 D-01), and a width the user gave a growing column is its base (#136 D-02) ([comment](https://github.com/dolusoft/query-table/issues/136#issuecomment-7125070614)). Amends P2 and P5: the shares are widths the table draws and keeps for a while, as the automatic widths of [ADR 0014](0014-automatic-column-widths.md) are. Changes C-49 for a growing column. Two questions below are open until the record is accepted.

## Context

With the CSS C-50 recommends (`table-layout: fixed; width: max-content; min-width: 100%`), a table narrower than its container is stretched to the container, and the browser spreads the rest over every column by its declared width, the utility columns included. `autoWidth` (ADR 0014) fits each column to its content, and the stretch then widens all of them again. Measured in frontendx's Data View on a 2200 px screen (#136): Action 374 → 549 px, Username 232 → 340 px, and the 30 px expand column 44 px. What Data View wants is the room going to the long text, the message column, and the other columns staying at their content's width (`dolusoft/frontendx#2849`).

CSS cannot say that here. A column without a declared width takes what is left in a fixed layout, but with `autoWidth` every column without `Column.width` gets a declared width, so none is left to take it; among declared widths the fixed layout spreads the rest by their ratio. A consumer cannot exempt one column from the stretch without giving up the fitted width of the others.

Grids solve it with a weight on the column: CSS flexbox's `flex-grow`, AG Grid's `flex`. The room is divided by the weights, after every other column has its width, within each column's limits.

## Decision

- **`Column.grow` (K321-1, #136 D-01).** A number, a weight as in `flex-grow`. A visible column with `grow` above `0` is a growing column; absent, `0` or not a finite number, the column does not grow. There is no priority order (#136 rejected `growPriority`). New rule C-132.
- **The room and the shares (K321-2).** The room is the width of the table's scroll container (`.qt-table-responsive`, inside its scrollbar) minus the table's natural width: every drawn column at its declared width, a growing one at its base (K321-3), and every utility column at the width the skin gives it. The room is divided among the growing columns by their weights. A share is whole pixels, rounded down, and the pixels the rounding leaves go to the last growing column in drawing order, so the table is exactly as wide as its container and the browser has nothing left to spread. A growing column stops at its `maxWidth`, and what it cannot take goes to the others by their weights, as flexbox does; when every growing column is at its `maxWidth`, the rest is the browser's to spread, as today. Without room (the columns are wider than the container) there are no shares and the table scrolls sideways, as today.
- **The base of a growing column (K321-3, #136 D-02).** Its `Column.width`, a width the user gave it included (C-49, C-50, written back by the consumer); else, with `autoWidth`, its automatic width (C-100); else its minimum width as a resize clamps it (`minWidth`, else 40, C-49). The column takes its share on top of its base, and a container that narrows takes the share back first: the column is never drawn narrower than its base.
- **The shares are transient (K321-4).** As with the automatic widths (K37-2): the table draws a growing column at its base plus its share as the header cell's `width`, never emits it and never writes it to `columns`; the slot props carry the column as given. The shares last while the column grows and the container is wider than the table's natural width. P2 lists them among the UI state the table keeps; P5's `width` on a header cell includes them. The lasting width stays the consumer's `Column.width` (ADR 0004).
- **When (K321-5).** The table reads its natural width in one synchronous read, as C-99 measures: inline styles set for the length of the read and put back before it returns, so nothing of it is painted. It reads after the drawn columns change (set, order, pinning, widths, automatic widths, utilities) and once the table is displayed, each time after the DOM update. A change of the container's width alone only divides the room again: one `ResizeObserver` on the container, no read of the table. A table that is not displayed keeps its shares.
- **Layouts (K321-6).** With `scrollBody` the shares are drawn on the header cells, the body and footer tables follow through their `col` widths (C-101), and the container is the header's wrapper: C-101's CSS gives the three wrappers `overflow-y: scroll`, so they are as wide. A growing column may be pinned; the pin offsets are measured from the drawn widths, so they follow (C-47, C-71). With `header: false` there are no shares, as there are no automatic widths (C-121): nothing is drawn on header cells. `virtual` and `infinite` change nothing.
- **Vue code (K321-7).** Reading widths needs the DOM, so the behavior lives next to `autoWidth` in the Vue package (P10).

## Open questions

To be answered before the record is accepted.

**Q1. What does a drag on a growing column's resize handle do?** D-02 keeps the width the user gives as the base, and the column still takes its share. A single growing column is then drawn as wide as the room leaves, whatever its base, as long as the base is narrower than that: narrowing it frees room that comes back to it.

- **(a)** The drag works on the base. While the pointer moves the shares stay as they are and the column follows the pointer (C-49's preview). On release the table emits the drawn width minus the column's share, the new base, and divides the room again. With one growing column and room to spare, the column does not change after the release; with several, the drag moves room between them by their weights. Widening a column past what the room leaves makes the table scroll sideways, as today.
- **(b)** The drag emits the drawn width, as C-49 does today. That width becomes the base and the share comes on top of it, so the column jumps wider by its share on release.
- **(c)** A growing column has no resize handle while there is room. The user cannot size it, which D-02 assumed they can.

[Proposal] (a): it is what D-02 asks for, and the only option where nothing jumps.

**Q2. What if a column that does not grow has no width?** Without `autoWidth`, a column without `Column.width` takes what is left in a fixed layout, so it and the growing columns would claim the same room.

- **(a)** The table draws no shares while a visible column that does not grow has neither a `width` nor an automatic width, and a development build warns once. A consumer gives those columns a width or turns `autoWidth` on.
- **(b)** The table measures such a column as `autoWidth` would and uses that width in the sum, without drawing it. The column is then drawn wider by the browser's own spread, so the sum is wrong as soon as it is drawn.
- **(c)** The growing columns take the room and such a column gets what the browser leaves it, which can be nothing.

[Proposal] (a): the sum is only right when every column that does not grow has a width the table knows, and Data View, the case of #136, uses `autoWidth`.

## Options considered

- **A priority order, `growPriority`, or both an order and weights.** For: "the message column first, then the rest" in one number. Against: no ratios with an order alone, and twice the surface and the rule with both. Rejected by #136 D-01.
- **Leave a column without a width (CSS only).** For: no table code. Against: with `autoWidth` no column is without a declared width; without it, every column without a width takes a share of the rest, the short ones included. Rejected.
- **Emit the shares as `update:columns` (reason `resize`).** For: the table keeps no width. Against: the shares depend on the screen; a saved view would fill with them and a share could no longer be told from a width the user chose. Rejected, as K37-2 rejected the automatic widths.
- **A table prop that names one column (`growColumn: 'message'`).** For: one string. Against: one column only and no ratios; the weight on the column covers both. Rejected.
- **A percentage `Column.width`.** For: no new field. Against: the table's own width is its content's (`max-content`), so a percentage of it is circular, and a percentage does not leave the other columns at their content's width. Rejected.

## Consequences

- New rule C-132; `Column` gains `grow` (`contract/api.json`, `CONTRACT.md`). C-49 changes for a growing column (Q1), and C-31 and P5 list the shares among the header cell's `width`; P2 lists them among the UI state.
- One synchronous read per change of the drawn columns; resizing the window costs no read.
- A growing column's drawn width depends on the screen. A consumer that saves the drawn header widths (none should; `columnResize` carries the width the user chose) would save shares.
- The utility columns and the columns that do not grow stay at their width on every screen, which is the point of #136; in a container wider than the columns they no longer widen.
- With every growing column at its `maxWidth`, the browser spreads the rest over all columns, as today.
- frontendx's Data View gives its message column `grow` (`dolusoft/frontendx#2849`) once it is on a release with this record.

## Trade-off

The table keeps one more width it was not given, for as long as its container is wider than its columns. In exchange the consumer says once, per column, where the room goes, and the short columns and the utility columns stay at their width on every screen.
