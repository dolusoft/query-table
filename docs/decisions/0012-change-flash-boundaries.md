# 0012 Change flash: the query boundary with a hint, and cells bound under a row (3.3)

Status: Accepted (2026-10-07). Supersedes the query clause of K33-3 in ADR 0011 and adds to K33-9; the rest of ADR 0011 stands. Taken by the main session during the implementation of ADR 0011: the review of the implementation PR found that the next page of an infinite list cleared the running flashes (K33-13), and a later round found the cell of a column shown during a row flash (K33-14); the record is separate because a record is not edited to change its decision.

## Context

ADR 0011 K33-3 says that a query change clears every mark and pending job. The implementation of the flash met infinite scroll (ADR 0010): the request for the next page changes the query (its window), so every flash running on the rows already shown vanished the moment the user scrolled to the bottom, and the page that came back was a baseline anyway. On a live list that is the moment the user is looking at.

K33-9 binds the elapsed time to an element bound after its flash began. It did not say what a cell mounted under a row that is already bound gets: a column shown during a row flash inherited the row's older value through the cascade, or, with its own fresh flash, nothing to block it.

## Decision

- **With a hint, a query change clears when its answer arrives (K33-13).** Without `rowsUpdate` a query change clears at once, as K33-3 says. With it, the marks and pending jobs stay until the first `rows` after the change, and go with them unless those `rows` are tagged `append`: an `append` answer clears nothing, so the flashes running on the rows already shown survive the next page. The first `rows` after a query change are still a baseline whatever the hint says, so those first rows never flash, whether an answer or a page; the limits of K33-2 stand (live rows for the old query that arrive first are taken as the answer). The other boundaries of K33-3 (a `snapshot` or `reset`, a new `rowKey`) are unchanged. That a sort answer never shows an old flash now assumes the answer is not tagged `append`: a consumer that leaves the tag of its last page on a sort answer keeps the old flashes on the sorted rows.
- **A cell mounted under a bound row is bound to the row's flash (K33-14).** A cell mounted while its row flashes (a column shown) is bound to that row flash with its own elapsed value instead of inheriting the row's older one; a cell with its own fresh flash blocks the row's value with `0ms`. A cell moved without a mount (a column pinned later) is not bound again; if the browser restarts its animation on the move, it runs from the value of its last bind. That edge is accepted: binding on every move would mean watching the layout.

## Options considered

- **Keep K33-3 as written.** For: one rule, no hint dependence. Against: infinite scroll drops every running flash on each page request, which is the case the feature is for. Rejected.
- **Exempt only the window part of the query.** For: no wait for the answer. Against: the table would have to know which part of the query is the page window, which the protocol does not mark; the consumer's `append` tag already says it. Rejected.
- **Let a cell mounted under a bound row inherit the row's value (K33-9 as written).** For: no per-cell memory. Against: the inherited value is the time gone when the row was bound, older than the row's flash at the cell's mount, so the cell's animation runs behind the row's. Rejected; the cost is one `WeakMap` entry per cell seen under a flashing row.

## Consequences

- C-92 (`contract/rules.md`) states the boundary with and without the hint; the tracker keeps a pending reset between the query change and its answer.
- A consumer that sends no hint keeps the behavior of K33-3: its next page clears the running flashes. The guide shows `rowsUpdate: 'append'` for infinite lists.
- P5's `Check:` line names the CSS leak gate as it is run (`pnpm check:no-css-leak`, after the build) and the patterns it scans; the principle itself is unchanged.

## Trade-off

The hint path gains one state (a reset waiting for its answer) and a rule that depends on the tag. In exchange a live, infinitely scrolled list keeps its flashes while it loads more, and a shown column never restarts a cell from an older time than its row.
