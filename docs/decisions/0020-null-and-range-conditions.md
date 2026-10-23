# 0020 Conditions without a value and with two: IsNull, IsNotNull, Between (3.13)

Status: Accepted (2026-10-23), [query-table#167](https://github.com/dolusoft/query-table/issues/167). Decided by Zahid on 2026-10-23 as D-01 ([comment](https://github.com/dolusoft/query-table/issues/167#issuecomment-6371257410)), after two independent design reviews. Supersedes the clause of [ADR 0008](0008-local-query-evaluation.md) that froze the reserved names for 3.x, for the conditions `IsNull` and `IsNotNull` only.

## Context

A filter can ask for a value, but not for "no value", and a range takes two rules. A consumer whose users ask "rows with no due date" or "an age from 18 to 65" has no rule for the first, and writes the second as `GreaterThanOrEqual` plus `LessThanOrEqual`, which the filter row cannot show in one input (C-42 makes it a read-only count).

Every rule of 3.12 has one `value`. ADR 0008 reserved `IsNull` and `IsNotNull` in the evaluator, refused with `unsupported-extension`, and froze that list for 3.x: new execution forms were to go into a versioned execution envelope. A null test and a closed range are not execution forms (no grouping, no OR across fields, no second sort). They are rule shapes, one condition with no operand or with two, and they fit the rule list as it is.

The constraint of the decision owner: no major version. All three packages ship as 3.13.0 (P9).

## Decision

- **Three conditions, one rule type (K313-1).** `filterConditions` gains `IsNull`, `IsNotNull` and `Between`; `noValueConditions` and `rangeConditions` list the conditions whose rule has no value and two values. `FilterRule` stays the one exported name and becomes a union by `condition`: the one-value rule of 3.12 (`ValueFilterRule`), `Between` with `value` (the lower bound) and `value2` (the upper one, `RangeFilterRule`), and `IsNull` / `IsNotNull` with neither key (`NoValueFilterRule`). The no-value member declares `value?: undefined`, so `rule.value` still reads as `FilterValue | undefined` on any rule. A 3.12 rule is a valid 3.13 rule. There is no second rule type next to it: it would be a second surface to keep in step, and the consumers upgrade together.
- **Opt-in per column (K313-2, C-112).** `conditionOptions` does not change. `Column.filterConditions` replaces the list the menu offers for that column, leaving out what its type does not take. Without it the menu is the one of 3.12, and the table never emits a rule without a value or with two.
- **One schema, a superset (K313-3).** `query.schema.json` checks the operands by the condition: a one-value condition requires `value`, `Between` requires `value` and `value2`, `IsNull` and `IsNotNull` forbid both. `value2` on a one-value rule stays an extra property (C-60). The conformance manifest pins the schema, so its hash and `revision` move.
- **The filter row (K313-4, C-113, C-114).** A condition without a value applies at once, without text; the input is hidden, the condition label and the clear action stay. `Between` draws two inputs, lower and upper, not a comma: the comma already means several rules. A range applies once both bounds read, as one `Between` rule that replaces the rules of the field. An incomplete range is no change: the last applied query stays (C-42 amendment). Rules are built without a `value: undefined` key, and the echo comparison and `sameRules` compare `value2`.
- **`tr-2`, a new profile; `tr-1` does not move (K313-5, C-115).** `tr-2` is `tr-1` plus the three conditions. Every condition of `tr-1` keeps its meaning under `tr-2`, `NotEqual` and `NotContains` true on null included. `tr-1` keeps its refusals byte for byte: `IsNull` without a value is `invalid-query` at `/value`, with a value `unsupported-extension`, and `Between` is `unsupported-operator` (or `invalid-query` without a value). A meaning never changes under a profile name (ADR 0008), so the new meaning is a new name.
- **The meaning (K313-6).**
  1. `Between(l, u)` is `GreaterThanOrEqual l` and `LessThanOrEqual u`, each bound with its existing reading: both bounds are inclusive, and a day-only bound on a `datetime` field is that day, as it is for the one-value conditions.
  2. `Between` is allowed on `number`, `integer`, `date` and `datetime`; on `string` and `bool` it is `unsupported-operator`.
  3. A lower bound above the upper one is not an error and matches nothing, as SQL `BETWEEN` does. Neither the evaluator nor the filter row swaps the bounds.
  4. `IsNull` is true only on null (missing, `undefined` or `null`); `''`, whitespace, `0` and `false` are values. `IsNotNull` is its exact complement.
  5. Every other positive condition, `Between` included, is false on null; `IsNull` is the only way to ask for null.
  6. C-17 stays as written: the rules of a field combine with AND only when all of them are `NotEqual` or `NotContains`. `IsNotNull` is not negative because of its name.
  7. Under `tr-2` a value on a condition without one, or a missing bound, is `invalid-query` at its pointer: `/filters/i/value` or the new `/filters/i/value2`. A bound that does not fit the field is `invalid-value` at its own pointer.
  8. No `NotBetween`: two rules of the field, `< l` and `> u`, already say "outside the range".
- **The validation order of `tr-2` (K313-7).** The operand shape is checked where `tr-1` checks its one value: right after "the condition is a string", before the field, filterable, reserved and type checks, whatever the condition. That keeps every `tr-1` outcome the same under `tr-2` (the conformance runner checks it for every `tr-1` run) and the order the same for every condition. The suggestion of the design review to check the shape after the type check would have given an unknown field without `value2` a different error in the two profiles.
- **The reserved names (K313-8).** `IsNull` and `IsNotNull` leave the reserved list of `tr-2`; `tr-1` keeps them. The top-level reserved keys (`sorts`, `any`, `group`, `aggregates`) and the execution envelope of ADR 0008 do not change: the envelope stays for execution forms. ADR 0008 and the reserved-names table of `semantics.md` carry a note that points here; their text is not edited.

## Scope

In: #167.

Out, each its own change:

- `bool` columns. A bool column has a select and no menu (C-16), so it has no way to pick `IsNull`; the evaluator and the schema already take `IsNull` and `IsNotNull` on bool. Follow-up: [query-table#169](https://github.com/dolusoft/query-table/issues/169).
- `NotBetween` and open ranges with one bound (the one-value conditions say them).
- A "no value" entry in a consumer's menu over a source where an empty text is `''`, not null (a ClickHouse column that is not `Nullable`): which rule that entry should send is the consumer's decision.

## Consequences

- The API reports of the three packages change: new types (`ValueFilterRule`, `RangeFilterRule`, `NoValueFilterRule`, `ValueCondition`, `RangeCondition`, `NoValueCondition`, `FilterBound`), new values (`noValueConditions`, `rangeConditions`, `conditionArity`, `rulesFromDraft`), `Column.filterConditions`, two labels (`filterInputFrom`, `filterInputTo`), a `bound` argument of `setFilterInput` and of `filters.setInput`, and a `bound` prop of the `filter-datetime` slot.
- Consumer code that builds `{ field, condition, value }` with a `condition` typed `FilterCondition` no longer type-checks: the condition must be narrowed to `ValueCondition`. Runtime behavior does not change.
- A server that wants `tr-2` passes the conformance suite with the cases of `tr-2` (C70 to C79); one that stays on `tr-1` passes the same suite as before, plus C80.
- The DOM contract does not change: the two inputs of a range are two `.qt-filter-input` elements of one filter cell.

## Trade-off

A union instead of one shape: code that reads `rule.value` must handle `undefined`, and code that builds rules must narrow the condition. In return, the rule list says "no value" and "from, to" directly, a 3.12 rule is still valid, nothing reaches a consumer that did not opt in, and the evaluator meaning stays written per profile.

## Rules

- **C-112 Column filterConditions.** K313-2.
- **C-113 A condition without a value in the filter row.** K313-4.
- **C-114 Between in the filter row.** K313-4.
- **C-115 Profile tr-2.** K313-5, K313-6, K313-7, K313-8.
- Amended: C-17 (note), C-42 (the range), C-53 (the new conditions), C-77 and C-78 (the profile).
