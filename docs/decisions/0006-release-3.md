# 0006 Releasing 3.0.0: the `next` branch and the equivalence gate

Status: Accepted (2026-10-06)

## Context

2.2.x is in production in frontendx. v3 replaces its implementation and splits it into three packages; the behavior must not change. Both reviews found the baseline itself inconsistent before the work started: C-04 allowed at most two updates for one action, while two pending filter inputs before a sort gave three. That was fixed on `main` first (#31: pending inputs are applied in one `filter` update).

## Decision

- The three packages are versioned together and released as 3.0.0.
- Work happens on the long-lived branch `next`. Pull requests target `next`; `main` and 2.2.x releases are not touched by v3 work. Fixes to the 2.2.x baseline go to `main` in their own pull request and are merged into `next`.
- Order, three pull requests into `next`: PR-A fences, ADRs, principle draft, test harness, feasibility spike; PR-B workspace, protocol and core packages; PR-C Vue package, playground, equivalence, budgets.
- The test suite is split. `tests/contract/**` holds the behavior specs that use only the public API; they run unchanged against any version. `src/**` (later `packages/*/src/**`) holds the internal unit specs, which are tied to an implementation. Tests import the package by name (`@dolusoft/query-table`); an alias decides which build answers.
- Equivalence gate: `scripts/equivalence.mjs` runs `tests/contract/**` (unit and browser) against a baseline build and a candidate build, and compares the result of every test and the ordered `update:query` trace (query and reason) of every test. 3.0.0 ships only with zero differences against the 2.2.x baseline. Render counts are reported, not compared: v3 re-baselines them.
- frontendx acceptance replaces "one-line migration": the three published tarballs install into frontendx and its tests pass.
- The principle text (`PRINCIPLES.md`) and 3.0.0 need Zahid's approval. The draft may be merged into `next`; it reaches `main` only approved.

## Consequences

- `next` must stay green in CI on every pull request.
- The baseline of the gate is a tarball packed from `main` until 2.2.12 is published; the script also takes a published version.

## Trade-off

A long-lived branch drifts from `main`. The cost is kept low by keeping `main` changes small and merging them into `next` as they land.
