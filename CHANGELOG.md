# Changelog

What each 3.x release of `@dolusoft/query-protocol`, `@dolusoft/query-table-core` and `@dolusoft/query-table` added, changed and fixed. The three packages are released together under one version.

**To upgrade**, read the **Upgrade notes** of every version after yours, up to the one you install: they list each change to the markup, to an emitted `update:query`, to a public type or to behavior a skin or a backend can observe, and say what to check. A version is always the next minor or the next patch, never a major ([ADR 0019](docs/decisions/0019-release-version-policy.md)). Coming from 2.2.x, start with the [migration guide](docs/guide/migration-v3.md).

Each entry links the behavior rule it comes from (`C-nn` in [`contract/rules.md`](contract/rules.md)) and the decision record behind it, when there is one. The full API is in [`CONTRACT.md`](CONTRACT.md). The layout follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [3.18.0] - 2026-11-13

A virtual body can keep the rows in view in place while rows arrive above them.

### Added

- `virtual.keepAnchor`: while rows arrive above the view, or leave it, the first fully visible row stays at the same pixel offset; at the top, new rows show. A row that is not drawn at its new place is scrolled to from the counted heights and corrected once it is drawn. A `scrollToIndex` called after the change wins. Needs `rowKey`, and does nothing while the page prints. Off by default ([C-119](contract/rules.md#c-119-keeping-the-anchor)).

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.17.0] - 2026-10-27

A new `ip` column type filters IP addresses as addresses, with lists, negation, ranges and CIDR prefixes.

### Added

- Column type `ip`, for IPv4 and IPv6 addresses that the server compares as addresses, not as text. Its menu offers `Equal` and `NotEqual`; `filterConditions` can add `IsNull`, `IsNotNull` and `Between`, and text conditions are left out. The input reads lists and negation like a number column: `a,b` gives one `Equal` rule each, `!a,!b` one `NotEqual` rule each. Opt-in: a column without the type behaves as in 3.16 ([C-118](contract/rules.md#c-118-ip-column-type), [C-16](contract/rules.md#c-16-value-types), [C-112](contract/rules.md#c-112-column-filterconditions)).
- On an `ip` column, a CIDR prefix typed alone under `Equal` (`10.1.0.0/16`) emits one `Between` rule from its first to its last address (`10.1.0.0`, `10.1.255.255`), host bits masked and IPv6 written in RFC 5952 form; the input keeps the typed text. An outside `Between` rule whose bounds are exactly one prefix shows as its CIDR text ([C-118](contract/rules.md#c-118-ip-column-type)).
- On an `ip` column, text that is not an address, a prefix in a list, after `!` or under `NotEqual`, and the text shortcuts (`*a*`, `a*`, `*a`) give no rule and mark the input with `aria-invalid="true"`. Under `Between` the two bounds are text inputs and must be addresses of one family ([C-118](contract/rules.md#c-118-ip-column-type), [C-116](contract/rules.md#c-116-text-that-gives-no-rule)).
- `parseFilterInput` reads an `ip` column the same way the table does ([C-53](contract/rules.md#c-53-filter-parser)).

### Upgrade notes

- `columnTypes` and the `ColumnType` type now include `'ip'`. Code that switches over every `ColumnType` (for example a `labels.filterCondition` function or a `Record<ColumnType, …>`) must handle `'ip'` to type-check ([C-118](contract/rules.md#c-118-ip-column-type)).
- `defineDataset` (the local evaluator behind `useLocalQuery`) refuses an `ip` field: it compares no addresses. Evaluate `ip` columns on the server ([C-118](contract/rules.md#c-118-ip-column-type)).
- A backend that serves an `ip` column receives `Equal`, `NotEqual` and `Between` rules whose values are address strings, and must compare them as addresses. Columns without the type send the same queries as in 3.16.

## [3.16.0] - 2026-10-27

A column can choose the condition of filter text typed without an operator.

### Added

- Column `filterDefaultCondition`: the condition of text typed without an operator when no condition is picked in the menu. With `'Equal'` on a text column, `abc` emits `{ condition: 'Equal', value: 'abc' }`. Shortcuts keep their conditions (`*abc*` is still `Contains`, `!abc` still `NotEqual`), and a condition picked in the menu wins. A condition the column type does not offer in `conditionOptions` counts as unset, and so do `IsNull`, `IsNotNull` and `Between`. Unset, `update:query` is the one of 3.15 ([C-117](contract/rules.md#c-117-column-filterdefaultcondition), [C-15](contract/rules.md#c-15-operator-shortcuts)).
- `parseFilterInput` reads `filterDefaultCondition` from the column it is given when no condition is passed ([C-53](contract/rules.md#c-53-filter-parser)).

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.15.0] - 2026-10-25

A number list with a comparison no longer filters by its loosest bound, so a decimal comma is no longer hidden.

### Changed

- The comma always separates values in a number or integer filter, in every locale; a decimal is written with a dot (`0.5`). The number and integer inputs stay text inputs without `inputmode`, since phone number keypads cannot type `!`, and some not `-` or `,` ([C-16](contract/rules.md#c-16-value-types)).
- Picking a comparison (`>`, `>=`, `<`, `<=`) or `Between` on a typed or outside number list keeps the first value, as the bound or the lower bound, and drops the rest. Picking `Equal` or `NotEqual` keeps the list. A list of `!` values stays as it is under a comparison ([C-42](contract/rules.md#c-42-several-rules-on-a-column-that-is-not-text)).

### Fixed

- In a number or integer column, a list without `!` under a comparison gives no rule and the input gets `aria-invalid="true"`. In 3.14 `0,5` typed with `>` silently filtered `> 0`. One value with a blank segment (`80,`) is not a list and takes any condition ([C-16](contract/rules.md#c-16-value-types), [C-116](contract/rules.md#c-116-text-that-gives-no-rule)).
- Typed text that gives no rule (`0,5` with `>`) stays as typed when another condition is picked, so the comma can be corrected ([C-42](contract/rules.md#c-42-several-rules-on-a-column-that-is-not-text)).

### Upgrade notes

- `update:query`: a number list typed under a comparison now emits no rule (it removes the column's rules) where 3.14 emitted one comparison rule per value. Picking a comparison on a list now emits one rule with the first value, where 3.14 changed the condition of every value ([C-16](contract/rules.md#c-16-value-types), [C-42](contract/rules.md#c-42-several-rules-on-a-column-that-is-not-text)).
- Several outside rules of one comparison on a number column (`GreaterThan 20` and `GreaterThan 40`) no longer show as an editable list: the input is read-only and shows the count, `(2)` ([C-42](contract/rules.md#c-42-several-rules-on-a-column-that-is-not-text)).
- Skins: the input of such a list now carries `aria-invalid="true"` ([C-116](contract/rules.md#c-116-text-that-gives-no-rule)).

## [3.14.0] - 2026-10-24

Number and integer filters read value lists and negation, and filter text that gives no rule is marked.

### Added

- Number and integer filter inputs read a list and negation: `80,443` is one rule per value with the picked condition (`Equal` by default), and a value after `!` is `NotEqual` (`!80`, `!80,!443`). Blank segments are skipped. The list is all or nothing: one value that does not read (`80,abc`, `1.5,2` in an integer column), or a mix of `!` and plain values (`80,!443`), gives no rule ([C-16](contract/rules.md#c-16-value-types), [C-53](contract/rules.md#c-53-filter-parser)).
- `aria-invalid="true"` on a text or number filter input whose typed text gives no rule (`abc` or `80,abc` in a number column, `2.5` in an integer column, only operators such as `*`), until the text reads again or is emptied, so a skin can mark it. It is not set while the column has rules, nor on a read-only count input, a range with one bound or a condition without a value. This is the only DOM contract entry of 3.14 ([C-116](contract/rules.md#c-116-text-that-gives-no-rule)).

### Changed

- Outside rules on a number or integer column that the list can write (number values of one condition, or all `NotEqual`) show as editable text, `80,443` or `!80,!443`, instead of the read-only count `(2)`. A condition picked then applies to the values without `!`; picking `Between` keeps the first value as the lower bound ([C-42](contract/rules.md#c-42-several-rules-on-a-column-that-is-not-text)).

### Upgrade notes

- Markup: the number and integer filter inputs are now `type="text"` (they were `type="number"`); the two bound inputs of a `Between` range stay `type="number"`. A skin that selects `input[type="number"]` must select `.qt-filter-input` instead ([C-16](contract/rules.md#c-16-value-types)).
- Skins: style `.qt-filter-input[aria-invalid="true"]` to show text that gives no rule ([C-116](contract/rules.md#c-116-text-that-gives-no-rule)).
- `update:query`: text such as `80,443` or `!80` in a number column now emits rules where 3.13 emitted none. A backend receives several `Equal` rules of one numeric field (combined with OR) or several `NotEqual` rules (combined with AND), as text columns already sent ([C-16](contract/rules.md#c-16-value-types), [C-17](contract/rules.md#c-17-several-rules-for-one-field)).
- A comma now separates values: `1,5` typed in a number column gives the two values `1` and `5`. A decimal is written with a dot ([C-16](contract/rules.md#c-16-value-types)).

## [3.13.0] - 2026-10-23

Filters can ask for "no value" and for a closed range: `IsNull`, `IsNotNull` and `Between`, offered per column ([ADR 0020](docs/decisions/0020-null-and-range-conditions.md)). From this release on every version is the next minor or the next patch, never a major; a breaking need ships as an opt-in addition in a minor ([ADR 0019](docs/decisions/0019-release-version-policy.md)).

### Added

- Conditions `IsNull`, `IsNotNull` and `Between` in `filterConditions`. `IsNull` and `IsNotNull` rules carry no `value`; a `Between` rule carries the lower bound in `value` and the upper bound in `value2`, both inclusive and never swapped. New exports: `noValueConditions`, `rangeConditions`, `conditionArity`, and the types `ValueFilterRule`, `RangeFilterRule`, `NoValueFilterRule`, `ValueCondition`, `RangeCondition`, `NoValueCondition` and `FilterBound` ([C-17](contract/rules.md#c-17-several-rules-for-one-field), [ADR 0020](docs/decisions/0020-null-and-range-conditions.md)).
- Column `filterConditions`: the conditions the `filter-menu` slot offers for that column, in the given order, in place of the list of its type. A condition the type does not take is left out (`Between` goes with `number`, `integer`, `date` and `datetime`). Opt-in: without it the menu is the one of 3.12 and the table never emits a rule without a value or with two ([C-112](contract/rules.md#c-112-column-filterconditions), [C-34](contract/rules.md#c-34-filter-menu-slot)).
- Picking `IsNull` or `IsNotNull` applies at once, without debounce or text, and emits one rule `{ field, condition }` that replaces the column's rules. The input is hidden; the condition label and the clear action stay ([C-113](contract/rules.md#c-113-a-condition-without-a-value-in-the-filter-row), [C-20](contract/rules.md#c-20-picking-a-condition)).
- Under `Between` a column draws two `.qt-filter-input` elements, lower bound first, named by the new optional labels `filterInputFrom` and `filterInputTo` (defaults `` `Filter ${name} from` `` and `` `Filter ${name} to` ``). Once both bounds read, the column emits one `Between` rule. A range with one bound emits nothing and keeps the last applied rules; emptying both bounds removes the column's rules. The `filter-datetime` slot is drawn twice and gets a new `bound` prop (`'lower'`, `'upper'`, or `null` for one input); `setFilterInput` and `filters.setInput` take an optional `bound` argument ([C-114](contract/rules.md#c-114-between-in-the-filter-row), [C-35](contract/rules.md#c-35-date-filter-slot), [C-44](contract/rules.md#c-44-labels), [C-11](contract/rules.md#c-11-emptying-an-input-applies-at-once)).
- `parseFilterInput` with `IsNull` or `IsNotNull` returns that rule whatever the text; with `Between` it returns `[]`, since one text holds one bound ([C-53](contract/rules.md#c-53-filter-parser)).
- Semantics profile `tr-2` for `applyQuery` and `useLocalQuery`: `tr-1` plus `IsNull` (true only on a missing, `undefined` or `null` value), `IsNotNull` (its complement) and `Between`. A query that uses only the ten conditions of `tr-1` gives the same result under both. `tr-1` does not change and still refuses the three conditions. `profiles` is now `['tr-1', 'tr-2']` ([C-115](contract/rules.md#c-115-profile-tr-2), [C-77](contract/rules.md#c-77-structural-errors), [C-78](contract/rules.md#c-78-semantics-profile)).
- `query.schema.json` checks the operands by condition (`IsNull` and `IsNotNull` forbid `value` and `value2`, `Between` requires both), and the conformance suite moves to `revision` 2 with the `tr-2` cases ([C-115](contract/rules.md#c-115-profile-tr-2), [C-79](contract/rules.md#c-79-the-conformance-suite-ships)).

### Upgrade notes

- TypeScript: `FilterRule` is now a union by `condition` (`ValueFilterRule | RangeFilterRule | NoValueFilterRule`). Code that builds `{ field, condition, value }` from a `condition` typed `FilterCondition` no longer type-checks: narrow it to `ValueCondition` first, or `switch` on `condition`. Code that reads `rule.value` must handle `undefined`. Runtime behavior does not change ([ADR 0020](docs/decisions/0020-null-and-range-conditions.md)).
- TypeScript: `FilterCondition` and `SemanticsProfile` gain new members. A `switch` or `Record` that covers every condition, such as a `labels.filterCondition` function, must handle `IsNull`, `IsNotNull` and `Between` ([C-44](contract/rules.md#c-44-labels), [C-78](contract/rules.md#c-78-semantics-profile)).
- Backends: no new rule reaches the server unless the app opts in with `filterConditions` or calls `setCondition` with a new condition. A server that receives them must handle a rule without `value` and a `Between` rule with `value2`. `IsNull`, `IsNotNull` and `Between` are positive conditions under the rule-combining of [C-17](contract/rules.md#c-17-several-rules-for-one-field); `IsNotNull` is not negative.
- Conformance: the schema hash in the manifest and `revision` changed. A server that stays on `tr-1` passes the same suite as before plus case C80; one that wants `tr-2` also passes the `tr-2` cases (C70 to C79) ([C-79](contract/rules.md#c-79-the-conformance-suite-ships), [C-115](contract/rules.md#c-115-profile-tr-2)).

## [3.12.0] - 2026-10-23

Keyboard navigation between rows: the arrow keys, Home and End move the focus from row to row, also in a virtual body ([ADR 0018](docs/decisions/0018-row-navigation.md)).

### Added

- `rowNavigation` (`boolean | RowNavigationOptions<T>`): `ArrowDown` and `ArrowUp` move the focus to the next and previous data row, `Home` and `End` to the first and last, in the order the body draws them (top-pinned rows, the others, bottom-pinned rows), rows outside a virtual window included. A key acts only while the focus is on a row's focus target and no modifier key is held: the first element of the row that matches `rowNavigation.focus`, else its first link, enabled button, enabled checkbox or element with a `tabindex` other than `-1`; text fields, `select`, radio buttons and editable content keep their arrow keys. Group rows, subtable rows and the rows for which `rowNavigation.skip(row, index)` returns `true` are passed over. Off by default ([C-109](contract/rules.md#c-109-row-navigation), [ADR 0018](docs/decisions/0018-row-navigation.md)).
- The row a key moves to is shown whole, vertically, below a sticky header and below a group row cell your CSS made sticky. With `virtual` a row out of the window is scrolled to as `scrollToIndex` does and then focused by its `rowKey` (or its row object without `rowKey`), so a change of `rows` in between does not land on another row; a focus lost while DOM nodes move is put back ([C-110](contract/rules.md#c-110-row-navigation-drawing-and-showing-the-row)).
- `rowFocus` event with `RowFocusPayload<T>` (`row`, `rowIndex`, `key`): emitted once per key press that moved the focus, after the focus is there. A click, Tab, or the focus being put back emits nothing, and navigation never emits `update:query` ([C-109](contract/rules.md#c-109-row-navigation)).
- With `rowNavigation` the table adds one `keydown` listener on the `tbody` and writes no `tabindex`, class or attribute. Without it there is no listener and the DOM is the one of 3.11 ([C-111](contract/rules.md#c-111-row-navigation-off-and-dom-contract-of-312)).

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.11.1] - 2026-10-21

A fix for `scrollBody` tables whose body columns drifted from the header columns.

### Fixed

- With `scrollBody`, the body columns drifted out from under the header cells as the rows changed (live rows, new rows after a filter, a narrowed column) when the body and footer tables had `width: auto` or an intrinsic width such as `max-content`, the width the README recommends for `.qt-table` in large tables. Under such a width the browser lays the table out automatically even though `table-layout` reads `fixed`, so a cell wider than its column widens it, and the development warning about the automatic layout never fired. A development build now also warns once when, after the rows or the `col` widths change and with `col` widths that match the header cells, the body table is drawn wider than the header table ([C-101](contract/rules.md#c-101-scrolling-body)).

### Upgrade notes

- With `scrollBody`, give the body and footer tables a width that is a length or a percentage next to `table-layout: fixed`, for example `.qt-table-body > .qt-table, .qt-table-foot > .qt-table { table-layout: fixed; width: 100%; }`. A fixed table with `width: 100%` still grows to the sum of its columns. The fix is in your CSS: the table's markup and inline styles did not change.
- In that layout the header cells alone set the column widths: clip a cell's overflow in your CSS (`overflow: hidden`, `text-overflow: ellipsis`), or content wider than its column widens the body's scroll area.

## [3.11.0] - 2026-10-19

Each data row is now drawn by a component of its own, so a change to one row draws that row again and not the whole body ([ADR 0017](docs/decisions/0017-row-component.md)). The markup is unchanged, but cell slots are called less often: see Upgrade notes.

### Changed

- A data row is drawn again only when its own inputs change: its row object (by reference) or key, its index in `rows`, its `aria-rowindex`, its pinned position, its `rowKind`, whether it is selected, expanded or can expand, its flash marks, or an input every row draws (the drawn columns, which `cell-<field>` slots exist, the utility columns, the row labels, `scrollBody`, `flash` turned on or off). A new `rows` array that holds the same row objects in the same order draws and mounts no row. For a live list, keep the objects of unchanged rows by reference and give a changed row a new object ([C-106](contract/rules.md#c-106-a-row-is-drawn-again-only-for-its-own-inputs), [ADR 0017](docs/decisions/0017-row-component.md)).
- A reactive value read inside a `cell-<field>` slot draws only that slot's row again, not the other rows and not the body; a cell that reads a ticking clock draws only the rows whose slot reads it ([C-107](contract/rules.md#c-107-a-cell-slot-is-called-again-with-its-row-only)).
- The body's markup is the one of 3.10 in every state, and the table adds no listener to a row or a cell. In the Vue DevTools tree each drawn data row is a `TableRow` under the table body ([C-108](contract/rules.md#c-108-row-component-and-dom-contract-of-311)).

### Upgrade notes

- Compatibility exception: a `cell-<field>` slot is no longer called on every render of the component that gives it, only when its row is drawn again or when a reactive value it read in its last call changes. Until the row is drawn again a slot keeps showing a value that is neither in its slot props nor read reactively: a non-reactive value (`Date.now()`, a plain variable), a plain row object changed in place, a value captured from an outer `v-for` or `v-slot`, and the choice between two same-name slot templates switched with `v-if`/`v-else`; event handlers keep the values they captured. Read state inside the slot, keep a condition inside one slot, read current state in a handler, and replace a changed row with a new object; the README section [Live rows](README.md#live-rows) has examples ([C-107](contract/rules.md#c-107-a-cell-slot-is-called-again-with-its-row-only)).

## [3.10.0] - 2026-10-16

Automatic column widths now leave room for the filter row, so a narrow column's filter input stays usable ([ADR 0014](docs/decisions/0014-automatic-column-widths.md)).

### Changed

- Autofit (Enter or a double click on a resize handle) takes the same filter floor as `autoWidth`, so for a column with a filter row the width it emits in `columnResize` can be wider than what `measureColumnWidths` returns; a `maxWidth` below the floor wins. `measureColumnWidths` itself is unchanged and never counts the filter row ([C-50](contract/rules.md#c-50-keyboard-and-autofit), [C-99](contract/rules.md#c-99-measuring-column-widths)).

### Fixed

- With `autoWidth`, a narrow column (an ID, for example) was drawn at the width of its label and cells only, leaving its filter input too narrow to type in. The filter row is now a floor: the automatic width is at least the column's `.qt-filter-input` and `.qt-filter-button` controls side by side (a text or number input `6ch` wide plus its padding and border, a select or date/time input at its own width), with the row's gap and the paddings and borders. A `maxWidth` or `autoWidthMax` below the floor wins, and a column without a filter row is measured as before ([C-100](contract/rules.md#c-100-automatic-column-widths), [C-31](contract/rules.md#c-31-no-styling), [ADR 0014](docs/decisions/0014-automatic-column-widths.md)).

### Upgrade notes

- With `autoWidth`, columns without `Column.width` that have a filter row can now be drawn wider than in 3.9, so the table can grow wider. Check layouts that relied on narrow columns, and set `maxWidth` or `autoWidthMax` where a column must stay narrower than its filter.
- Autofit can emit a wider width in `columnResize` than in 3.9 for a column with a filter row. If you compare it with `measureColumnWidths`, expect them to differ by as much as the filter floor exceeds the content.

## [3.9.0] - 2026-10-16

Grouped rows: a header row above each run of rows with the same key, which stays in view in a virtual body when your CSS makes it sticky ([ADR 0016](docs/decisions/0016-grouped-rows.md)).

### Added

- `groupBy(row, index)` and the `group` slot: `groupBy` returns a row's group key (`string` or `number`; `null`, `undefined` or `NaN` puts the row in no group), and each run of consecutive rows with the same key gets a `tr.qt-group-row` above it, with one `th scope="row"` that spans every column and holds the `group` slot (`GroupSlotProps<T>`: `groupKey`, `count`, `row`, `rowIndex`), or shows the key without the slot. The table never reorders rows: sort them by group yourself. Off by default ([C-103](contract/rules.md#c-103-grouped-rows), [C-105](contract/rules.md#c-105-grouping-off-and-dom-contract-of-39), [ADR 0016](docs/decisions/0016-grouped-rows.md)).
- Group rows are not rows of `rows`: they carry no `data-row-index` or other row attributes, no utility cell, checkbox or expand button, and indexes, the selection, `expandAll`, `rowKind`, the change flash, the infinite trigger and `scrollToIndex` count only the rows given. Pinned rows are drawn without a group row. The slot content is for reading; the table keeps no focus in a group row ([C-103](contract/rules.md#c-103-grouped-rows)).
- In a virtual body a group row is part of its first row's item: it is measured, or `virtual.groupRowHeight` tall when `virtual.rowHeight` is set (defaults to `rowHeight`). The group row of the top group stays drawn while its group is in view, so a group row made sticky in your CSS stays; put `position: sticky` on the cell (`tr.qt-group-row > th`), not on the `tr`. `scrollToIndex` shows the first row of a group with its group row above it and aligns other rows below a sticky group row ([C-104](contract/rules.md#c-104-grouped-rows-in-a-virtual-body)).
- Accessibility: with `virtual`, `aria-rowcount` counts the group rows and each group row carries `aria-rowindex`; with `infinite` while there is more to load and there is a group, the count is `-1`. With `scrollBody` a group row has `role="row"` and its cell `role="rowheader"` with `aria-colspan` ([C-103](contract/rules.md#c-103-grouped-rows), [C-104](contract/rules.md#c-104-grouped-rows-in-a-virtual-body)).

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.8.0] - 2026-10-16

A scrolling body: the header and footer stay outside the scrolling area, so the vertical scrollbar starts below the header ([ADR 0015](docs/decisions/0015-scrolling-body.md)).

### Added

- `scrollBody`: draws the header, the body and the footer as three tables in `div.qt-table-head`, `div.qt-table-body` and (while there are footer rows) `div.qt-table-foot` inside `.qt-table-responsive`. The body and footer tables start with a `colgroup` whose `col` elements carry the measured width of each header cell, and the table keeps the three at the same sideways scroll position. Pinning, resizing, reordering, `focusFilter`, `virtual`, `scrollToIndex`, infinite scroll and `measureColumnWidths` work in this layout, and `.qt-table-body` is the scroll container a virtual body finds. Off by default ([C-101](contract/rules.md#c-101-scrolling-body), [ADR 0015](docs/decisions/0015-scrolling-body.md)).
- The scrolling is your CSS: give the three wrappers `overflow-y: scroll`, `.qt-table-body` a height and `overflow-x: auto`, `.qt-table-head` and `.qt-table-foot` `overflow-x: hidden` and a transparent `scrollbar-color`, and the body and footer tables `table-layout: fixed`. A development build warns once when the body table has the automatic layout, and once when a header or footer with `overflow: hidden` alone cannot follow the body's sideways position ([C-101](contract/rules.md#c-101-scrolling-body)).
- With `scrollBody` the three tables are one table for assistive technology: `.qt-table-responsive` has `role="table"` (and, with `virtual`, the `aria-rowcount`), the `table` elements `role="presentation"`, and the row groups, rows and cells carry `rowgroup`, `row`, `columnheader` and `cell` roles, with `aria-colspan` on a cell with `colspan` ([C-102](contract/rules.md#c-102-scrolling-body-accessibility-and-dom-contract)).

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.7.1] - 2026-10-14

A patch release: resizing a column now follows the pointer in a table whose container is wider than its columns.

### Fixed

- With the CSS that C-50 recommends (`table-layout: fixed; width: max-content; min-width: 100%`) in a container wider than the columns, the browser stretches every column. Dragging a resize handle then made the column jump wider at the start, the handle ran ahead of the pointer, and the arrow keys moved far more than 10 pixels. Now the drawn width follows the pointer, the arrow keys change the drawn width by 10 pixels (50 with Shift), and the column keeps the preview's width when the consumer writes the width back ([C-48](contract/rules.md#c-48-resize-handle), [C-49](contract/rules.md#c-49-dragging-a-handle), [C-50](contract/rules.md#c-50-keyboard-and-autofit)).
- In a very stretched table an arrow key could change nothing. An arrow key now moves the column at least one declared pixel ([C-50](contract/rules.md#c-50-keyboard-and-autofit)).
- Known limit: in a stretched table the columns before the dragged one share the stretch and narrow as it widens, so only the first column's handle stays exactly under the pointer ([C-49](contract/rules.md#c-49-dragging-a-handle)).

### Upgrade notes

- In a stretched table the `width` of `columnResize` is the declared width that draws the column at the size the user chose, so it is smaller than the drawn width. Keep writing it back to `Column.width` as before; do not compare it with a measured width ([C-49](contract/rules.md#c-49-dragging-a-handle)).
- During a drag, `aria-valuenow` on `.qt-resize-handle` is the width the preview draws ([C-48](contract/rules.md#c-48-resize-handle)).
- An arrow key or autofit whose result equals the column's declared width emits nothing; before, the comparison was with the drawn width ([C-50](contract/rules.md#c-50-keyboard-and-autofit)).

## [3.7.0] - 2026-10-13

The table can size columns to their content by itself ([ADR 0014](docs/decisions/0014-automatic-column-widths.md)).

### Added

- `autoWidth`: a visible column without `Column.width` is drawn at the width its content needs, measured as `measureColumnWidths` does and clamped as a resize is. The width is the header cell's inline `width`; it is not emitted and not written to `columns`, and a column with a `width` keeps it. While the query changes only its page, `pageSize` or `sort`, the widths only grow; another query, `rowsUpdate: 'reset'` or a new `autoWidthMax` measures from scratch. Off by default ([C-100](contract/rules.md#c-100-automatic-column-widths), [C-31](contract/rules.md#c-31-no-styling)).
- `autoWidthMax`: with `autoWidth`, the widest automatic width, in pixels, of a column without `maxWidth`. Absent, there is no limit ([C-100](contract/rules.md#c-100-automatic-column-widths)).

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.6.0] - 2026-10-13

The table can measure how wide its columns need to be, and autofit uses that measure ([ADR 0013](docs/decisions/0013-measuring-column-widths.md)).

### Added

- `measureColumnWidths(fields?)` on the template ref: returns, by `field`, the width each drawn column needs for its header label and its drawn data rows, padding and border included, in whole pixels rounded up. A `header-<field>` or `cell-<field>` slot that draws a block or a flex box counts with the width its content needs. The widths are not clamped to `minWidth` and `maxWidth`; nothing is emitted and no width is kept, so writing one back is the consumer's. Hidden columns, unknown fields and a table that is not displayed are left out ([C-99](contract/rules.md#c-99-measuring-column-widths), [C-33](contract/rules.md#c-33-exposed-surface)).
- For that one synchronous read the table changes inline styles on the table, its header cells and the parts that do not count, and puts every `style` attribute back before the call returns, so nothing of it is painted ([C-31](contract/rules.md#c-31-no-styling)).

### Changed

- Autofit (Enter or a double click on a resize handle) now emits the width `measureColumnWidths` measures, clamped. A column whose slot draws a block or a flex box can now get narrower. A table that is not displayed emits nothing ([C-50](contract/rules.md#c-50-keyboard-and-autofit)).

### Upgrade notes

- Autofit may emit a different `columnResize` width than before, most often narrower for columns drawn by a `header-<field>` or `cell-<field>` slot. Write it back as before, and check the look of those columns ([C-50](contract/rules.md#c-50-keyboard-and-autofit)).

## [3.5.1] - 2026-10-13

A patch release: an integer filter never turns a large number into another one, and pinned columns meet without a gap.

### Fixed

- Typing a whole number beyond ±(2⁵³ − 1) into the filter of an `integer` column sent the query for another number (`9007199254740993` became `9007199254740992`), while the local evaluator rejected the same value. Such text now makes no rule, as `2.5` does, and `parseFilterInput` returns `[]` for it ([C-16](contract/rules.md#c-16-value-types), [C-53](contract/rules.md#c-53-filter-parser)).
- Pinned columns could open a thin gap between them while the table scrolled sideways, with the scrolled cells showing through, or overlap their neighbour and hide the border between them. `--qt-pin-left` and `--qt-pin-right` are now the unrounded sum of the measured widths, so cells drawn at a fractional width meet exactly ([C-47](contract/rules.md#c-47-pin-offsets), [C-71](contract/rules.md#c-71-right-pinning)).

### Upgrade notes

- In an `integer` column, a number beyond ±(2⁵³ − 1) no longer gives a filter rule, so no `update:query` carries it. A backend that took such ids from this filter gets no rule for them ([C-16](contract/rules.md#c-16-value-types)).
- `--qt-pin-left` and `--qt-pin-right` can now hold fractional pixels. A skin that uses them through `var()` needs no change ([C-47](contract/rules.md#c-47-pin-offsets)).

## [3.5.0] - 2026-10-10

Rows can carry a kind for the skin, and single rows can be kept from expanding.

### Added

- `rowKind(row, index)`: the string it returns is written as `data-row-kind` on the row's `tr`, a pinned row and a drawn row of a virtual body included, so a skin can style it (`tr[data-row-kind="total"]`). An empty string, `null` or `undefined` writes nothing; the subtable row does not carry it. Off by default ([C-97](contract/rules.md#c-97-row-kind), [C-32](contract/rules.md#c-32-state-attributes), [C-40](contract/rules.md#c-40-dom-contract)).
- `rowExpandable(row, index)`: with `hasSubtable`, a row it returns `false` for gets an empty expand cell without a `qt-expand` button, never draws the `subtable` slot and never carries `data-expanded`. `expandAll()` skips it and an `isExpanded: true` field does not open it. Without it every row can expand ([C-98](contract/rules.md#c-98-rows-that-cannot-expand), [C-26](contract/rules.md#c-26-row-expansion), [C-55](contract/rules.md#c-55-expandall)).
- `useQueryTable`: a `rowExpandable` option and `expansion.canExpand(row, index)`; `expansion.toggle` does nothing for a row that cannot expand ([C-98](contract/rules.md#c-98-rows-that-cannot-expand)).

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.4.0] - 2026-10-10

A right-click on a column header can open the consumer's menu, and two rendering fixes.

### Added

- `headerContextMenu` event: with a listener (`.once` included), right-clicking a data-column header emits `HeaderContextMenuPayload` (`event`, `column`, `columnIndex`) and suppresses the browser menu. Without a listener nothing is emitted. The filter row and the utility headers keep the browser menu. The `header-<field>` slot still draws the label ([C-96](contract/rules.md#c-96-header-context-menu)).

### Fixed

- With `hasSubtable`, the expand button could turn while the expanded row's `subtable` slot was never drawn. The subtable row is now drawn in the `tbody` ([C-26](contract/rules.md#c-26-row-expansion)).
- Pinned columns could move on every frame when live content changed a header cell by a fraction of a pixel. The measured widths are now whole pixels, so `--qt-pin-left` and `--qt-pin-right` change only when the layout really changes ([C-47](contract/rules.md#c-47-pin-offsets)).

### Upgrade notes

- With `hasSubtable`, an expanded row now draws its `tr.qt-subtable-row` in tables where it was missing. Check the look of the `subtable` slot ([C-26](contract/rules.md#c-26-row-expansion)).
- `--qt-pin-left` and `--qt-pin-right` are now sums of whole-pixel widths. A skin that uses them through `var()` needs no change ([C-47](contract/rules.md#c-47-pin-offsets)).

## [3.3.0] - 2026-10-08

The change flash: a live table can mark the rows that are new and the cells whose value changed. It is off by default; with it off, the DOM and the behavior are those of 3.2 ([ADR 0011](docs/decisions/0011-change-flash.md), [ADR 0012](docs/decisions/0012-change-flash-boundaries.md)).

### Added

- `flash` (`boolean | FlashOptions`): while the query stays the same, a row whose key is new (`flash.rows`) and a cell whose `field` value changed (`flash.cells`) carry `data-flash` (`a` or `b`; the value switches when a flash starts again). `true` turns both on. Needs `rowKey`, and a changed row must be a new object. Off by default ([C-93](contract/rules.md#c-93-change-flash-what-flashes)).
- The skin draws the flash and sets its length with the custom property `--qt-flash-duration` on `.qt-datatable` or an ancestor; the package ships no CSS, and a missing or zero length flashes nothing. A row or cell drawn after its flash began (for example, one that scrolls into a virtual body) gets the inline `--qt-flash-elapsed`, so the skin can run the animation for the time it has left ([C-94](contract/rules.md#c-94-change-flash-marks-and-timing), [C-95](contract/rules.md#c-95-change-flash-off-and-dom-contract-of-33)).
- `rowsUpdate` (`RowsUpdate`: `snapshot`, `append`, `live` or `reset`): tells the table what produced the current `rows`. Only `live` flashes; `snapshot` and `reset` clear every flash, and `append` (the next page of an infinite list) flashes and clears nothing. Without it the table guesses from the query, `loading` and the first rows ([C-93](contract/rules.md#c-93-change-flash-what-flashes)).
- New entry `@dolusoft/query-table-core/row-changes`: `createRowChangeTracker(keyOf)` reports the added rows, the changed fields and resets between consecutive `rows`, and `sameValue` is the comparison it uses. It has no DOM and no Vue, so a consumer that draws its own markup can use it ([C-92](contract/rules.md#c-92-row-change-tracker)).

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.2.1] - 2026-10-07

No change to the packages: this version only marks a new state of the documentation site.

### Upgrade notes

- No change is needed to upgrade: the package code is the same as in 3.2.0.

## [3.2.0] - 2026-10-07

Virtual rows and infinite scroll, a translatable filter condition label, and the column type on cells. Packages are now distributed only through npm ([ADR 0010](docs/decisions/0010-virtual-and-infinite-scroll.md), [ADR 0009](docs/decisions/0009-npm-distribution.md)).

### Added

- `virtual` (`boolean | VirtualOptions`): the body draws only the rows in view of the scroll container, plus `overscan` rows on each side (default `10`), between two `tr.qt-virtual-spacer` rows. Row heights are measured, or fixed with `virtual.rowHeight`; the scroll container is found, or given with `virtual.scrollElement`. Rows keep their `data-row-index` and key. Give the table `table-layout: fixed`. Off by default ([C-83](contract/rules.md#c-83-virtual-rows), [C-84](contract/rules.md#c-84-row-heights), [C-85](contract/rules.md#c-85-scroll-element)).
- With `virtual` the `table` carries `aria-rowcount` and drawn rows carry `aria-rowindex`; a row that holds the focus stays drawn; every row is drawn while the page prints ([C-86](contract/rules.md#c-86-virtual-accessibility), [C-87](contract/rules.md#c-87-print-and-scrolltoindex)).
- `scrollToIndex(index, { align })` on the template ref scrolls the row with that index in `rows` into view, with or without `virtual`. It emits nothing ([C-87](contract/rules.md#c-87-print-and-scrolltoindex)).
- `infinite` (`boolean | InfiniteOptions`): when the end of `rows` comes near (`threshold`, default `5`), the table emits the next page action (`update:query`, reason `page`). The consumer appends the rows of a `page` answer and replaces `rows` for any other reason. Needs `rowKey`. Off by default ([C-88](contract/rules.md#c-88-infinite-scroll-trigger), [C-90](contract/rules.md#c-90-end-of-an-infinite-list)).
- The `load-more` slot (in a `tr.qt-load-more-row`, with `loadMore`, `canLoadMore` and `loading`) and `loadMore()` on the template ref, for a "load more" or "try again" control with `infinite`. With `infinite`, the select-all checkbox covers every row loaded so far ([C-89](contract/rules.md#c-89-load-more-slot-and-method), [C-64](contract/rules.md#c-64-selection-column)).
- `labels.filterCondition(condition, type)`: the condition label under a filter input can be translated. The same text is the `label` of each entry of `conditions` in the `filter-menu` slot. The default is the English label of 3.1 ([C-44](contract/rules.md#c-44-labels), [C-34](contract/rules.md#c-34-filter-menu-slot)).
- `data-type` on every header, body and footer cell of a column: the column type (`string`, `number`, `integer`, `date`, `datetime` or `bool`; `string` when missing or unknown). It is the hook for styling by type, for example aligning numbers; the table draws no alignment ([C-82](contract/rules.md#c-82-column-type-on-cells)).

### Changed

- Clear all filters: when the button has the focus, is activated from the keyboard (a click with `detail` 0) and the clear disables it, the focus moves to the first filter of the header that can take it. A pointer click moves no focus, and `clearFilters()` from the `toolbar` slot moves none ([C-22](contract/rules.md#c-22-clearing-all-filters)).
- The GitHub Release no longer carries the package tarballs: npm is the only distribution channel. The release keeps its notes and the conformance suite asset `conformance-<revision>.tgz` ([ADR 0009](docs/decisions/0009-npm-distribution.md)).

### Upgrade notes

- Markup: header, body and footer cells now always carry `data-type`. A skin that relies on cells having no such attribute, or a DOM snapshot test, needs updating; otherwise nothing changes ([C-82](contract/rules.md#c-82-column-type-on-cells)).
- Focus: after clearing all filters from the keyboard, the focus is now on the first filter input instead of falling to the page. Check tests or focus handling that expected the focus to stay on the button or leave the table ([C-22](contract/rules.md#c-22-clearing-all-filters)).
- If you install from GitHub Release tarball URLs (with `overrides`), switch to npm: install `@dolusoft/query-table` by name and version and remove the `overrides` entries ([ADR 0009](docs/decisions/0009-npm-distribution.md)).

## [3.1.0] - 2026-10-07

Column layout controlled by the consumer, right pinning, column reordering, row pinning, and local query evaluation for data held in memory. Everything is opt-in; with it off, the DOM and the `update:query` traces are those of 3.0.1 ([ADR 0007](docs/decisions/0007-column-layout-row-pinning.md), [ADR 0008](docs/decisions/0008-local-query-evaluation.md)).

### Added

- `v-model:columns`: the table emits `update:columns(columns, reason)` when the user changes the layout, with `reason` `visibility`, `order`, `pin` or `resize` (`ColumnChangeReason`). The array is new; unchanged columns are your objects. A resize emits `columnResize` and then `update:columns`. Nothing emits `update:query` ([C-67](contract/rules.md#c-67-column-visibility), [C-68](contract/rules.md#c-68-columns-are-controlled), [C-69](contract/rules.md#c-69-column-order)).
- The `header-<field>` and `filter-menu` slots receive `control` (`ColumnControl`): `pinned`, `pin(side)`, `hide()`, `canMoveLeft`, `canMoveRight` and `move(direction)` ([C-70](contract/rules.md#c-70-column-controls-in-slots)).
- `pinned: 'right'` on a column: it is drawn after every other column, and its cells carry `data-pinned="right"` and the inline `--qt-pin-right` offset. Sticky positioning stays the consumer's CSS ([C-71](contract/rules.md#c-71-right-pinning)).
- `reorderable` on the table (column `reorderable` defaults to `true`): a `button.qt-reorder-handle` at the start of each header cell moves the column within its region by drag or by ArrowLeft, ArrowRight, Home and End. Header cells carry `data-dragging` and `data-drop` during a drag. Named by `labels.moveColumn`. Off by default ([C-73](contract/rules.md#c-73-reorder-handle), [C-44](contract/rules.md#c-44-labels)).
- `v-model:rowPinning` (`RowPinning`: `{ top, bottom }` of row keys): pinned rows are drawn first or last and carry `data-pinned-row`. The `cell-<field>` slot receives `rowPinned` and `pinRow(position)`. Needs `rowKey` ([C-74](contract/rules.md#c-74-row-pinning)).
- `@dolusoft/query-protocol/local`: `defineDataset` and `applyQuery` filter, search, sort and page rows held in memory, under the named semantics profile `tr-1`. Page mode only (a cursor is `cursor-not-supported`); errors are returned as values. The default entries do not import it ([C-75](contract/rules.md#c-75-the-local-evaluator-is-separate), [C-76](contract/rules.md#c-76-pipeline-page-mode-and-result), [C-77](contract/rules.md#c-77-structural-errors), [C-78](contract/rules.md#c-78-semantics-profile), [C-80](contract/rules.md#c-80-filters-and-search)).
- `useLocalQuery` from `@dolusoft/query-table/local`: gives `rows`, `totalRows` and `error` for a query over rows in memory, and does not filter or sort again when only the page changes ([C-81](contract/rules.md#c-81-uselocalquery)).
- The conformance suite ships in `@dolusoft/query-protocol` under `conformance/*`, and as `conformance-<revision>.tgz` on each GitHub Release, so a backend can check that it evaluates queries the same way ([C-79](contract/rules.md#c-79-the-conformance-suite-ships)).

### Changed

- Each release is now published to npm by the release workflow, with provenance, next to the GitHub Release tarballs.

### Upgrade notes

- Additive: no change is needed to upgrade.

## [3.0.1] - 2026-10-06

A fix to how filter rules are compared, and the first version on npm.

### Added

- The packages are on npm from this version: install `@dolusoft/query-table` by name and version, and the other two packages come with it. 3.0.0 is available only as GitHub Release tarballs ([migration guide](docs/guide/migration-v3.md#install)).

### Fixed

- Two filter rules that differ only in a property besides `field`, `condition` and `value` (for example `note`) now count as different, as the contract says. An action that changes only such a property emits `update:query`; 3.0.0 treated the rules as equal and emitted nothing ([C-60](contract/rules.md#c-60-unknown-query-keys-pass-through), [C-04](contract/rules.md#c-04-one-action-one-update)).

### Upgrade notes

- `update:query`: an action that changes only an extra property of a filter rule now emits an update (and your handler fetches again). Nothing to change unless you relied on that update being skipped ([C-60](contract/rules.md#c-60-unknown-query-keys-pass-through)).

## [3.0.0] - 2026-10-06

The implementation moves to TanStack Table v9 and is split into three packages, versioned together. Cursor paging, global search, row selection, the `useQueryTable()` composable and the TanStack plugins are new and opt-in; a table that uses none of them renders and emits as 2.2.x did ([ADR 0006](docs/decisions/0006-release-3.md)).

### Added

- Three packages released together: `@dolusoft/query-protocol` (query types, filter grammar, JSON Schema; no dependencies), `@dolusoft/query-table-core` (the TanStack Table plugins) and `@dolusoft/query-table` (the Vue component). The Vue package keeps its name and its imports, and `TableQuery` stays as an alias of `PageQuery` ([ADR 0002](docs/decisions/0002-three-packages.md)).
- Cursor paging: a query with a `cursor` key pages by opaque cursors that you pass as `cursors`, and the total may be unknown. A sort, a filter, a search, a page size change and clear-all go back to `cursor: null` ([C-56](contract/rules.md#c-56-cursor-paging), [C-57](contract/rules.md#c-57-cursor-mode-starts-over), [C-65](contract/rules.md#c-65-cursor-paging-controls)).
- Global search: `query.search`, set from the `toolbar` slot (`search`, `setSearch`, `applySearch`), emits reason `search`. Typed text waits `searchDebounce` milliseconds (default `300`; `0` turns it off) ([C-58](contract/rules.md#c-58-global-search), [C-63](contract/rules.md#c-63-typed-search-is-debounced)).
- Row selection: `v-model:selection`, a map of row key to `true`, draws a checkbox column (`qt-select-row`, `qt-select-all`, `data-selected` on selected rows) and emits `update:selection`. It never emits a query ([C-59](contract/rules.md#c-59-controlled-row-selection), [C-64](contract/rules.md#c-64-selection-column), [C-66](contract/rules.md#c-66-dom-contract-of-the-selection-column)).
- `useQueryTable()`: the composable `QueryTable` is built on, exported with its types, to draw your own markup with the same behavior.
- `serverQueryFeature` and `filterInputFeature` in `@dolusoft/query-table-core` for a plain TanStack table. The plugin throws when table options replace the handlers it owns, and a disposed table is inert ([C-61](contract/rules.md#c-61-the-plugin-owns-the-query-handlers), [C-62](contract/rules.md#c-62-dispose-and-isolation)).
- The JSON Schema of the query: `@dolusoft/query-protocol/query.schema.json`, for a backend in any language.

### Changed

- Unknown query keys, and properties of a rule besides `field`, `condition` and `value`, are kept in every emitted query instead of being dropped ([C-60](contract/rules.md#c-60-unknown-query-keys-pass-through)).

### Upgrade notes

- Unknown query keys are kept ([C-60](contract/rules.md#c-60-unknown-query-keys-pass-through)): 2.2.x dropped them from every emitted query. If your backend relied on that, strip the extra keys yourself before sending; if you re-added a key in your `update:query` handler, you can remove that workaround.
- `QueryChangeReason` gains `search`. An exhaustive `switch` over the reasons needs a new branch ([C-58](contract/rules.md#c-58-global-search)).
- Install: the three packages are GitHub Release tarballs; map `@dolusoft/query-protocol` and `@dolusoft/query-table-core` to their tarballs with `overrides` (from 3.0.1 they are on npm).
- The full guide is [docs/guide/migration-v3.md](docs/guide/migration-v3.md).

[Unreleased]: https://github.com/dolusoft/query-table/compare/v3.18.0...HEAD
[3.18.0]: https://github.com/dolusoft/query-table/compare/v3.17.0...v3.18.0
[3.17.0]: https://github.com/dolusoft/query-table/compare/v3.16.0...v3.17.0
[3.16.0]: https://github.com/dolusoft/query-table/compare/v3.15.0...v3.16.0
[3.15.0]: https://github.com/dolusoft/query-table/compare/v3.14.0...v3.15.0
[3.14.0]: https://github.com/dolusoft/query-table/compare/v3.13.0...v3.14.0
[3.13.0]: https://github.com/dolusoft/query-table/compare/v3.12.0...v3.13.0
[3.12.0]: https://github.com/dolusoft/query-table/compare/v3.11.1...v3.12.0
[3.11.1]: https://github.com/dolusoft/query-table/compare/v3.11.0...v3.11.1
[3.11.0]: https://github.com/dolusoft/query-table/compare/v3.10.0...v3.11.0
[3.10.0]: https://github.com/dolusoft/query-table/compare/v3.9.0...v3.10.0
[3.9.0]: https://github.com/dolusoft/query-table/compare/v3.8.0...v3.9.0
[3.8.0]: https://github.com/dolusoft/query-table/compare/v3.7.1...v3.8.0
[3.7.1]: https://github.com/dolusoft/query-table/compare/v3.7.0...v3.7.1
[3.7.0]: https://github.com/dolusoft/query-table/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/dolusoft/query-table/compare/v3.5.1...v3.6.0
[3.5.1]: https://github.com/dolusoft/query-table/compare/v3.5.0...v3.5.1
[3.5.0]: https://github.com/dolusoft/query-table/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/dolusoft/query-table/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/dolusoft/query-table/compare/v3.2.1...v3.3.0
[3.2.1]: https://github.com/dolusoft/query-table/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/dolusoft/query-table/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/dolusoft/query-table/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/dolusoft/query-table/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/dolusoft/query-table/compare/v2.2.12...v3.0.0
