import { parseFilterInput as parse } from '@dolusoft/query-protocol'

import type { Column, FilterCondition, FilterRule } from '../contract'

/**
 * The rules the table emits when `text` is typed into the filter input of
 * `column` (C-53): the same grammar and the same coercion per column type.
 *
 * - `string`: operator shortcuts (`*a*`, `a*`, `*a`, `!a`, `!*a*`, `a,b`);
 *   a segment without an operator uses `condition`.
 * - `number`: one rule with a number value; text that is not a finite number
 *   gives `[]`.
 * - `integer`: the same, but only a whole number; `2.5` gives `[]`.
 * - `bool`: `'true'` or `'false'` gives one rule with a boolean value;
 *   anything else gives `[]`.
 * - `date` and `datetime`: one rule with the trimmed text as its value; the
 *   text is not validated, as the input already gives an ISO date.
 *
 * `condition` is the one picked in the filter menu; without it the column
 * type's default applies (`Contains` for text, `Equal` otherwise). Empty or
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
