# 0011 Change flash (3.3)

Status: Proposed (2026-10-07). Decisions K1 to K12 by Zahid after an independent review of the plan.

## Context

Live tables (logs, counters, prices) change while the user looks at them, and a change is easy to miss. StkTableVue (`ja-plus/stk-table-vue` 1.2.7) paints the background of a changed row and fades it over two seconds. Its consumer calls `setHighlightDimRow(keys)` after every update, and its virtual body shortens the rest of the fade of a row that comes back into view: a remaining 1100 ms ran in 605 ms, because both the duration and the iteration count are scaled.

Query Table ships no CSS (P5), has no row identity in the DOM, and cannot tell why `rows` changed: a sort answer, an appended page, a new data source and a live update all arrive as a new array.

## Decision

- **The table finds the change (K1).** With `flash` and `rowKey`, consecutive `rows` are compared by key: a new key flashes its row, a changed value of a drawn column (`valueAt(row, column.field)`) flashes its cell. `flash` is off by default; once on, the consumer calls nothing. There is no method to flash by hand.
- **An optional hint makes the split exact (K2).** `rowsUpdate` (`'snapshot' | 'append' | 'live' | 'reset'`), given with `rows` and read when `rows` changes, says what produced them: only `live` flashes. Without it the table guesses from the query (compared with `sameQuery`, the previous query kept as a clone), `loading` and the first rows, and the rule says that this path is best effort. Dropping late answers stays with the consumer (a request counter), as for infinite scroll.
- **Boundaries start over (K3).** A query change, a `snapshot` or `reset`, or a new `rowKey` clears every mark and pending job; an ordinary update only moves the rows compared against. A sort answer never shows an old flash.
- **Values compare by structure (K7).** Primitives by SameValueZero, dates by time, arrays in order, plain objects by their keys in any order; `Map`, `Set`, class instances and cycles by reference. A row given as the same object is not compared, so a changed row must be a new object, and so must the branches that changed in it. Only the column's own `field` is watched: a slot that shows other fields is not covered.
- **A repeated change restarts the flash (K4).** Every change on live data must be visible, so a row or cell that changes again before its flash ends starts over; restarts are merged per animation frame, and the marks are updated in place. The review proposed merging repeats into the running flash instead; this decision departs from it on purpose, accepting that a row updated at a high rate stays colored.
- **Marks, not styles (K9).** The table writes `data-flash` (`a` or `b`, so a new value restarts a CSS animation) on the `tr` or the `td`, and `--qt-flash-elapsed` on an element bound after its flash began (it entered the window of a virtual body, its cell was mounted again, or the flash that governs it changed). The value is the time already gone and stays fixed while the element lives; the skin's `animation-delay: calc(var(--qt-flash-elapsed) * -1)` moves the start, not the length, so the vanishing-fade bug cannot occur (K6).
- **The skin owns the duration (K5).** The skin sets `--qt-flash-duration` on the table's root; the table reads it with the marks it writes (at most once a frame) and derives each mark's end from it. One timer wakes at the nearest end; an expired mark is never drawn, even when the timer runs late. Animation events are not used: an animation inside a cell cannot end a mark. A missing or zero duration (a reduced-motion skin) writes no mark and still moves the rows compared against.
- **Lifecycle (K8).** A hidden document produces no flash and replays nothing on return; a `KeepAlive` deactivation clears the marks and its activation takes the current rows silently; nothing runs on the server.
- **Layers (K10).** The detection (keys, values, the hint, the query boundary) needs no DOM and no Vue: it is a pure module of the core, `@dolusoft/query-table-core/row-changes`, which imports only the protocol. It is not a `TableFeature`: TanStack hands a feature the new `data` but not the previous one, so a plugin would keep the previous rows itself and be called from outside anyway, a plugin in name only; and a feature registered in `useQueryTable` would add its cost to every composable consumer whether or not it flashes. P9 and P10 gain this step between the plugin and the Vue code. The marks, the style read, the timer and the binding hooks are DOM work and stay in the component, as the virtual body does (ADR 0010); the composable does not carry the flash.
- **No side effects (K12).** Off, the component sets up one watcher of the `flash` prop and nothing else: no comparison, timer, frame callback, listener, style read or per-row memory, and the DOM is the one of 3.2. On, it adds no listener to `document` or `window`, keeps no module-level state, emits nothing and changes no order or focus. The package ships no keyframes or styles; the look lives in the skin.

## Consequences

- P2 lists the flash among the short-lived state; P5 lists `--qt-flash-elapsed` (time, not geometry) and the one style value the table reads; P8 counts the marks among the bounded state, adds the `/row-changes` fixture and states that a feature that is off does no work; P9 and P10 add the pure core module; P14 says what it imports. P1 is unchanged: the table compares values for equality and changes nothing it shows.
- Without the hint, an asynchronous consumer that does not set `loading` may see an answer flash when a live update for the old query arrived first; a late answer for an older query flashes as a change. The guide shows the hint and the request counter.
- In-place mutation is not detected; a deep watcher would copy no history and walk every row.
- A deleted row has no exit effect and a moved row no motion: both would keep or move DOM the table no longer owns.
- How often a cell may flash, and whether a reduced-motion skin shows anything, is the skin's. A change that matters beyond decoration needs a sign that does not rely on color, and any announcement is the consumer's; the table announces nothing.

## Trade-off

Automatic detection costs a comparison per update (by reference first, then by structure for the rows that are new objects), a hint the consumer may give, and a written limit for the consumers that give none. In exchange no consumer writes diffing code, the duration has one source, and a resumed fade keeps its true remaining time.
