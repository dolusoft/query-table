# 0013 Measuring column widths (3.4)

Status: Proposed (2026-10-09), for a decision by Zahid ([query-table#108](https://github.com/dolusoft/query-table/issues/108) S1). Amends P5; the rest of the principles stand.

## Context

The autofit of C-50 (Enter or a double click on a resize handle) measures a column with a `Range` over each cell's content. That is the width of the content's boxes, not of the content: a `header-<field>` slot that draws a flex row (a label, then a button pushed to the end) or a `cell-<field>` slot that draws a block box (an ellipsis span) stretches to its cell, so the range returns the cell's width. frontendx's Data View draws both (`dolusoft/frontendx#2499`): `514` in a 21 px run measured 132 px, autofit returned the width the column already had, and C-50 emitted nothing.

frontendx also wants every column fitted to its content when the data arrives. It built that on its side: switch the table to the automatic layout with its own CSS, read the header cells, switch back. It works, and it reaches into `.qt-table`, `th[data-field]` and `.qt-filter` from a stylesheet; markup the skin does not own would break it without an error. The measure is the table's to give, and C-50 needs the same one.

The only way to get the browser's max-content width of a column is to let it lay the column out without a width. Under the consumer's recommended CSS (`table-layout: fixed; width: max-content; min-width: 100%`) that means overriding the table's layout for the read, which P5 does not allow: the table writes five listed inline styles and no other.

## Decision

- **A measure on the template ref (K34-1).** `measureColumnWidths(fields?)` returns, by `field`, the max-content width of each drawn column: header label and the cells of the drawn data rows, padding and border included, rounded up, not clamped. The filter row, the resize handle, the footer and the non-data body rows do not count. It emits nothing and keeps no width (P15): which width to write back as `Column.width`, and when, is the consumer's. It is an action that state cannot express (P10), like `scrollToIndex`. New rule C-96.
- **Autofit uses it (K34-2).** C-50's autofit width is `measureColumnWidths` for that column, clamped; a column that measures nothing (the table not displayed) emits nothing. The `Range` measure goes.
- **A measuring exception to P5 (K34-3).** For that one synchronous read the table sets, with `!important`, `table-layout: auto`, `width: max-content` and `min-width: 0` on the table, `width: auto` on the header cells and `display: none` on the parts that do not count, and puts every `style` attribute back as it was, absent included, before returning. The browser lays the table out for the read and paints nothing in between: no skin, animation or observer sees the declarations. C-31 names the exception; the C-96 test asserts that every `style` attribute and the table's markup are unchanged after the call.

## Options considered

- **Keep the `Range` measure and walk the content.** Add the widths of a flex row's children, take a block's children's widest, and so on. For: no style written. Against: it re-implements layout (gaps, margins, `min-width`, wrapping) and is wrong for the next layout a slot uses. Rejected.
- **Only the listed `width` (query-table#108 S1 (b)).** Write `1px` on the header cells; the browser then gives each column its min-content width. For: P5 stays as written. On Data View's 11 columns it matched the reference to the pixel. Against: min-content is max-content only for content that does not wrap, and a table held at `min-width: 100%` spreads its slack over the columns, so a table narrower than its box (where a consumer most needs a fit) measures too wide. Rejected for those two limits; it is the option to take if P5 must not move.
- **Measure a clone.** For: the live table is not touched. Against: the clone must sit inside the consumer's ancestors for its CSS to apply, which is unlisted markup in the consumer's DOM (P6), and it still needs inline styles of its own. Rejected.
- **Leave measuring to the consumer.** For: nothing changes here. Against: every consumer writes the same code against markup it was not promised, and C-50 stays wrong. Rejected.

## Consequences

- C-31, C-33 and C-50 change, C-96 is new; `QueryTableExpose` gains one member (`contract/api.json`, `CONTRACT.md`).
- P5 lists the exception next to the inline styles and its `Check:` line names the C-96 test.
- The measure forces one synchronous layout per call; a consumer that refits on every change of `rows` pays one layout per change. Autofit pays it once per Enter or double click, as the `Range` measure did.
- With `virtual` only the drawn rows count, as for autofit before.
- A consumer whose skin selects `[style]` or watches the table with a `MutationObserver` on `style` sees the attribute change and change back within one task. Neither is a listed hook (P6).

## Trade-off

The table writes styles it does not list, for the length of one read. In exchange the measure is the browser's own and independent of the consumer's CSS, slot content of any layout is measured as it needs, and the code that fits columns lives once, next to the markup it depends on.
