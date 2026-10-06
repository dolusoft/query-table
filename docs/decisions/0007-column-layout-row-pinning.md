# 0007 Column layout and row pinning (3.1)

Status: Accepted (2026-10-06)

## Context

3.0 draws columns in the order of `columns`, drops `hide` columns and pins `pinned: 'left'` ones (C-29, C-46, C-47). frontendx builds its own `columns` from its left menu and pins on the left only. K8 (3.1) asks for column visibility, column order with drag and keyboard, the right side of column pinning and row pinning. TanStack Table 9.2.6 has all four as features: `columnVisibilityFeature`, `columnOrderingFeature`, the `end` region of `columnPinningFeature` and `rowPinningFeature`.

## Decision

- **The consumer's `columns` owns the layout (K31-1).** Visibility is `Column.hide`, order is the order of the array, column pinning is `Column.pinned: 'left' | 'right'`, width is `Column.width`. No `columnVisibility`, `columnOrder` or `columnPinning` prop: a second map would be a second owner of `hide` (P2, P15). TanStack's slices are projections of `columns`: `columnVisibility = { [field]: !hide }`, `columnOrder = columns.map(field)`, `columnPinning = { start: left fields, end: right fields }`, each in array order.
- **One write-back event (K31-2).** `update:columns(columns, reason)`, `reason` one of `visibility`, `order`, `pin`, `resize`, used with `v-model:columns`. The array is new; a changed column is a new object; unchanged columns are the consumer's objects. A removed field is deleted (`hide`, `pinned`), never written as `false`. A resize emits `columnResize` (unchanged, C-49) and then `update:columns` with reason `resize`. None of them emits `update:query`: layout is not a server query (P1, P4).
- **Physical sides (K31-3).** `pinned: 'left'` maps to TanStack `start`, `'right'` to `end`. An LTR layout is assumed; RTL (logical names, `--qt-pin-start/end`) is a separate decision.
- **No new core plugin (K31-4).** TanStack does the behavior; the Vue layer does the projection, the write-back and the DOM work (the measured right offset, dragging, the keyboard, focus). The core package is not touched (P14).
- **Registered unconditionally (K31-5).** The four features are registered in `useQueryTable`; with every new option off the DOM and the `update:query` traces are those of 3.0.0 (the equivalence gate, `release:3.0.0` baseline).
- **Order is changed within a region.** Dragging and the arrow keys move a column among the visible columns of its region (left pinned, center, right pinned). Changing the region is pinning, not ordering. TanStack's `column.pin('end')` appends to the region; here the array order wins (C-46).
- **Row pinning is order, attribute and a controlled map (S2).** `v-model:rowPinning` (`{ top: string[]; bottom: string[] }`, row keys as strings). Pinned rows of the page are drawn first or last, in map order, with `data-pinned-row`; keys of rows that are not in `rows` stay in the map and are not drawn. No sticky geometry, no `pinnedRows` prop. Without `rowKey` the prop is ignored: an index identity would pin another row on the next page.
- **Release (S1).** 3.1.0 is a minor release: new surface is a minor release, fixes are patch releases (P9). It is released by merging `next` into `main` (CONTRIBUTING, "Releasing").

## Consequences

- The DOM contract grows only with the features on: `qt-reorder-handle`, `data-dragging`, `data-drop`, `data-pinned="right"`, `--qt-pin-right`, `data-pinned-row`, each marked `addedBy` and checked by C-72; C-40 keeps checking the 3.0 list.
- A consumer that does not write `update:columns` back sees the old layout, as with `columnResize` today.
- Sizes grow (TanStack: +1355 B gzip for the three new features, measured); budgets are raised with the change (P8, K7).

## Trade-off

Physical side names keep the 3.0 API and its DOM, at the cost of a later decision for RTL. Keeping the layout in `columns` keeps one owner, at the cost of a new array per change: consumers that watch `columns` deeply re-render more (the guide recommends `shallowRef`).
