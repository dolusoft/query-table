# 0010 Virtual rows and infinite scroll (3.2)

Status: Accepted (2026-10-07), decided by Zahid.

## Context

A list of ten thousand rows freezes the page while the table mounts and drops frames while it scrolls: every row is in the DOM (2.2.3 measured 4.7 s to load 10K rows and a median frame of 43.7 ms while scrolling). frontendx draws such lists through its own windowing code (`VDetailTable` with `virtualWindow.ts`, spacer rows, ARIA row indexes) or not at all (a `virtual-scroll` flag that is dead next to `expandable`). It has no infinite scroll; its cursor and offset lists page by buttons. TanStack Table has no windowing feature: TanStack Virtual is a separate library, 8.3 KB gzip for its core alone (measured with the repository's Vite), more than a quarter of the component's size, and it still leaves the table-specific parts (spacer rows in a `table`, row indexes, focus, print, subtable rows) to the caller.

## Decision

- **Both in the Vue package, opt-in props (K32-1).** `virtual` draws only the rows in view; `infinite` asks for the next page as the user nears the end. Which rows are drawn is DOM work, not query state: there is nothing for the protocol or the core to hold, so no plugin is added (P10's plugin-first order is for state). No separate package or sub-path: P9 keeps one surface per package, and `QueryTable` stays one component. The code is in the `component` budget even when unused.
- **Our own windowing, no TanStack Virtual (K32-2, S2).** About 2 KB gzip against 8.3 KB plus glue, and the hard part is ours either way. P11 stays as written: no dependency is added.
- **Spacer rows in the `tbody` (K32-3).** One `tr.qt-virtual-spacer` above and one below the drawn rows hold the height of the rows left out. The table stays a `table`: the sticky header and the pinned-column offsets work unchanged, and the DOM contract (P6) keeps its shape. `content-visibility` is no alternative: CSS containment does not apply to table rows.
- **Inline `height` on the spacer (S3).** The spacer's height is written inline, the one inline geometry that is not a `--qt-*` property. A custom property would need a consumer rule to have any effect, and a missing rule would break scrolling, not the look. P5 lists it.
- **State.** The window, the measured heights and the kept focused row are short-lived component state (P2); the scroll position belongs to the consumer's scroll container (P13), which the table finds (`virtual.scrollElement`, else the nearest scrolling ancestor, else the window) and writes to only for the drift correction and `scrollToIndex`. The rows gathered by infinite scroll are the consumer's (P1): the table emits the next page (`update:query`, reason `page`) and the consumer appends on `page` and replaces on every other reason. No new reason is added: widening `QueryChangeReason` would break exhaustive switches in consumers.
- **Infinite scroll needs `rowKey`.** Rows change with every page; without an identity the expansion state would reset on each one (C-26).
- **Release (S1).** Both ship in 3.2.0, a minor release (P9); with both off the DOM and the traces are those of 3.1.0 (the equivalence gate, `release:3.1.0` baseline).

## Consequences

- The DOM contract grows only with the features on: `qt-virtual-spacer` and its `height`, `aria-rowcount` and `aria-rowindex`, `qt-load-more-row`, each marked `addedBy` and checked by C-91.
- `subtable` slot content of a row that leaves the window unmounts; its expansion state stays (C-26). Content with state of its own lifts it to the consumer.
- Tab reaches only drawn rows; a row that holds the focus stays drawn while it has it (C-86).
- With an unknown total, a consumer that drops duplicate rows between pages ends the list early (C-90); giving `totalRows` avoids it.
- Safari has no scroll anchoring and the repository runs no WebKit tests; the drift correction is ours and untested there.

## Trade-off

Owning the windowing code is about 2 KB we maintain instead of a dependency we pin, and the measured-height path is ours to keep correct. In exchange P11 holds, the table keeps its native markup, and the parts a generic virtualizer leaves out are written once, here.
