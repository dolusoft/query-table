Each rule has a stable ID. Every ID is covered by at least one test whose name contains it, and a test that names an unknown ID fails the build (`tests/contract-traceability.spec.ts`).

"Applied" below means the table emitted `update:query` for it. The consumer decides whether to apply the emitted query.

### C-01 The table is controlled

The table reads `query` and keeps no copy of `page`, `pageSize`, `sort` or `filters`. When the consumer changes `query` from outside (route restore, a "reset" button), the table redraws to match and emits nothing. A `page` outside `[1, pageCount]`, or a `sort` or filter `field` that matches no column, is drawn as given and never corrected.

### C-02 Quiet by default

Nothing is emitted on mount. Changing `rows`, `totalRows`, `columns` or `query` emits nothing and does not change the page.

### C-03 Inputs are never mutated

The table never writes to `query`, `columns` or `rows`. The query it emits is a new object whose `filters` array and rule objects are new too; none of them is shared with the props.

### C-04 One action, one update

A user action produces at most one `update:query`. An action that would produce a query deeply equal to the current one (the same sort chosen again, the same page size, `foo` retyped as `foo,`) emits nothing.

### C-05 Paging

`setPage`, `nextPage` and `previousPage` emit reason `page` and change only `page`. When the total is known the page is clamped to `[1, pageCount]`; `nextPage` does nothing on the last page and `previousPage` does nothing on page 1.

### C-06 Page size

`setPageSize(n)` emits one update with reason `pageSize`, `pageSize: n` and `page: 1`. Values below 1 or not whole numbers are ignored.

### C-07 Header sort

A header click on a sortable column emits reason `sort`. The first click sorts ascending, the next on the same column descending, and so on. The page is kept. A click does nothing when the table or the column is not sortable.

### C-08 Sort from the filter menu

`setSort(direction)` from the `filter-menu` slot emits reason `sort` with that direction, and keeps the page. It does nothing under the same condition as a header click (C-07): when the table or the column is not sortable, which the slot's `sortable` flag reports.

### C-09 Typing applies a filter after the debounce

Text typed into a filter input is applied `filterDebounce` milliseconds after the last key: reason `filter`, `page: 1`, and only the rules of that column are replaced. Several keystrokes make one update.

### C-10 Other rules pass through

Rules of other columns, of hidden columns and of fields that match no column are kept as they are when one column's filter changes.

### C-11 Emptying an input applies at once

Emptying a filter input does not wait for the debounce. The rules of that column are removed.

### C-12 Enter and zero debounce

Enter in a filter input applies that input now. With `filterDebounce: 0` every keystroke applies synchronously.

### C-13 flushPendingFilters

`flushPendingFilters()` applies every typed-but-pending filter. The updates are emitted before the call returns.

### C-14 Pending filters go first

A pending filter is applied before a page size change or a sort. The action is built on the result, so the consumer sees a `filter` update followed by the action's update, the second one containing the first one's filters. A page action (`setPage`, `nextPage`, `previousPage`) is dropped when applying the pending filter changed the filters: the page asked for belongs to the old filters, so the consumer sees one `filter` update, on page 1. A pending text that changes no filter does not drop it. Clear all does not apply what is pending, it discards it (C-22).

### C-15 Operator shortcuts

In a text column the table turns shortcuts into clean rules: `*foo*` Contains, `foo*` StartsWith, `*foo` EndsWith, `!foo` NotEqual, `!*foo*` NotContains, `!foo*` and `!*foo` NotContains, `a,b` two rules. `*`, `!`, `!*` and empty segments make no rule. A segment without an operator uses the condition picked in the menu, `Contains` by default. The text in the input is never rewritten while the user types, and shortcuts never reach `query`.

### C-16 Value types

Number and integer columns give number values, bool columns give boolean values, date and datetime columns give string values. Their default condition is `Equal`. A bool column is a select, and picking an option applies at once. Text that is not a number makes no rule.

### C-17 Several rules for one field

Rules of one `field` combine with OR, or with AND when all of them are negative (`NotEqual`, `NotContains`). Rules of different fields combine with AND. The table only produces the rules; evaluating them is the server's job.

### C-18 The input follows outside changes

When `query.filters` changes from outside, the input and the condition label show the new rules. A change the table itself emitted (the echo) leaves the input text untouched, so the caret and the typed shortcut stay. This holds when the consumer answers late: an echo of an earlier emit never overwrites what the user has typed since. Removing the rules from outside empties the input and removes the label.

### C-19 An ignored update changes nothing

If the consumer does not apply an emitted query, the table keeps drawing the old one and the text typed in the input stays.

### C-20 Picking a condition

`setCondition(condition)` from the `filter-menu` slot applies the filter when the input has a value. Without a value the pick only waits for one and emits nothing. `setCondition(null)` clears the filter.

### C-21 Clearing one column

`clear()` from the `filter-menu` slot removes the rules of that column only (reason `filter`, `page: 1`). The sort is left alone.

### C-22 Clearing all filters

The clear-all button removes every rule and nothing else: reason `reset`, `page: 1`, `pageSize` and `sort` kept. It is disabled while there is no filter and nothing typed. The button sits in the first utility column of the header (the right panel column, else the subtable column), so a table with neither has no such button.

### C-23 Page count and neighbours

`pageCount` is `ceil(totalRows / pageSize)` (at least 1), or `null` when `totalRows` is unknown. `canPrevious` is `page > 1`. `canNext` is `page < pageCount`, or `rows.length >= pageSize` when the total is unknown.

### C-24 Rows do not depend on the total

Rows are drawn whatever `totalRows` says. The empty state (`data-empty`, the `empty` slot) comes from `rows.length === 0` alone.

### C-25 Pagination block

The `bh-pagination` block is drawn when `pagination` is not `false`, the `pagination` slot is given, and there are rows, a positive `totalRows` or `pagination.alwaysShow`. With `pagination: false` no `page` or `pageSize` update is ever emitted.

### C-26 Row expansion

With `hasSubtable` a button per row shows the `subtable` slot under it. The state is keyed by `rowKey`, or by row index when there is none, and then resets when `rows` changes. The same key identifies the row in the DOM, so with `rowKey` a row keeps the state of the components in its `subtable` slot when `rows` reorder; without it rows are matched by index. A string `rowKey` is a direct property read (`row[rowKey]`), not a dotted path: use the function form for a nested value. Keys must be unique among the rows. A row with `isExpanded` set seeds its state when `rows` changes. `collapseAll()` closes every row. The button works for rows that have an `id`.

### C-27 Cell slots

`cell-<field>` renders the cells of one column and receives `row`, `rowIndex`, `column` and `cellValue`. A column without that slot draws its value as text (C-30). The table cancels no click inside a row, so a checkbox or a link in a cell slot keeps its default action, and the click still bubbles to the consumer.

### C-28 Context menu

Right-clicking a cell emits `cellContextMenu` with `event`, `row`, `column`, `cellValue`, `rowIndex` and `columnIndex` (an index into `columns`), and suppresses the browser menu.

### C-29 Hidden columns

A column with `hide` is neither in the header nor in the body or footer. Its rules in `query` still apply.

### C-30 Cell text

Cell text is the value as a string, whole: the table never cuts it and sets no `title`. A missing value draws nothing. A column with `html` renders its text as HTML. The table does not sanitize that markup: pass trusted HTML, or sanitize it before it reaches `rows`. Values are read from dotted paths.

### C-31 No styling

The table ships no CSS, takes no styling props and writes no inline style except `width` on the header cell of a column that defines it.

### C-32 State attributes

State is exposed as `data-*` attributes (the full list is in the DOM contract below): `data-loading`, `data-empty`, `data-filtered` and `data-sorted` on the root; `data-field`, `data-type`, `data-sort`, `data-sortable`, `data-filtered` on header cells; `data-field`, `data-type` on body cells; `data-row-index`, `data-expanded` on rows; `data-page`, `data-page-size` on the pagination block. `aria-sort` follows the sorted header.

### C-33 Exposed surface

A template ref exposes `collapseAll` and `flushPendingFilters` and nothing else.

### C-34 Filter menu slot

The table draws no popover and no tooltip. The `filter-menu` slot renders right after the filter input, as its sibling, and receives `column`, `rules`, `condition`, `conditions`, `setCondition`, `clear`, `sortable`, `sortDirection`, `setSort` and `trigger`. `trigger` is a component that renders one `button.bh-filter-button` and merges the attributes it is given, so it can sit inside a popover trigger. The component stays the same across renders, and its `aria-label` follows the current `title` of the column. Without the slot there is no filter button.

### C-35 Date filter slot

The `filter-datetime` slot replaces the date input. Its `updateValue(text)` applies like typing does.

### C-36 Right panel

With `hasRightPanel` a button per row emits `rowRightPanelClick` with the row.

### C-37 Footer rows

`footerRows` are drawn in a `tfoot`, one cell per visible column, whatever `totalRows` is.

### C-38 Loader and empty slots

The `loader` slot is shown while `loading`, the `empty` slot when there are no rows and the table is not loading.

### C-39 Column types

`type` is read case-insensitively and defaults to `string`.

### C-40 DOM contract

Everything the table renders uses only the classes and attributes listed in the DOM contract below, and each of them is rendered by some state of the table.

### C-41 Skin selectors

The test skin selects only classes and attributes of the DOM contract (besides shadcn and Tailwind classes it applies through `@apply`).

### C-42 Several rules on a column that is not text

A number, integer, date, datetime or bool column has one input and the input holds one value. When `query.filters` holds several rules for such a column (`age > 20` and `age < 40`), the input is read-only and shows the count, `(2)`, and the condition label shows the first condition with the same count. A bool select is disabled. Nothing is emitted and no rule is dropped. The clear action of the column and clear all remove the rules. Picking a condition from the menu, or an `updateValue` of the `filter-datetime` slot, is an explicit edit: it replaces the rules with one (the first rule's value for a pick), and `filter-datetime` receives an empty `value` while the rules stand. Text columns write several rules as `a,b` and are not affected.

### C-43 A rule the shortcuts cannot say

The input shows an outside rule as the text that reads back as it. A rule whose value has a star, a comma or a leading `!` and whose condition is `Equal` (or another condition without a shortcut) has no such text: the input shows the value as it is (`a*`), and nothing is emitted. This is a known limit, kept on purpose: there is no escape syntax. The rule stays in `query` until the user edits the input, and the text is then read as shortcuts (`a*` is `StartsWith` `a`), so it replaces the rule.
