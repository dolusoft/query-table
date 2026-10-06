# 0005 `useQueryTable` and `QueryTable`, and the consumer fence

Status: Accepted (2026-10-06)

## Context

2.2.x exposes one component. With TanStack underneath, a composable that returns the configured table is natural, and it lets a consumer draw the table with its own markup (for example shadcn's `Table`). Our main consumer, frontendx, has not decided on its shadcn table yet, and two paths in one product would split its tables.

## Decision

- `@dolusoft/query-table` exposes both `useQueryTable()` and `QueryTable`. `QueryTable` is built on the composable; the component holds no state logic of its own.
- The composable is documented under "advanced use".
- Fence: until frontendx decides on its shadcn table, frontendx uses only `QueryTable`. A lint rule in frontendx forbids importing `useQueryTable` and `@tanstack/*`; its message links this record.
- P10's extension order (slot, event, prop, method) still governs the public API. "Plugin first" is an implementation policy inside the packages, not a new public extension point.

## Consequences

- The public API of `QueryTable` (props, slots, events, exposed methods), the `qt-*` DOM hooks, `contract/api.json` and `contract/dom.ts` stay as in 2.2.x.
- The playground gets a second path: shadcn `Table` + `useTable` + the two plugins (PR-C).

## Trade-off

Two public entry points are more to keep stable. The fence keeps that cost inside this repository until a consumer actually needs the composable.
