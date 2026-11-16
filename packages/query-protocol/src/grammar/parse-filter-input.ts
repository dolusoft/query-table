import { rulesFromDraft } from './draft'
import type {
  FilterColumn,
  FilterCondition,
  FilterRule
} from '../protocol/types'

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
 * `IsNull` and `IsNotNull` give their one rule, without a `value`, whatever
 * the text (C-113). `Between` gives `[]`: its two bounds are two inputs, and
 * one text holds one (C-114). Any condition is taken: a column's
 * `filterConditions` only drives the table's menu (C-112), so passing one of
 * the 3.13 conditions here is an explicit opt-in.
 * Invalid input never throws. Pure: no framework, no DOM; the column is not
 * written.
 */
export function parseFilterInput(
  text: string,
  column: FilterColumn,
  condition: FilterCondition | null = null
): FilterRule[] {
  // Runtime guard for JavaScript callers: the type says `string`, but an
  // untyped caller may pass `null`, a number or a URL parameter that is absent.
  if (typeof text !== 'string') {
    return []
  }
  return rulesFromDraft(column, { text, condition })
}
