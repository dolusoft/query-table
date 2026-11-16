import { parseFilterInput as parse } from '@dolusoft/query-protocol'

import type { Column, FilterCondition, FilterRule } from '../contract'

/**
 * The rules the table emits when `text` is typed into the filter input of
 * `column` (C-53): the same grammar and the same coercion per column type.
 *
 * - `string`: operator shortcuts (`*a*`, `a*`, `*a`, `!a`, `!*a*`, `a,b`);
 *   a segment without an operator uses `condition`.
 * - `number`: one rule per comma-separated number value; a value after `!`
 *   is `NotEqual` (`80,443`, `!80,!443`). A value that is not a finite
 *   number, a list that mixes `!` and plain values, or a list without `!`
 *   whose `condition` is a comparison (`0,5` with `GreaterThan`), gives
 *   `[]`. The comma always separates; a decimal is written with a dot.
 * - `integer`: the same, but only whole numbers in the safe range; `2.5`
 *   and `9007199254740993` give `[]`.
 * - `bool`: `'true'` or `'false'` gives one rule with a boolean value;
 *   anything else gives `[]`.
 * - `date` and `datetime`: one rule with the trimmed text as its value; the
 *   text is not validated, as the input already gives an ISO date.
 *
 * `condition` is the one picked in the filter menu; without it the column's
 * `filterDefaultCondition` applies (C-117), else the type's default
 * (`Contains` for text, `Equal` otherwise). Empty or
 * blank text, and text that is only operators (`*`, `!`, `!*`), gives `[]`.
 * Invalid input never throws. Pure: no Vue, no DOM; the column is not written.
 * The grammar is the protocol's (`@dolusoft/query-protocol`).
 */
export function parseFilterInput(
  text: string,
  column: Column,
  condition: FilterCondition | null = null
): FilterRule[] {
  return parse(text, column, condition)
}
