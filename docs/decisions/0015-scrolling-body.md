# 0015 A scrolling body under a fixed header (3.8)

Status: Proposed (2026-10-16), to be decided by Zahid ([query-table#140](https://github.com/dolusoft/query-table/issues/140)). Amends P5, P7 and P13, and the part of ADR 0010 that has the table write to a scroll position only for the drift correction and `scrollToIndex`; the rest of the principles and of ADR 0010 stand.

## Context

The table draws one `table` in one wrapper, `.qt-table-responsive`, and the consumer makes that wrapper scroll. The header stays in place with `position: sticky` in the consumer's CSS, so it is part of the scrolled area: the vertical scrollbar starts beside the header row, not under it, and a scroll anchored at the top of the container hides rows under the header. frontendx draws its tables this way (`_data-table.scss`, a sticky `thead > tr` in `.qt-table-responsive`) and wants the scrollbar under the header. No consumer CSS can do that: a scrollbar belongs to its scroll container, and the header and the body are in the same one.

A table whose header is outside the body's scroll container is drawn as two tables (three with a footer), as Element Plus and the older PrimeVue scrollable table draw it. Three things then break that one `table` gives for free: the columns of the two tables no longer share widths, the header no longer moves sideways with the body, and the header cells are no longer the headers of the body cells for assistive technology.

## Decision

- **A `scrollBody` prop (K38-1).** With `scrollBody` the table draws its header, body and footer as three tables; without it the DOM is the one of 3.7 (the equivalence gate). Off by default, so every skin of 3.7 keeps working; the DOM is public API (P6), and changing it for everyone would be a major release. New rules C-101 and C-102.
- **Three wrappers in `.qt-table-responsive` (K38-2).** `div.qt-table-head` holds a `table.qt-table` with the `thead`, `div.qt-table-body` one with the `tbody`, and `div.qt-table-foot`, drawn only with footer rows, one with the `tfoot`. Every table keeps `qt-table`, so a skin's cell rules apply unchanged. The consumer's CSS makes `.qt-table-body` scroll (`overflow: auto` and a height) and gives `.qt-table-head` and `.qt-table-foot` `overflow: hidden`; the table sets no `overflow`, no size and no `position` (P5, P13).
- **The header gives the widths (K38-3).** With `table-layout: fixed` the columns of one table take the widths of its header cells; three tables keep that by giving the body and footer tables a `colgroup` with one `col` per header cell, whose inline `width` is that cell's rendered width, measured as the pin offsets are (C-47: one `ResizeObserver`, fractions kept). P5 lists the `width`. The consumer's CSS sets `table-layout: fixed` on the body and footer tables; the table reads `tableLayout` and a development build warns once without it, as C-85 does for `virtual`.
- **Sideways together (K38-4).** One passive `scroll` listener on each wrapper: when one scrolls sideways, the others are set to its `scrollLeft`. The body is scrolled by the user; the header by the browser when a filter input out of view takes the focus, or by the user when the consumer lets it scroll. A position the table wrote does not echo back. Only with `scrollBody`, removed on unmount.
- **One table for assistive technology (K38-5).** `.qt-table-responsive` gets `role="table"`, the three tables `role="presentation"`, the row groups `role="rowgroup"`, every row `role="row"`, the header cells `role="columnheader"` and the other cells `role="cell"`, with `aria-colspan` where a cell spans. Screen readers and the axe scan see one table whose column headers are the header cells, as without `scrollBody`. `aria-rowcount` of a virtual body (C-86) moves to the `role="table"` element.
- **The features stay where they are (K38-6).** The body table is the one the virtual body (C-83 to C-87) and infinite scroll (C-88 to C-90) look at, and `.qt-table-body`, made to scroll, is the nearest scrolling ancestor C-85 finds; with no header in the body table, `scrollToIndex` aligns to the top of the body. Pin offsets, resize and reorder read the header table. `measureColumnWidths` (C-99) counts the header label in the header table and the data cells in the body table, taking the wider. All of it is Vue code next to the parts it measures (P10).

## Options considered

- **Keep one table, document the sticky header (today).** For: no change. Against: the scrollbar beside the header is the report. Rejected.
- **A scrollbar track that starts below the header (`::-webkit-scrollbar-track { margin-top }`).** For: consumer CSS, one table. Against: no Firefox, ignored once `scrollbar-width` or `scrollbar-color` is set, and the header height changes with the filter row. Rejected.
- **`tbody { display: block; overflow: auto }`.** For: one table, consumer CSS. Against: every row becomes a table of its own, so columns align only at fixed widths, a subtable row cannot span and the pinned cells stick per row. Rejected.
- **The wrapper scrolls sideways, the body only down.** For: no listener, the browser keeps header and body in step. Against: the body is as wide as its table, so on a wide table the vertical scrollbar is at the far right, out of view until the user scrolls there. Rejected.
- **Three native tables without roles.** For: native semantics only (P7). Against: a header cell no longer labels the cells under it, and axe reports every header cell without data cells (`th-has-data-cells`). Rejected.
- **The new layout for everyone.** For: one DOM. Against: it breaks every skin that selects `.qt-table-responsive > .qt-table` or a sticky `thead`, so it is 4.0, not 3.8. Rejected.

## Consequences

- C-31, C-40, C-85, C-86 and C-99 change, C-101 and C-102 are new; `TableProps` gains `scrollBody` (`contract/api.json`, `CONTRACT.md`). `contract/dom.ts` gains `qt-table-head`, `qt-table-body`, `qt-table-foot`, the `col` `width` and `aria-rowcount` on the `role="table"` element, each marked `addedBy`.
- The header and footer tables are as wide as their wrappers, the body table as its wrapper less a vertical scrollbar; a consumer that keeps them the same width reserves the gutter on all three (`scrollbar-gutter: stable`).
- The header geometry is measured whenever `scrollBody` is on, not only with a pinned or resizable column: one observer, as today.
- The component grows by 883 B gzip (40668 B to 41551 B, measured on the implementation), in the `component` budget even when `scrollBody` is off; the composable does not change.
- A printed page shows the header once, above the rows, not again on every page.
- With `scrollBody` the content of a body cell no longer widens its column; `autoWidth` (C-100) and `measureColumnWidths` (C-99) still count it.

## Trade-off

The table draws three tables where it drew one, keeps their columns and their sideways position in step, and states with ARIA what one native table would say. In exchange the body scrolls under a header that stays outside it, for a consumer who asks for it with one prop, and the DOM of every other consumer does not change.
