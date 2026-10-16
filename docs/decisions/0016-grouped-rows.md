# 0016 Grouped rows and the sticky group header (3.8)

Status: Proposed (2026-10-16). Needs a code owner's approval (`.github/CODEOWNERS`).

## Context

A table cannot draw a grouped list. A consumer that wants one sorts its rows by group, puts header rows into `rows` itself and marks them with `rowKind` (C-97), which is only a label. The header rows then count as rows: `rows.length`, `aria-rowcount`, `data-row-index`, the selection, `scrollToIndex` and the infinite-scroll threshold all see them, and every consumer filters "is this index a real record" again (dolusoft/query-table#131, found in the Decision Trace viewer, dolusoft/dev#35).

With `virtual` a second problem follows (dolusoft/query-table#132): a sticky group header is a header row the consumer's CSS sticks to the top, but once its group's first row leaves the window the header row leaves the DOM, and the sticky name disappears while the user is still inside that group. The consumer writes a `scroll` listener and a `getBoundingClientRect` scan to find the group of the top row.

The first consumer is the Task Monitor panel of frontendx (dolusoft/frontendx#3065): a narrow (about 600px) side panel, the whole task list (hundreds to thousands of rows) given again on every SignalR message, `rowKey="workId"`, `virtual`, one page, `flash` with `rowsUpdate="live"`, the tasks grouped by `workCategory` with the name and the count in the header.

## Decision

- **`groupBy` groups consecutive rows (K38-7).** `groupBy(row, index)` returns a group key (`string` or `number`); a run of consecutive rows with the same key is one group. The table never reorders (P1): rows of one key that are not adjacent make two groups, and sorting by group is the consumer's. `null` and `undefined` mean "no group": such a row gets no header and ends the run before it. This is not TanStack's grouping (`getGroupedRowModel`): that one reorders and aggregates rows on the client, which P1 and ADR 0008 keep unused. No TanStack state is kept a second time (P15): the runs are derived from `rows` on each change, nothing is stored. Pinned rows (C-74) are not grouped. Like the virtual body (ADR 0010), the grouping is drawing, not query state: it lives in the Vue package, and no plugin or core module is added.
- **The table draws the header row (K38-8).** Before the first row of each group the body draws one `tr.qt-group-row` with one `th scope="row"` spanning every column (the utility columns included), holding the `group` slot. The slot receives `groupKey`, `count` (rows in the group), `row` (its first row) and `rowIndex` (the first row's index in `rows`); `groupKey` and not `key`, because Vue keeps `key` off slot props. Without the slot the cell shows the key as text. The group row has no utility cells, no `data-row-index`, no `data-row-kind`, no selection checkbox, no expand button and never flashes. In the `v-for` of the body it has its own identity (the key and how many runs of that key came before), so a group row is moved, not mounted again, when its first row changes or it moves between its own place and the top of a virtual window.
- **`scope="row"`, not `scope="rowgroup"` (K38-8a).** A `rowgroup` header applies to every later cell of its `tbody` (the HTML header association algorithm), and the body is one `tbody`: the cells of group B would be announced under the headers of A and B, and ungrouped rows after a group under its header. `scope="row"` names the group row itself and claims no cell it does not own; the group is told by the order of the rows and by `aria-rowindex`. One `tbody` per group would make `rowgroup` exact, but the virtual body, the spacers, `tBodies[0]` and the single `tbody` listener (C-28) all rest on one `tbody`; that is a change of its own.
- **Records count, header rows do not (K38-9).** `rows.length`, `data-row-index`, the `rowIndex` of every slot and event, the selection, `scrollToIndex(index)`, `expandAll`, `rowKind`, the flash and the infinite threshold are about the given rows only, as without `groupBy`. For assistive technology a group row is a row: with `virtual`, `aria-rowcount` counts the group rows and they carry `aria-rowindex`, like the subtable rows already do (C-86). A count that left them out would give two drawn rows the same index. With `infinite` while there is more to load and a group exists, `aria-rowcount` is `-1`: the group rows of the pages to come are unknown, even with `totalRows`.
- **In a virtual body a group row belongs to the first row of its group (K38-10).** The group row, the data row and its open subtable row are one item, counted together by the spacers (C-83, C-84). The row's own height is measured and kept by its key without the group row, and every group row counts as tall as the last group row measured: a row that stops being the first of its group (a task added above it) keeps a right height, and a group row drawn before a row that is not the first of its group never leaks into that row's height. With `virtual.rowHeight` nothing is measured, and a group row is `virtual.groupRowHeight` tall (default: `rowHeight`); the option is compared by value with the others.
- **The sticky header stays drawn (K38-11, #132).** Making a group row sticky is the consumer's CSS (P5, P13): `tr.qt-group-row > th { position: sticky; top: <height of the sticky thead> }`, inside a scroll container that is not cut by another one (`overflow-x: auto` on a wrapper makes that wrapper the scrollport). Without `virtual` every group row is in the DOM and the browser does the rest; each later group row covers the one before when it reaches the top, so a name is never shown twice. With `virtual`, when the first row drawn after a spacer is not the first of its group and no row of its group is drawn before it, the table also draws that group's header row right before it and takes its height from that spacer (the upper one, or the one between a row kept for the focus and the window), so the scroll height does not change. Only one header row of a group is ever in the DOM, and it keeps the `aria-rowindex` of its place before the group's first row. While the page prints every group row is in its place and none is carried. The table adds no `currentGroup` state, no scroll listener and no `MutationObserver`: the sticky row is the current group. `scrollToIndex` shows the first row of a group with its group row above it, and aligns any other row below the sticky `thead` (C-87) and below a group row the consumer made sticky (one `getComputedStyle` read, only with `groupBy`).
- **Off costs nothing (K38-12).** Without `groupBy` the table computes no runs, draws no group row, measures nothing more and the DOM is the one of 3.7 (the equivalence gate and the render budget). With it, the work is one pass over `rows` per change of `rows` or `groupBy`.

## Scope

In: #131 (the grouped body) and #132 (the sticky header, as K38-11).

Out, each its own change:

- #133, keeping the first visible row in place when rows are added above it (`virtual.keepAnchor`). It is an option of its own, independent of grouping; it changes the C-84 correction for every virtual table and needs its own rule and tests. The Task Monitor uses grouping without it.
- #134, keyboard navigation of a virtual list (group rows are not focusable here and the table adds no key handling).
- #135, a table without `thead`; #140, a body-only scroll container.
- Collapsing a group, a group checkbox (select the group), group footers and aggregates.

## Rules (drafts)

- **C-103 Grouped rows.** K38-7, K38-8, K38-9 without `virtual`.
- **C-104 Grouped rows in a virtual body.** K38-10, K38-11, the aria counting of K38-9.
- **C-105 Grouping off and DOM contract of 3.8.** K38-12; `qt-group-row` is marked `addedBy: 'C-103'`.

## API

```ts
// TableProps<T>
groupBy?: (row: T, index: number) => string | number | null | undefined

// VirtualOptions
groupRowHeight?: number // with rowHeight; defaults to rowHeight

// TableSlots<T>
group?(props: GroupSlotProps<T>): unknown

export interface GroupSlotProps<T> {
  groupKey: string | number
  count: number
  row: T
  rowIndex: number
}
```

## Consultation

The draft was reviewed on 2026-10-16 by two independent consultants, astra (codex `gpt-6-astra`, read-only) and Fable, before the implementation.

- Both accepted the consecutive-run model, the slot, the scope (#133, #134, #135 and #140 out), the off path and the principles (P1, P5, P10, P13, P15).
- Both accepted counting group rows in `aria-rowcount` and `aria-rowindex` (K38-9): the issue's "not in the aria indexes" meant the record indexes (`data-row-index`, `scrollToIndex`), and a drawn `tr` without its own index would shift the count of assistive technology.
- astra: `scope="rowgroup"` in one `tbody` associates every later cell with every earlier group header (high priority). Fable saw the same limit and would keep it as a documented consequence. Decided: `scope="row"` (K38-8a); one `tbody` per group stays a later option.
- astra: with `infinite` and more to load the number of group rows to come is unknown; `aria-rowcount` is `-1`. Taken.
- Both: a row kept drawn for the focus (C-86) above the window must not give a group two header rows, and the carried row's height may have to come from the spacer between the kept row and the window. Taken: the group row is carried only when no row of its group is drawn before, from the spacer right before it.
- Fable: keep the group row out of the row's measured height, or a row measured once with a carried group row above it and once without makes the C-84 correction run on every window move; give the group row an identity of its own in the `v-for`, or it remounts when the window passes its group or a row is added above its first row; compare `groupRowHeight` by value. Taken (K38-10, K38-8).
- Fable on #133: in Chrome and Firefox the browser's own scroll anchoring keeps the first visible row when rows are added above it in a virtual body (the spacer grows above the anchor node); a test that adds rows above while scrolled should decide whether #133 must come first. Kept out of this change; checked in the playground scenario of the Task Monitor (see the pull request): with a 50 ms feed adding and removing rows above, the top visible row stayed at the same pixel, grouped and flat. A browser test now covers a row added above with new objects (C-104).

Review of the finished change (astra and Fable):

- astra: without `groupBy` the virtual body allocated a second height array (P8). Fixed: one array serves both when there are no groups. A group row's `v-for` key was a string that a consumer `rowKey` could equal; it is now a symbol per group. The infinite `-1` test did not cover a known total; added.
- Fable: `scope="row"` alone in its row would fail axe `th-has-data-cells`. Rejected after a check: a grouped plain and virtual body pass the axe scan (a C-103 case added to the C-45 scan). Sticky on the `tr` breaks the window's reading of the flow: the contract now says sticky goes on the cell, and only the cell is read. An inline `groupBy` rebuilt the heights on every parent render: the rebuild now follows the runs' shape. `scrollToIndex` added the sticky cover to rows in no group: fixed. The slot prop `index` is `rowIndex`, as in the cell slot. `NaN` is no group. The slot content is for reading (no kept focus, #134), and without `virtual` `scrollToIndex` scrolls the row, not its group row: both written in C-103. A reflow of the TanStack table in `rules.md` was reverted.

## Trade-off

The table owns one more kind of body row and its place in the window. In exchange the consumer's grouped list keeps the table's counting, selection and `scrollToIndex` without filtering, and a sticky header in a virtual list needs only CSS.
