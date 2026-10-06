Each rule has a stable ID. Every ID is covered by at least one test whose name contains it, and a test that names an unknown ID fails the build (`tests/repo/contract-traceability.spec.ts`).

"Applied" below means the table emitted `update:query` for it. The consumer decides whether to apply the emitted query.

A `Source:` line under a rule says where its behavior comes from in v3 (ADR 0004): `tanstack` when TanStack Table does it through its options, `own` when the core plugins or the Vue layer do it, both when an override adjusts TanStack. A test may carry the matching `[tanstack]` or `[own]` tag. Where TanStack's default differs from a rule, the override is:

| Rule | TanStack default | Override |
| --- | --- | --- |
| C-05 paging | 0-based `pageIndex`; next page allowed when the row count is unknown | 1-based `page` ↔ 0-based index; `pageCount` from the total, or from a full page when it is unknown (C-23) |
| C-06 page size | `setPageSize` keeps the top row and lifts sizes below 1 to 1 | the plugin's action sets `pageSize` and `page: 1` and ignores sizes that are not whole; the Vue layer validates `setPageSize(n)` before calling TanStack |
| C-07 header sort | `sortDescFirst` can start descending; `toggleSorting` reads the next direction from the drawn state | `sortDescFirst: false`, single sort; `column.toggleQuerySorting()` steps asc → desc → none from the base query, so two toggles in a tick are two steps |
| C-03, C-10, C-17 rule order | one value per column | the filter value is the field's `FilterRule[]` with a no-op `filterFn`; `replaceRules` keeps rule order and unknown fields |
| server data | client-side row models | `manualSorting`, `manualPagination`, `manualFiltering: true` (C-61) |
| C-56 cursor paging | `pageIndex` and `pageCount` count pages | the position is always "here": `pageIndex` 1 or 0 by the previous cursor, `pageCount` one more by the next one; a ±1 step becomes a cursor request |
| C-58 global search | the global filter filters rows on the client | `globalFilteringFeature` in manual mode; its slice is projected from `query.search` and a change emits the query |
| C-59 row selection | the table keeps the selection | the slice is controlled: `state.rowSelection` is the consumer's, `onRowSelectionChange` tells the consumer |
| C-67 column visibility | TanStack keeps `columnVisibility` | the slice is `{ [field]: !hide }` of `columns`; `onColumnVisibilityChange` emits `update:columns` |
| C-69 column order | TanStack keeps `columnOrder`; `column.pin('end')` appends to the region | the slices are projected from `columns` (order, `pinned`); `onColumnOrderChange` / `onColumnPinningChange` emit `update:columns`; inside a region the array order wins |
| C-71 right pinning | `columnPinningFeature` computes offsets from `getSize()` | the `end` region gives the order only; `--qt-pin-right` is measured like `--qt-pin-left` (ADR 0004, D3) |
| C-74 row pinning | TanStack keeps `rowPinning`; `keepPinnedRows` shows pinned rows of other pages; `row.pin` moves a row already at that position to the end | the slice is controlled (`state.rowPinning` is the consumer's, `onRowPinningChange` tells it); in server mode the row models hold only `rows`, so a key outside `rows` is not drawn; pinning a row to the position it has emits nothing |

### C-01 The table is controlled

The table reads `query` and keeps no state of its own for `page`, `pageSize`, `sort` or `filters`. The only thing it holds is the query it last emitted, and only until the consumer's update arrives or the current tick ends, so that two updates of one action stack (C-14). When the consumer changes `query` from outside (route restore, a "reset" button), the table redraws to match and emits nothing. A `page` outside `[1, pageCount]`, or a `sort` or filter `field` that matches no column, is drawn as given and never corrected.

Source: own

### C-02 Quiet by default

Nothing is emitted on mount. Changing `rows`, `totalRows`, `columns` or `query` emits nothing and does not change the page.

Source: own

### C-03 Inputs are never mutated

The table never writes to `query`, `columns` or `rows`. The query it emits is a new object whose `filters` array and rule objects are new too; none of them is shared with the props.

Source: own

### C-04 One action, one update

A user action produces at most one `update:query` of its own. A pending filter applied first is a separate update that the action causes (C-14), so an action can be preceded by one `filter` update; that is the only case of two. Text pending in several inputs is applied together, in that one `filter` update. An action that would produce a query deeply equal to the current one (the same sort chosen again, the same page size, `foo` retyped as `foo,`) emits nothing.

Source: own

### C-05 Paging

`setPage`, `nextPage` and `previousPage` emit reason `page` and change only `page`. When the total is known the page is clamped to `[1, pageCount]`; `nextPage` does nothing on the last page and `previousPage` does nothing on page 1.

Source: tanstack, own

### C-06 Page size

`setPageSize(n)` emits one update with reason `pageSize`, `pageSize: n` and `page: 1`. Values below 1 or not whole numbers are ignored.

Source: own

### C-07 Header sort

A header click on a sortable column emits reason `sort`. The click cycles ascending, descending, none: the first click sorts ascending, the next on the same column descending, the next removes the sort: `sort: null` means no sort at all, since the query holds a single sort. A click on a column that is not the sorted one starts at ascending. The page is kept. A click does nothing when the table or the column is not sortable.

Source: tanstack, own

### C-08 Sort from the filter menu

`setSort(direction)` from the `filter-menu` slot emits reason `sort` with that direction, and keeps the page. It does nothing under the same condition as a header click (C-07): when the table or the column is not sortable, which the slot's `sortable` flag reports.

Source: tanstack, own

### C-09 Typing applies a filter after the debounce

Text typed into a filter input is applied `filterDebounce` milliseconds after the last key: reason `filter`, `page: 1`, and only the rules of that column are replaced. Several keystrokes make one update.

Source: own

### C-10 Other rules pass through

Rules of other columns, of hidden columns and of fields that match no column are kept as they are when one column's filter changes.

Source: own

### C-11 Emptying an input applies at once

Emptying a filter input does not wait for the debounce. The rules of that column are removed.

Source: own

### C-12 Enter and zero debounce

Enter in a filter input applies that input now. With `filterDebounce: 0` every keystroke applies synchronously.

Source: own

### C-13 flushPendingFilters

`flushPendingFilters()` applies every typed-but-pending filter in one `filter` update, on page 1; an input whose text changes no rule is left out of it. The update is emitted before the call returns.

Source: own

### C-14 Pending filters go first

A pending filter is applied before a page size change or a sort. The action is built on the result, so the consumer sees a `filter` update followed by the action's update, the second one containing the first one's filters. A page action (`setPage`, `nextPage`, `previousPage`) is dropped when applying the pending filter changed the filters: the page asked for belongs to the old filters, so the consumer sees one `filter` update, on page 1. A pending text that changes no filter does not drop it. Clear all does not apply what is pending, it discards it (C-22).

Source: own

### C-15 Operator shortcuts

In a text column the table turns shortcuts into clean rules: `*foo*` Contains, `foo*` StartsWith, `*foo` EndsWith, `!foo` NotEqual, `!*foo*` NotContains, `!foo*` and `!*foo` NotContains, `a,b` two rules. `*`, `!`, `!*` and empty segments make no rule. A segment without an operator uses the condition picked in the menu, `Contains` by default. The text in the input is never rewritten while the user types, and shortcuts never reach `query`.

Source: own

### C-16 Value types

Number and integer columns give number values, bool columns give boolean values, date and datetime columns give string values. Their default condition is `Equal`. A bool column is a select, and picking an option applies at once. Text that is not a number makes no rule, and in an integer column neither does a number with a fraction (`2.5`); `2.0` is the whole number `2`.

Source: own

### C-17 Several rules for one field

Rules of one `field` combine with OR, or with AND when all of them are negative (`NotEqual`, `NotContains`). Rules of different fields combine with AND. The table only produces the rules; evaluating them is the server's job.

Source: own

### C-18 The input follows outside changes

When `query.filters` changes from outside, the input and the condition label show the new rules. A change the table itself emitted (the echo) leaves the input text untouched, so the caret and the typed shortcut stay. This holds when the consumer answers late: an echo of an earlier emit never overwrites what the user has typed since. The table remembers the last eight emits of a column and only counts the older ones that are still unanswered: answers come in order, so the first answers that match nothing remembered are taken as those, and neither they nor the emits still in flight touch the input. Any other change is an outside change. Removing the rules from outside empties the input and removes the label.

Source: own

### C-19 An ignored update changes nothing

If the consumer does not apply an emitted query, the table keeps drawing the old one and the text typed in the input stays. The table remembers its own last emit only until the tick ends (C-01); after that every action builds on the `query` the consumer holds. A consumer that applies an emit late, after an `await` for example, makes the next action build on the old query and lose the earlier change. Apply the emitted query to your own copy in the same tick, which `v-model:query` does, and fetch with it afterwards.

Source: own

### C-20 Picking a condition

`setCondition(condition)` from the `filter-menu` slot applies the filter when the input has a value. Without a value the pick only waits for one and emits nothing. `setCondition(null)` clears the filter.

Source: own

### C-21 Clearing one column

`clear()` from the `filter-menu` slot removes the rules of that column only (reason `filter`, `page: 1`). The sort is left alone.

Source: own

### C-22 Clearing all filters

The clear-all button removes every rule and nothing else: reason `reset`, `page: 1`, `pageSize` and `sort` kept. It is disabled while there is no filter and nothing typed. Text typed into a column that then leaves `columns` goes with it: it no longer enables the button and does not come back when the column does. The button sits in the first utility column of the header (the right panel column, else the subtable column), so a table with neither has no such button. The action does not depend on those columns: the `toolbar` slot always receives `canClearFilters` (the button's enabled state) and `clearFilters()` (the button's click).

Source: own

### C-23 Page count and neighbours

`pageCount` is `ceil(totalRows / pageSize)` (at least 1), or `null` when `totalRows` is unknown. `canPrevious` is `page > 1`. `canNext` is `page < pageCount`, or `rows.length >= pageSize` when the total is unknown.

Source: tanstack, own

### C-24 Rows do not depend on the total

Rows are drawn whatever `totalRows` says. The empty state (`data-empty`, the `empty` slot) comes from `rows.length === 0` and `loading` (C-38), never from `totalRows`.

### C-25 Pagination block

The `qt-pagination` block is drawn when the `pagination` slot is given and there are rows, a positive `totalRows` or `pagination.alwaysShow`. Without the slot nothing is drawn, and the page actions have nobody to call them.

### C-26 Row expansion

With `hasSubtable` a button per row shows the `subtable` slot under it. The state is keyed by `rowKey`, or by row index when there is none, and then resets when `rows` changes. With `rowKey`, only keys of the rows currently in `rows` are kept: a row that leaves `rows` (another page) and comes back is closed. The same key identifies the row in the DOM, so with `rowKey` a row keeps the state of the components in its `subtable` slot when `rows` reorder; without it rows are matched by index. A string `rowKey` is a direct property read (`row[rowKey]`), not a dotted path: use the function form for a nested value. Keys must be unique among the rows. A row may carry an optional boolean `isExpanded` field (documented on `rows` in `TableProps`) that seeds the state every time `rows` changes, on mount included: `true` opens the row, `false` closes it, and a row without the field, or with a value that is not a boolean, keeps its state. The table never writes the field and never reads it again until `rows` changes; the user's toggles stand in between. The seed applies only with `hasSubtable`, and is read after the pruning above, so a row that leaves `rows` and comes back with `isExpanded: true` is open. `collapseAll()` closes every row and `expandAll()` opens the rows given (C-55). The button works for every row; the row needs no `id`.

### C-27 Cell slots

`cell-<field>` renders the cells of one column and receives `row`, `rowIndex`, `column` and `cellValue`, and `rowPinned` and `pinRow` (C-74). A column without that slot draws its value as text (C-30). The table cancels no click inside a row, so a checkbox or a link in a cell slot keeps its default action, and the click still bubbles to the consumer.

### C-28 Context menu

When the consumer listens to `cellContextMenu` (with or without the `.once` modifier, which Vue passes as `onCellContextMenuOnce`), right-clicking a cell emits it with `event`, `row`, `column`, `cellValue`, `rowIndex` and `columnIndex` (an index into `columns`), and suppresses the browser menu. Without a listener the table emits nothing and the browser menu opens. One listener on the `tbody` serves every cell, so `event.currentTarget` is the `tbody`: the payload has no cell element. To find it, walk up from `event.target` through `closest('td')` until the `td`'s row is a direct child of this table's `tbody`; a plain `event.target.closest('td')` is wrong when slot content holds a nested table, because it returns the inner `td`. Only data cells count; the utility cells, the `subtable` row and the `empty` row emit nothing and keep the browser menu. A table nested in a `subtable` slot emits for its own cells only. A table nested in a `cell-<field>` slot emits for its own cell, and then the outer table emits for the outer cell that holds it (the same event, so two `cellContextMenu` events in all).

### C-29 Hidden columns

A column with `hide` is neither in the header nor in the body or footer. Its rules in `query` still apply. In v3 the hiding is TanStack's column visibility, projected from `hide` (C-67).

### C-30 Cell text

Cell text is the value as a string, whole: the table never cuts it and sets no `title`. A missing value draws nothing. The text is escaped: the table never renders a value as HTML. Values are read from dotted paths.

### C-31 No styling

The table ships no CSS and takes no styling props. It writes three inline styles and no other: `width` on the header cell of a column that defines it (or of the column being dragged, C-49), the custom property `--qt-pin-left` on a cell pinned to the left (C-47) and `--qt-pin-right` on a cell pinned to the right (C-71). The custom property carries a measured number; `position: sticky`, `z-index` and backgrounds are the consumer's CSS.

### C-32 State attributes

State is exposed as `data-*` attributes (the full list is in the DOM contract below): `data-empty` and `data-loading` on the root; `data-field`, `data-sort`, `data-sortable`, `data-filtered` on header cells; `data-field` on body and footer cells; `data-pinned` on the cells of a pinned column (`right` for the right side) and on the utility cells while some column is pinned to the left; `data-dragging` and `data-drop` on header cells while a column is dragged (C-73); `data-row-index`, `data-expanded` on rows; `data-pinned-row` on a pinned row and on its subtable row (C-74). `aria-sort` follows the sorted header.

### C-33 Exposed surface

A template ref exposes `collapseAll`, `expandAll` (C-55), `focusFilter` (C-54) and `flushPendingFilters` (C-13) and nothing else. Each one is an action that state cannot express (P10): none of them emits `update:query`, except `flushPendingFilters`, which applies what was typed.

### C-34 Filter menu slot

The table draws no popover and no tooltip. The `filter-menu` slot renders right after the filter input, as its sibling, and receives `column`, `rules`, `condition`, `conditions`, `setCondition`, `clear`, `sortable`, `sortDirection`, `setSort` and `trigger`. `trigger` is a component that renders one `button.qt-filter-button` and merges the attributes it is given, so it can sit inside a popover trigger. The component stays the same across renders, and its name (`aria-label` and `title`, from `labels.filterOptions`) follows the current `title` of the column. Without the slot there is no filter button. A `bool` column does not render the slot at all: its filter is a select with no condition to pick, so it has no filter button and no menu (the header click still sorts it).

### C-35 Date filter slot

The `filter-datetime` slot replaces the date input. Its `updateValue(text)` applies like typing does.

### C-36 Right panel

With `hasRightPanel` a button per row emits `rowRightPanelClick` with the row.

### C-37 Footer rows

`footerRows` are drawn in a `tfoot`, one cell per visible column, whatever `totalRows` is.

### C-38 Empty and loading

The empty state (`data-empty` on the root, the `empty` slot in a `tr.qt-empty-row`) is shown when there are no rows and `loading` is off. While `loading` is on it is not shown, with rows or without: a table that is fetching is not empty yet. The `loading` slot (C-52) takes its place.

### C-39 Column types

`type` is read case-insensitively and defaults to `string`.

### C-40 DOM contract

Every class the table renders and every `data-*` attribute and `aria-sort` it sets is listed in the DOM contract below, and each listed entry is rendered by some state of the table; the entries marked `addedBy` in the list need the `selection` prop (`C-64`, checked by C-66) or a 3.1 feature (checked by C-72). Plain HTML and ARIA attributes (`type`, `scope`, `colspan`, `disabled`, `aria-label`, `aria-expanded`) are not part of the list: a skin must not select them.

### C-41 Skin selectors

The test skin selects only classes and attributes of the DOM contract (besides shadcn and Tailwind classes it applies through `@apply`).

### C-42 Several rules on a column that is not text

A number, integer, date, datetime or bool column has one input and the input holds one value. When `query.filters` holds several rules for such a column (`age > 20` and `age < 40`), the input is read-only and shows the count, `(2)`, and the condition label shows the first condition with the same count. A bool select is disabled. Nothing is emitted and no rule is dropped. The clear action of the column and clear all remove the rules. Picking a condition from the menu, or an `updateValue` of the `filter-datetime` slot, is an explicit edit: it replaces the rules with one (the first rule's value for a pick), and `filter-datetime` receives an empty `value` while the rules stand. Text columns write several rules as `a,b` and are not affected.

### C-43 A rule the shortcuts cannot say

The input shows an outside rule as the text that reads back as it. A rule whose value has a star, a comma or a leading `!` and whose condition is `Equal` (or another condition without a shortcut) has no such text: the input shows the value as it is (`a*`), and nothing is emitted. This is a known limit, kept on purpose: there is no escape syntax. The rule stays in `query` until the user edits the input, and the text is then read as shortcuts (`a*` is `StartsWith` `a`), so it replaces the rule.

### C-44 Labels

Every text the table writes for people comes from the `labels` prop: the names of the clear-all, expand, right panel and filter buttons, the names of the filter inputs, resize handles and reorder handles and the options of a bool filter. An entry left out keeps its English default (`'Clear all filters'`, `'Expand row'`, `'Open right panel'`, `` `Filter ${name}` ``, `` `Filter options for ${name}` ``, `` `Resize ${name}` ``, `` `Move ${name}` ``, `'All'`, `'True'`, `'False'`). A label function receives the column name: its `title`, else its `field`. No component template holds a literal `aria-label`.

### C-45 Header semantics

Every header cell of a column is a `th` with `scope="col"`, and so is the utility cell that holds the clear-all button. A utility header cell with nothing in it (the right panel or subtable column without that button) is an empty `td`: an empty `th` would be a header without a name. A sortable header is a `button` inside the `th` whose text is the column `title`; a column without a `title` gives the button its `field` as `aria-label`, so the button always has a name.

### C-46 Pinned columns come first

A visible column with `pinned: 'left'` is drawn before the columns that are not pinned, in the header, the body and the footer. Pinned columns keep their order among themselves, and so do the others. A hidden pinned column is not drawn (C-29). `columnIndex` of `cellContextMenu` stays the index into `columns`. The utility cells (right panel, expand) stay in front of every column, and while some visible column is pinned to the left they are pinned too. Columns with `pinned: 'right'` are drawn after every other column (C-69).

### C-47 Pin offsets

Every cell of a column pinned to the left (header, body, footer) and, while some column is pinned to the left, every utility cell (the footer's cell that spans them included) carries `data-pinned` and the inline custom property `--qt-pin-left`: the sum, in pixels, of the rendered widths of the pinned header cells before it, so the first is `0px`. The widths are measured, not read from `Column.width`. They are measured again, in one batch after layout, whenever a header cell changes size (a resize, a font that loads, a container that narrows) and after the drawn columns change (order, visibility, pinning on either side, utilities). The table measures nothing while no column is pinned (either side) or resizable, and stops on unmount. It writes no `position`, `left`, `z-index` or background: with `position: sticky; left: var(--qt-pin-left)` in the consumer's CSS the pinned cells of header, body and footer stay in line while the table scrolls sideways.

### C-48 Resize handle

With the table's `resizable` and the column's `resizable` not `false`, the header cell ends with a `div.qt-resize-handle`, outside the sort button and the filter row. It is focusable (`tabindex="0"`), `role="separator"` with `aria-orientation="vertical"`, named by `labels.resizeColumn`, and reports the width in pixels: `aria-valuenow` is the rendered width (the preview during a drag), `aria-valuemin` the column's `minWidth` (default 40), `aria-valuemax` its `maxWidth` or, without one, the larger of the width and the table's width. Nothing on the handle sorts: pointer, click and keys on it never emit `update:query`. The reorder handle (C-73) is the first child of the header cell; the resize handle stays the last.

### C-49 Dragging a handle

Pressing the primary button on a handle focuses it and captures the pointer. While it moves, the header cell's inline `width` shows the preview, at most once per animation frame; nothing is emitted. The width follows the pointer: moving it to the right widens the column, except on a right-pinned column, where moving it to the left does (C-71). Releasing emits one `columnResize` with `field` and the new `width`: whole pixels, clamped to `minWidth` and `maxWidth`. A `minWidth` or `maxWidth` that is not a finite number above `0` (`''`, `NaN`, `0`, a negative) counts as unset: the minimum is then 40 and there is no maximum, so a bad value never clamps a width to 0. The default minimum gives way to a smaller `maxWidth`; an explicit `minWidth` above `maxWidth` wins, so the column keeps its `minWidth`. `aria-valuemin` and `aria-valuemax` (C-48) follow the same limits. A release at the starting width emits nothing. Escape, or a lost pointer capture, ends the drag without an event and drops the preview. The table keeps no width after the drag: the column shows `Column.width`, so a consumer that does not write the width back sees the column return.

### C-50 Keyboard and autofit

On a focused handle, ArrowRight and ArrowLeft emit `columnResize` with the rendered width plus or minus 10 pixels, 50 with Shift, clamped as in C-49; on a right-pinned column the two keys swap (C-71). Enter and a double click emit the autofit width: the widest rendered content of the column among the header label and its cells in the rows given (not the server's other rows), with the cell's padding and border, rounded up and clamped. A width equal to the rendered one emits nothing. Enter departs from the WAI-ARIA window splitter pattern, where Enter collapses the pane and restores it: a column has no collapsed state to restore (hiding is `Column.hide`, the consumer's), and fitting to content is what a double click on a column edge does in spreadsheets, so Enter is its keyboard equivalent. The table recommends `table-layout: fixed` with a table width (for example `width: max-content; min-width: 100%`): with the automatic layout the browser may draw a column wider than its header width.

### C-51 Header slot

The `header-<field>` slot replaces the label of one column header: the sort button or the title. It receives `column`, `sortDirection`, `sortable` and `toggleSort`, which sorts as a header click does (C-07) and does nothing when `sortable` is false. The `th` stays with its attributes (`data-sort`, `aria-sort`, `data-pinned`, the width), and so do the filter row and the resize handle. The slot is not drawn inside a `button`, so a control in it is never a nested button.

### C-52 Loading state

`loading` tells the table that the consumer is fetching; the table never sets it. While it is on, the root carries `data-loading` and `aria-busy="true"`, and both are absent otherwise. The rows given stay drawn as they are: nothing is cleared, remounted or reordered, so focus and the state of slot content are kept. The empty state is not shown (C-38). With a `loading` slot the body ends with one `tr.qt-loading-row` whose single cell spans every column, utilities included, and holds the slot; without the slot nothing is drawn. The row is ordinary table markup in the body: placing it over the rows (for example `position: absolute` inside a `tbody` with `position: relative`) is the consumer's CSS, and the table writes no inline style for it. The table blocks no interaction while loading: sorting, filtering, paging and the row buttons work and emit as usual, and a consumer that wants to block them does so in its CSS or its handlers. Turning `loading` on or off emits nothing and re-renders only the root and the body.

### C-53 Filter parser

`parseFilterInput(text, column, condition?)`, exported from the package entry, returns the `FilterRule[]` the table emits when `text` is typed into the filter input of `column` and applied: the shortcuts of C-15 for a text column, the coercion of C-16 for the others, and `condition` (the menu pick, the type's default when left out) for a segment without an operator. Input that gives no rule returns `[]` and never throws: blank text, only operators (`*`, `!`, `!*`), a number column's text that is not a finite number, an integer column's text that is not a whole number, a bool column's text other than `true` and `false`. Date text is not validated. The function is pure: it imports no Vue and no DOM, and it does not write to `column`.

Source: own

### C-54 focusFilter

`focusFilter(field)` moves focus to the filter of the column with that `field` in this table's header: its filter input or select, or with a `filter-datetime` slot the first focusable element the slot draws. It returns `true` when that element took focus, and `false` when there is none (the table or the column is not filterable, the column is hidden, no column has that `field`, the slot draws nothing focusable) or it cannot take focus (a disabled bool select, C-42). It emits nothing and opens no menu. A table nested in a slot is not searched.

### C-55 expandAll

`expandAll()` opens the rows currently in `rows`, by their key (C-26), and does nothing without `hasSubtable`. It never asks for other rows: rows that arrive later (another page, a new answer) are not opened, and with `rowKey` the rows that leave `rows` are dropped as usual. It emits nothing.

### C-56 Cursor paging

A query with a `cursor` key is in cursor mode: the server pages by opaque cursors and the total may be unknown. `cursor: null` asks for the first page, `{ token, direction }` for the page on that side of the one shown. The consumer passes the cursors of the page shown (`{ next, prev }`, `null` where there is no page): `next` from its server, `prev` from its server or from its own stack of earlier cursors; the table does not tell them apart. A token is opaque: it may hold JSON or base64 and has no length limit, and only the server reads inside it. `direction: 'prev'` means the consumer asks for the page before the one shown with that cursor; mapping the direction to the server's is the consumer's. `nextPage` and `previousPage` emit reason `page` with the cursor on that side and change nothing else; they do nothing when that side has no cursor, and so does a jump to a page number. `canNext` and `canPrevious` say whether that side has a cursor.

Source: tanstack, own

### C-57 Cursor mode starts over

In cursor mode a sort, a filter change, a page size change, a search and clearing all filters emit `cursor: null`: a cursor belongs to the order, filters and size it was answered for. In page mode the same actions go to `page: 1`, except a sort, which keeps the page (C-07). Other inputs that invalidate a cursor (a time range, a set of sources) are outside the query: the consumer sets `cursor: null` itself when they change. A server that fixes the order of a cursor may ignore `sort`; the consumer then marks the columns `sortable: false`, so no header offers a sort that does nothing.

Source: own

### C-58 Global search

`search` is the text of a global search; the server decides what it matches. Setting it emits reason `search` with the text as given, spaces included, and `page: 1` (C-57 in cursor mode). Empty text removes the `search` key: an emitted query never holds `search: ''`, and an absent key and `''` mean the same. Setting the text the query already has emits nothing. A pending filter is applied first (C-14). The core emits each text it is given; debouncing typed text is the Vue layer's, with a configurable delay, and a delay of `0` turns it off for a consumer that debounces on its own, so the text is never debounced twice.

Source: tanstack, own

### C-59 Controlled row selection

The selection is the consumer's: a map of row key to `true`, passed in and drawn as given. Selecting or unselecting a row tells the consumer the new map and changes nothing until the consumer passes it back. Keys of rows that are not shown stay in the map. Selection never emits a query.

Source: tanstack

### C-60 Unknown query keys pass through

Keys of the query the protocol does not know, and properties of a rule besides `field`, `condition` and `value`, are kept as they are in every query the table emits, and they count when two queries are compared (C-04). The JSON Schema of the query (`@dolusoft/query-protocol/query.schema.json`) allows them.

Source: own

### C-61 The plugin owns the query handlers

`serverQueryFeature` owns TanStack's `onSortingChange`, `onColumnFiltersChange`, `onPaginationChange` and `onGlobalFilterChange`, and pins `manualSorting`, `manualFiltering`, `manualPagination` (all `true`), `sortDescFirst: false` and `enableMultiSort: false`. Table options that replace any of them make the table throw when it is built, naming them: the query would otherwise stop being the consumer's.

Source: own

### C-62 Dispose and isolation

Each table keeps its plugin state to itself: an action on one table never flushes, stacks on or emits for another. Disposing a table clears its pending debounce timers and makes it inert: nothing it does later, a late timer included, emits an update or brings its state back.

Source: own

### C-63 Typed search is debounced

The `toolbar` slot receives the search text to show (`search`: the text being typed, else `query.search`, else `''`), `setSearch` and `applySearch`. Text set with `setSearch` is applied `searchDebounce` milliseconds after the last call (default `300`), in one `search` update (C-58); blank text and a `searchDebounce` of `0` apply at once, so a consumer that debounces on its own is not debounced twice. `applySearch` applies a pending text now (Enter). A pending text is applied before a sort or page action, and a page action that it changed the query for is dropped, as with a pending filter (C-14). The typed text stays shown until the query answers with a new search.

Source: own

### C-64 Selection column

With a `selection` prop the table draws a column of checkboxes after the other utility columns: one per row (`qt-select-row`, its row carrying `data-selected` when selected) and one in the header (`qt-select-all`) that is checked when every row of the page is selected and indeterminate when some are. Toggling a checkbox emits `update:selection` with the new map (C-59); the header checkbox selects or deselects the rows of the page and keeps the keys of other pages. The row key is `rowKey` as a string, else the row index. Without `selection` there is no column and no event.

Source: tanstack, own

### C-65 Cursor paging controls

With a `CursorQuery` the `pagination` slot receives `cursorMode: true`, `page: 1` and `pageCount: null`; `canPrevious` and `canNext` say whether `cursors` hold a cursor on that side. `nextPage` and `previousPage` emit a `page` update with the cursor of that side (C-56) and do nothing without one; `setPage` does nothing. `setPageSize` goes back to the first page (C-57).

Source: tanstack, own

### C-66 DOM contract of the selection column

With a `selection` prop the rendered DOM still uses only the classes and attributes of the DOM contract, and the entries the contract marks `addedBy: 'C-64'` (`qt-select-row`, `qt-select-all`, `data-selected`) are rendered, each on its element. C-40 checks the same without `selection`, which is the table the 2.2.x baseline renders; the two rules together cover the whole list.

Source: own

### C-67 Column visibility

A column with `hide` is drawn nowhere (C-29); its rules in `query` still apply. `control.hide()` from the `header-<field>` or `filter-menu` slot emits one `update:columns` with reason `visibility`: a new array in which that column is a new object with `hide: true` and every other column is the consumer's object. Showing a column again is the consumer's: it writes `columns` without `hide`. Text typed into the filter of a column that is hidden stays and shows again in its input when the column comes back; text of a column that leaves `columns` goes with it (C-22). Hiding never emits `update:query`.

Source: tanstack, own

### C-68 Columns are controlled

The table never writes to `columns`. A change of visibility, order, pinning or width made in the table emits one `update:columns(columns, reason)` per user action, `reason` being `visibility`, `order`, `pin` or `resize`: the array is new, a changed column is a new object that keeps the consumer's other fields, unchanged columns are the consumer's objects, and a field set back to its default is removed (`hide`, `pinned`), never written as `false`. Nothing is emitted on mount or when `columns` changes from outside, and an action whose result equals the current columns emits nothing. A resize emits `columnResize` (C-49) and then `update:columns` with reason `resize` and the width as `${width}px`. A consumer that does not write the array back sees the old layout. None of these emits `update:query`.

Source: tanstack, own

### C-69 Column order

Columns are drawn in three regions: pinned left, not pinned, pinned right; inside each region in the order of `columns`. `control.move('left' | 'right')` moves the column one visible position inside its region and emits `update:columns` with reason `order`; at the edge of the region it does nothing, and `canMoveLeft` / `canMoveRight` say whether there is a visible column on that side in the region. A moved column is placed right before (left) or right after (right) its visible neighbour, so hidden columns keep their place among the others: `[a, h (hidden), b]` with `b` moved left gives `[b, a, h]`. Moving never changes the region; that is pinning (C-70).

Source: tanstack, own

### C-70 Column controls in slots

The `header-<field>` and `filter-menu` slots receive `control`: `pinned` (`'left'`, `'right'` or `false`), `pin(side)`, `hide()`, `canMoveLeft`, `canMoveRight` and `move(direction)`. `pin(side)` emits one `update:columns` with reason `pin` (`false` unpins); pinning to the side the column already has emits nothing. `pinned`, `canMoveLeft` and `canMoveRight` are read from the current layout when they are read: drawing a slot never computes them, and a control kept past a re-render reports the layout of now. The slots never receive a TanStack object.

Source: tanstack, own

### C-71 Right pinning

A visible column with `pinned: 'right'` is drawn after every other column, in the header, the body and the footer, in the order of `columns` (C-69). Every cell of it carries `data-pinned="right"` and the inline custom property `--qt-pin-right`: the sum, in pixels, of the rendered widths of the right-pinned header cells after it, so the last is `0px`. The widths are measured as in C-47, by the same observer. The utility cells are pinned only while some visible column is pinned to the left; with only right-pinned columns they stay in the flow. `control.pin('right')` pins a column (C-70). With `position: sticky; right: var(--qt-pin-right)` in the consumer's CSS the right-pinned cells stay at the right edge while the table scrolls sideways; one rule `[data-pinned] { left: var(--qt-pin-left); right: var(--qt-pin-right) }` serves both sides, since an unset custom property leaves the other side `auto`. A right-pinned column stays at the right edge, so it grows to the left: its resize handle (C-48) stands for its left edge. Moving the pointer to the left widens it (C-49), ArrowLeft widens and ArrowRight narrows it (C-50), as a window splitter moves. The handle stays the last child of the header cell; the consumer's CSS draws it over the cell's left edge. An LTR layout is assumed.

Source: tanstack, own

### C-72 DOM contract of 3.1

With the 3.1 features on, the rendered DOM still uses only the classes, attributes and inline styles of the DOM contract, and the entries the contract marks `addedBy: 'C-71'`, `'C-73'` and `'C-74'` are rendered, each on its element, by the state that adds it. With every 3.1 feature off the DOM is the one C-40 checks.

Source: own

### C-73 Reorder handle

With the table's `reorderable` and the column's `reorderable` not `false`, the header cell starts with a `button.qt-reorder-handle` (`type="button"`), named by `labels.moveColumn` and carrying `aria-keyshortcuts="ArrowLeft ArrowRight Home End"`. Pressing the primary button on it focuses it and captures the pointer; while it moves, the dragged header cell carries `data-dragging` and the visible header cell of the same region under the pointer carries `data-drop` (`before` or `after`, by the half the pointer is over). Nothing is emitted and nothing is moved in the DOM during the drag. Releasing emits one `update:columns` with reason `order` that places the column before or after that cell (C-69); a release where the order stays emits nothing. Escape, a `pointercancel`, a lost pointer capture or a change of `columns` from outside ends the drag without an event and drops the attributes. On a focused handle, ArrowLeft and ArrowRight move the column one visible position in its region (C-69), Home and End to the start and the end of the region; each key is one `update:columns`, and a key at the edge does nothing. A key held with Alt, Ctrl or Meta is left to the browser. When the consumer writes the new order back and the handle had the focus, the focus returns to the handle of the same column. Nothing on the handle sorts: pointer, click and keys on it never emit `update:query`. The table draws no live region: announcing the new position is the consumer's, from `update:columns`.

Source: tanstack, own

### C-74 Row pinning

The pinned rows are the consumer's: `rowPinning` is `{ top, bottom }`, row keys (`rowKey` as a string) in the order they were pinned, used with `v-model:rowPinning`. With `rowPinning` and `rowKey` given, the rows of `rows` whose key is in `top` are drawn first and those in `bottom` last, in map order, the others between them in the order of `rows`; a pinned row carries `data-pinned-row` (`top` or `bottom`), and so does its `qt-subtable-row`, which follows it. `data-row-index` stays the row's index in `rows` (C-28). A key whose row is not in `rows` is not drawn and stays in the map: the table never asks for a row. The `cell-<field>` slot receives `rowPinned` (`'top'`, `'bottom'` or `false`) and `pinRow(position)`, which emits one `update:rowPinning` with the new map (`false` unpins) and changes nothing until the consumer passes it back; pinning to the position the row has emits nothing. Without `rowKey` the prop is ignored and `pinRow` does nothing: an index is not a row identity across pages. Row pinning never emits `update:query`. A consumer that wants a pinned row on every page adds it to `rows` itself, once (keys stay unique, C-26); with an unknown total such a row counts for `canNext` (C-23).

Source: tanstack, own

### C-75 The local evaluator is separate

The local evaluator comes only from `@dolusoft/query-protocol/local`, and its Vue binding only from `@dolusoft/query-table/local`. The default entries of the three packages neither export nor import it, and no path in their built module graph reaches it. The table never filters, searches, sorts or slices the rows it is given, and it cannot tell a local source from a remote one (P1, ADR 0008).

Source: own

### C-76 Pipeline, page mode and result

`applyQuery` validates the query, validates the row values it uses, filters and searches, counts, sorts and slices. Its inputs are never written: the rows returned are the objects given, always in a new array. `totalRows` is the count after the rules and the search, independent of the page. A page past the end is empty with the same total, and the page is not corrected. `paginate: false` returns the whole ordered list and still validates `cursor`, `page` and `pageSize`. `sort: null` keeps the order of `allRows`; ties break by `key` ascending in both directions (`integer` numerically, `string` by the ordinal order of the raw value). Only page mode is evaluated: a `cursor` key, even `null`, is `cursor-not-supported`; `page` and `pageSize` are safe integers of at least 1, and the slice is computed without overflow. `slicePage` validates the paging part of a query the same way and slices rows that are already in order.

Source: own

### C-77 Structural errors

A query the evaluator does not support, or data that does not fit the dataset, is returned as a value, `{ ok: false, error }`, with one of the codes of `semantics.md` and its location fields (`path`, `field`, `rule`, `row`, `name`). The error is the first one in the validation order of the profile; query errors are found before any row is read, and there is no partial result. A query, a sort or a rule that is not a plain object is `invalid-query`. A malformed definition passed to `defineDataset`, and a broken precondition of `applyQuery` (a dataset not made by `defineDataset`, options that are not an object, a `paginate` that is not a boolean), throw `TypeError`. Unknown top-level keys that are not reserved, and extra properties of a rule, are ignored. `sorts`, `any`, `group`, `aggregates` and the conditions `IsNull` and `IsNotNull` are `unsupported-extension`. A read that throws (a `get`, or a getter met by a path read), or a value that does not fit the field type, is `invalid-data`; values are never converted. A repeated key is `duplicate-key`, even on a row that is filtered out or off the page.

Source: own

### C-78 Semantics profile

Every evaluation names a semantics profile, and there is no default: a missing or unknown profile is the error `unknown-profile`, not a throw. `tr-1` is the meaning written in `semantics.md` and never changes; a new meaning is a new profile. `profiles` lists the profiles of the build.

Source: own

### C-79 The conformance suite ships

`@dolusoft/query-protocol` publishes its conformance suite under `conformance/`: a manifest with `fixtureFormat`, `revision`, the profiles, the SHA-256 of the query schema it was written against, the SHA-256 of each data file, and for each case file its counts of active cases, withdrawn cases and runs and the SHA-256 of its bytes. A runner refuses an unknown `fixtureFormat`, a broken reference and a hash that does not match. The expected result of a case never changes while its profile lives: a wrong case is withdrawn, not edited, and every semantic change raises `revision`.

Source: own
