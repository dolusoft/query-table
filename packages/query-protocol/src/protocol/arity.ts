import { noValueConditions, rangeConditions } from './constants'
import type { FilterCondition } from './types'

/**
 * How many values a rule of `condition` has: `0` for `IsNull` and
 * `IsNotNull`, `2` for `Between` (`value` and `value2`), `1` for every other
 * condition. A name the protocol does not know counts as `1`, as a 3.12 rule.
 */
export const conditionArity = (condition: FilterCondition): 0 | 1 | 2 =>
  (noValueConditions as readonly string[]).includes(condition)
    ? 0
    : (rangeConditions as readonly string[]).includes(condition)
      ? 2
      : 1
