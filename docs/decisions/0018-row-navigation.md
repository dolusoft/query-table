# 0018 Keyboard navigation between rows (3.12)

Status: Proposed (2026-10-23), [query-table#134](https://github.com/dolusoft/query-table/issues/134). The focus target (K312-2) and when `rowFocus` is emitted (K312-6) were decided by Enes on 2026-10-23.

## Context

A virtual list (ADR 0010) has no keyboard navigation of its own, and a consumer that writes it finds it hard (dolusoft/query-table#134, found in the Decision Trace viewer, `MomentList.vue` of dolusoft/dev):

- A row out of the window is not in the DOM. The element to focus must first be drawn with `scrollToIndex`.
- Once drawn, it must be found by identity, not by index: `rows` may change in between (a poll adds moments at the top).
- Focusing it changes the row kept drawn for the focus (C-86) and can move DOM nodes, and Chrome then drops the focus; the consumer retries in a `requestAnimationFrame` loop after `nextTick`.
- Heading rows must not take the focus, and the focused row must not end up under the sticky header.

The consumer's code is a `keydown` handler, a `queueFocus` loop with `requestAnimationFrame` and `nextTick`, a `focusin`/`focusout` pair to cancel it, and a `MutationObserver` on the body to resume it. Today the table gives it only `scrollToIndex` (C-87), which aligns below a sticky `thead` (and a sticky group row, C-104), and no key handling.

## Decision

- **An opt-in prop, in the Vue package (K312-1).** `rowNavigation` (`true` or `{ focus, skip }`) turns the navigation on; off by default. Moving the focus is DOM work, not query state: there is nothing for the protocol or the core to hold, so no plugin and no core module is added (as for the virtual body, ADR 0010, and the grouping, ADR 0016). It works with and without `virtual`.

- **The focus goes to the row's own focus target (K312-2, owner decision).** A row's focus target is the first element of the row that matches `rowNavigation.focus`, else the row's first link, enabled button, enabled checkbox or element with a `tabindex` (a utility button or checkbox included). Text fields, `select`, radio buttons and editable content are not a default target: they use the arrow keys themselves, and the navigation would take them (review finding). A consumer that names one in `focus` chooses that. The table writes no `tabindex`, no class and no attribute.
  - The consumer already draws an interactive element per row (the Decision Trace viewer has a button per moment that opens it on Enter). Focusing it keeps Enter, Space and the accessible name of that element; a focused `tr` would have none of them.
  - A focusable `tr` in a `table` is not an ARIA pattern: rows that take the focus are the grid and treegrid patterns, with cell navigation and roles of their own. Making the table a grid is a change of its own (see Scope).
  - A roving `tabindex` on the rows would add a DOM hook (P6) and a row input that changes on every move, so two rows would be drawn again per key (C-106).
  - A row with no focus target ends the move where it is, without an event. The table does not fall back to the `tr`.

- **The keys and the stops (K312-3).** `ArrowDown` and `ArrowUp` go to the next and previous row, `Home` and `End` to the first and last, in the order the body draws them (top-pinned rows, the others, bottom-pinned rows, C-74), the rows out of a virtual window included. Group rows (C-103) and subtable rows are not rows and are passed over. `rowNavigation.skip(row, index)` names the other rows to pass over, read when a key is pressed. A key acts only when the focus is on a row's focus target, with no modifier held, not composing and not already prevented; it then prevents the default, also at the first or last row where nothing moves, so the container does not scroll by the key under the focus. An input in a cell that is not the focus target keeps its own arrow keys.
  - `skip` is a function, not "every row with a `rowKind`": a consumer that marks heading rows with a kind marks its other rows too (the Decision Trace viewer gives every row a kind, `group` or `moment`). With `groupBy` the heading rows are group rows and need no `skip`.
  - No wrap-around: `ArrowDown` on the last row stays.

- **A move goes by key, and waits for the row in a virtual body (K312-4).** The move keeps the target row's key (`rowKey`), its row object and the element that had the focus. Without `rowKey` the key is the index, so the row is found by its object, as the kept row of C-86 is (review finding).
  - A drawn row (always without `virtual`, and for a pinned row) is focused at once, in the key's handler.
  - With `virtual`, a row not drawn is scrolled to as `scrollToIndex` does (C-87, `align: 'auto'`). Each animation frame the move checks whether the window still has a scroll or a render to do (`busy`, internal to the window); once it has none, it finds the row by its key in `rows` and its `tr` by `data-row-index`, and focuses the target (`focus({ preventScroll: true })`).
  - A change of `rows` drops the window's waiting `scrollToIndex` (C-87); the move asks for its row again, at the index its key now has.
  - A key pressed while a move waits moves on from the row it waits for, not from the row that still holds the focus, so holding `ArrowDown` does not repeat one step.
  - After the focus landed, the move watches two frames in which the window has nothing left to draw (the scroll of K312-5 makes it draw again): when moving DOM nodes took the focus off the target (the focus is on no element, or on the `body`), it is put back.
  - A move ends when its row leaves `rows`, when the focus goes to another element (a script), on a `pointerdown` anywhere (a click on empty space leaves the focus on the `body` and must still end it; one capture listener on the window while a move runs), when the table unmounts, or after 30 frames.

- **The row is shown whole, below the sticky covers (K312-5).** Once the focus landed, the table aligns the row alone, in the vertical direction, as `scrollToIndex` does with `align: 'auto'`: nothing when it is in view, else to the nearest edge, below a sticky header that covers the top of the container and below a group row whose cell the consumer's CSS made sticky (C-104); the first row of a group comes with its group row. The alignment is the one `scrollToIndex` already uses with `virtual` (factored out as `alignRow`); with `virtual` it runs in the container of C-85, without it in the nearest scrolling ancestor of the table (the search of C-85), else the window. Only the `tr` counts, not its open subtable row: aligning the whole item to the nearest edge would push a row with a tall subtable out at the top (review finding). A `scrollToIndex` still waiting from an earlier move is dropped, so it cannot move the view away from the row that has the focus (review finding). Sideways the table does not scroll: `focus` is called with `preventScroll`, and a target in a column scrolled out of view stays there. `scrollToIndex` itself is unchanged: without `virtual` it still calls `scrollIntoView` (C-87).

- **`rowFocus` is emitted for a move by a key, once (K312-6, owner decision).** When a key moved the focus to another row and the focus is there, the table emits `rowFocus` with `row`, `rowIndex` and `key`. One event per key press that moved the focus: none at an edge, none when the focus is put back (K312-4), none for a click or Tab, which the consumer's own element reports. The consumer that opens the row it reaches, like a list box, selects on `rowFocus` and on its element's click.

- **Off costs nothing (K312-7, P8).** Without `rowNavigation` the table adds no `keydown` listener (the body's listeners are bound with an object that is empty while off), reads nothing on a key and asks for no frame; the DOM is the one of 3.11. With it, the one listener is on the `tbody`, next to `contextmenu`, `focusin` and `focusout` (C-28, C-108), never on a row or a cell; while a move runs, a `pointerdown` listener on the window ends it.

## Scope

In: #134.

Out, each its own change:

- `PageUp` and `PageDown`, typeahead, `Ctrl+Home` and `Ctrl+End`, wrap-around.
- Moving between cells, and a table that is a `grid` or `treegrid` (roles, roving focus over cells).
- Extending the selection with `Shift` and the arrow keys.
- A focusable group row (a group row stays for reading, C-103).
- Aligning `scrollToIndex` below a sticky header without `virtual` (C-87 keeps `scrollIntoView`).

## Rules

- **C-109 Row navigation.** K312-2, K312-3, K312-6.
- **C-110 Row navigation: drawing and showing the row.** K312-4, K312-5.
- **C-111 Row navigation off and DOM contract of 3.12.** K312-7.

## API

```ts
// TableProps<T>
rowNavigation?: boolean | RowNavigationOptions<T>

export interface RowNavigationOptions<T> {
  /** The element of a row that takes the focus; defaults to its first focusable element. */
  focus?: string
  /** Rows the keys pass over. */
  skip?: (row: T, index: number) => boolean
}

// TableEmits<T>
rowFocus: [payload: RowFocusPayload<T>]

export interface RowFocusPayload<T> {
  row: T
  rowIndex: number
  key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'
}
```

Internal: `useRowNavigation` (`packages/vue/src/body/use-row-navigation.ts`), and `reveal(index)` and `busy()` of the row window.

## Checks

- Browser contract tests (`tests/contract/browser/row-navigation.browser.spec.ts`), with and without `virtual`: the keys, the event, the default prevented at an edge, `skip`, group and subtable rows passed over, the default target, keys off a target or with a modifier, a row with no target, pinned rows; the row whole below a sticky header (plain and virtual) and below a sticky group row; the move by key with rows added at the top while it waits; a key while a move waits; the focus put back without a second event; a focus moved elsewhere ending the move; `scrollBody`; the navigation off (no `keydown` listener) and on (one, on the `tbody`, and no `tabindex`). The file is in `ADDED_AFTER_BASELINE`: a 3.11 build has no navigation.
- Unit tests of the composable (`use-row-navigation.spec.ts`), with the animation frames run by hand, for the branches the browser cannot reach on purpose (a focus that does not take, a row never drawn, the table unmounted), and of `reveal`.
- `pnpm check:size`: the component fixture is 45500 B gzip, within its budget (46313 B); the budget is not changed. `pnpm check:renders`: the scenarios do not turn the navigation on and do not move.
- Playground page `row-navigation` ("Row navigation"), example `RowNavigation.vue`: an event log grouped by session with note rows passed over by `skip`, `virtual` and the grouping switchable, the page selecting the event on `rowFocus`, sticky header and group rows.

## Consequences

- A consumer deletes its `keydown`, `requestAnimationFrame` and `MutationObserver` focus loop and gives `rowNavigation` and a focus target per row.
- Every row that is not skipped must hold a focus target; a row without one stops the keys there.
- The navigation follows the drawing order, so pinned rows come first and last.
- The focus can be put back by the table for a few frames after a move. A consumer that moves the focus itself in that time ends the move.

## Consultation

The finished change was reviewed on 2026-10-23 by an independent consultant (Fable, read-only) before the pull request.

- Without `rowKey` the key is the index, so a move waiting for its row while rows came in at the top landed on another row, against C-110. Taken: the row is found by its object without `rowKey` (K312-4), with a test.
- The default target included text fields, selects and radio buttons, whose arrow keys the navigation then took. Taken: they are not a default target (K312-2).
- `align: 'auto'` over the row and its open subtable row aligned a tall item by its bottom and pushed the row out at the top. Taken: only the `tr` is aligned (K312-5), with a test.
- The frames that watch the focus after it landed were counted while the window was still drawing. Taken: counted only while it is idle.
- A click on empty space during a wait left the focus on the `body`, which the move took as a dropped focus and later took it back. Taken: a `pointerdown` ends the move.
- A `scrollToIndex` of an earlier move could still align after a later move focused another row. Taken: showing the row drops it.
- `preventScroll` also prevents scrolling sideways. Kept, written in K312-5 and C-110 (vertical only).
- Checked and found fine: the order of the navigation's frames and the window's (`settle` runs in the microtasks after the window's frame, before the navigation's), the kept row of C-86, pinned, group and subtable rows, nested tables, the container without `virtual`, infinite scroll, the principles, and one `rowFocus` per key press.

## Trade-off

The table owns a short-lived focus state (a move, its key and a few frames; P2) and one more `tbody` listener while it is on. In exchange the hard part of keyboard navigation in a virtual list (draw first, focus by identity, keep the focus, stay out from under a sticky header) is written once, next to the window that causes it, and the consumer keeps its own interactive element and its semantics.
