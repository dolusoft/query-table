# 0022 Cell components: one markup for the cells the product's tables share (3.20)

Status: Proposed, [query-table#203](https://github.com/dolusoft/query-table/issues/203) under [query-table#201](https://github.com/dolusoft/query-table/issues/201). Decided by Enes on 2026-11-18: the cell patterns are unstyled components of the package with their own DOM hooks, as #203 D-01 ([comment](https://github.com/dolusoft/query-table/issues/203#issuecomment-6978239112)).

## Context

The product's tables draw the same few things inside their cells: a bold line over a small one, an ID in a monospace chip with a copy button, a text with a preview button, a status badge, a dash for a missing value, and a row of actions at the end (an "Edit" button, a destructive "Delete"). The table draws none of them. A cell without a slot draws its value as text (C-30), and C-82 says the table adds no placeholder and no icon. Each of these is a `cell-<field>` slot written by the consumer.

Written in each consumer, the same pattern gets different markup in every table: one wraps the ID in a `code`, another in a `span`; one names the copy button, another does not. A skin can only dress what it can select, and P6 lets it select only the hooks of `contract/dom.ts`. So today a skin cannot dress these cells at all, and #203 (one skin for every table) cannot be done. The goal of #201 is that the other tables of the product move onto this repository; they bring these cells with them.

#203 asked where the patterns live: as slot recipes in the playground and the guide, copied by each consumer, or as components of the package with hooks of their own. D-01 chose the components.

## Decision

- **Cell components behind their own entry (K320-1).** `@dolusoft/query-table/cells` (`packages/vue/src/cells/`) exports small unstyled components to put in a `cell-<field>` slot of `QueryTable` or `DataTable`, or anywhere else. They hold no table state, read no row and know nothing of `query`: each draws what its props give it. The default entry, `/local` and `/data-table` do not import them, so a table that uses none pays nothing (P8).
- **The first set (K320-2)**, taken from the product's design:
  1. `CellStack`: two lines, `primary` and `secondary` (props, or the slots of the same names). `span.qt-cell-stack` holds `span.qt-cell-primary` and, when there is one, `span.qt-cell-secondary`.
  2. `CellCopy`: a value and a button that asks to copy it. `span.qt-cell-copy` holds `code.qt-cell-copy-text` and `button.qt-cell-copy-button` with an icon (`svg.qt-cell-icon`). A press emits `copy` with the value. The component does not write the clipboard (K320-4).
  3. `CellPreview`: a text and a button that asks to preview it. `span.qt-cell-preview` holds `span.qt-cell-preview-text` and `button.qt-cell-preview-button` with an icon. A press emits `preview`.
  4. `CellBadge`: a short status. `span.qt-cell-badge` with its text (a prop or the default slot) and `data-tone`, one of `neutral` (the default), `info`, `success`, `warning` and `danger`. The tone is what the status means, as `data-row-kind` is (C-97); its color is the skin's (P5).
  5. `CellValue`: a value drawn as C-30 draws a cell (the value as a string, escaped, whole), or, when the value is `null`, `undefined` or `''`, `span.qt-cell-empty` with the empty-value label. It is how a column opts into a placeholder; the table's own cells keep C-30 and C-82.
  6. `CellActions` and `CellAction`: `span.qt-cell-actions` holds the buttons; each `CellAction` is a `button.qt-cell-action` with `data-kind` (`default`, `primary` or `danger`) and the consumer's text in its slot. A press is a native click: the action is the consumer's.
- **The DOM contract grows (K320-3, P6).** The classes and attributes above go into `contract/dom.ts`, marked as added by the new rule, and the DOM test renders each component to check them. They are hooks of the components, not of the table: P6 says so in its own amendment. Nothing the table draws changes.
- **Events, not side effects (K320-4).** `CellCopy` and `CellPreview` emit; writing the clipboard (it needs a secure context and may ask permission), showing a toast and opening a preview are the consumer's. A press does not stop the click: it bubbles from the cell as any control in a cell slot does (C-27). The buttons are native `button`s with `type="button"`, so Enter and Space press them.
- **Text from `labels` (K320-5, P7).** The names of the copy and preview buttons and the empty-value text are new entries of `TableLabels`: `copyValue: (value: string) => string` (default `` `Copy ${value}` ``), `previewValue: (value: string) => string` (default `` `Preview ${value}` ``) and `emptyValue: string` (default `'-'`). Inside a `QueryTable` or a `DataTable` a cell component reads the `labels` of that table; outside one it uses the English defaults. No component takes a text prop for these. The text of a `CellAction` and of a `CellBadge` is the consumer's content, not the table's text, as a cell's value is.
- **Layers and size (K320-6).** `src/cells/` is a part of the Vue package that may import `vue` and, from the main part, only the module that resolves the labels of the enclosing table. The main part, `local/` and `data-table/` never import it. `layers/boundaries` and `scripts/check-entry-graph.mjs` learn the part; `pnpm check:size` gets a `cells` fixture; `pnpm api:check` gets a report for the entry.

## Scope

In: the components of K320-2, their hooks, the label entries, the rules, the tests, the API report, the size fixture and a playground page that shows each one.

Out, each its own change:

- The skin that dresses them, with the rest of the product's design: #203, after this.
- Formatting: dates, numbers and currencies are the consumer's, before the value reaches a component.
- A popover, a tooltip or a toast: the package draws none (C-34).
- A column option that picks a cell component (`Column.cell: 'copy'`). It would make the column list choose markup; #204 decides whether a dynamic table needs it.
- More components. A new one follows this record: unstyled, its own `qt-cell-*` hooks, text from `labels`, events for side effects.

## Principles

Amended in their own pull request, before the implementation:

- **P6.** The DOM contract also lists the hooks of the cell components; each is rendered by some state of the table or of a cell component.
- **P7.** The text a cell component writes comes from the `labels` of the enclosing table, with English defaults.
- **P8.** Adds the `cells` fixture.
- **P9.** Adds: the cell components live behind their own entry, like the binding and `DataTable`.
- **P14.** Adds `cells` to the parts of the Vue package and what it may import.

## Consequences

- A new entry with its own API report and size fixture. The default entry grows only by the three label defaults.
- `TableLabels` gains three optional entries; `labels` without them draws what it drew.
- The DOM contract gains about fifteen entries, all `qt-cell-*`, `data-tone` and `data-kind`. A skin that ignores them sees no change.
- The components are public surface: renaming a class or a prop is a breaking change, as for the table.

## Alternatives

- **Slot recipes (#203 S1, answer a; not chosen).** No surface and no new hooks, but every consumer copies the markup and the copies drift; a skin cannot rely on any of it.
- **The components in the default entry.** One import less, but every table would pay for them, used or not (P8).
- **Styled components, or a style prop such as `color`.** P5: the look is the skin's. `data-tone` and `data-kind` say what a cell means, not how it looks.
- **Writing the clipboard in `CellCopy`.** One handler less for the consumer, but the package would own a browser permission and a failure it cannot show (no toast, C-34).

## Trade-off

A second kind of public surface, components next to the table, that must stay stable and accessible. In return the product's tables share one markup for their cells, one skin dresses all of them, and a table that moves onto this repository brings no markup of its own.

## Rules

- **C-128 Cell components: markup and DOM.** K320-1, K320-2, K320-3.
- **C-129 Cell components: events and labels.** K320-4, K320-5.
