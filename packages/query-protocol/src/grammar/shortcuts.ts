import type { FilterCondition, FilterValue } from '../protocol/types'

/**
 * Operator shortcuts a user can type into a text filter:
 *
 *   `*foo*`  Contains        `!*foo*` NotContains
 *   `foo*`   StartsWith      `!foo*`  NotContains (no NotStartsWith exists)
 *   `*foo`   EndsWith        `!*foo`  NotContains (no NotEndsWith exists)
 *   `!foo`   NotEqual
 *   `a,b`    two rules
 *   `foo`    the base condition
 *
 * Known limits, kept on purpose: there is no escape syntax, a comma always
 * splits, and only one leading or trailing star is read as an operator.
 */

export interface ParsedRule {
  /** Text with the operators stripped. */
  value: string
  condition: FilterCondition
}

const parseSegment = (
  input: string,
  base: FilterCondition
): ParsedRule | null => {
  let value = input.trim()
  if (value === '') {
    return null
  }

  const negated = value.startsWith('!')
  if (negated) {
    value = value.substring(1)
  }
  if (value === '' || /^\*+$/.test(value)) {
    return null
  }

  const startsWithStar = value.startsWith('*')
  const endsWithStar = value.endsWith('*')
  let condition: FilterCondition

  if (startsWithStar && endsWithStar) {
    value = value.substring(1, value.length - 1)
    condition = negated ? 'NotContains' : 'Contains'
  } else if (endsWithStar) {
    value = value.substring(0, value.length - 1)
    condition = negated ? 'NotContains' : 'StartsWith'
  } else if (startsWithStar) {
    value = value.substring(1)
    condition = negated ? 'NotContains' : 'EndsWith'
  } else if (negated) {
    condition = 'NotEqual'
  } else {
    condition = base
  }

  value = value.trim()
  return value === '' ? null : { value, condition }
}

/**
 * Turn the text of a filter input into rules. Segments without an operator use
 * `base`. Input that yields no segment (empty, `*`, `!`, `!*`) gives `[]`.
 */
export function parseShortcuts(
  raw: string,
  base: FilterCondition = 'Contains'
): ParsedRule[] {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return []
  }
  const rules: ParsedRule[] = []
  for (const segment of raw.split(',')) {
    const rule = parseSegment(segment, base)
    if (rule) {
      rules.push(rule)
    }
  }
  return rules
}

const shortcutForms: Partial<Record<FilterCondition, (v: string) => string>> = {
  Contains: v => `*${v}*`,
  StartsWith: v => `${v}*`,
  EndsWith: v => `*${v}`,
  NotContains: v => `!*${v}*`,
  NotEqual: v => `!${v}`
}

/** Whether `serializeFilterRules` writes the condition as an operator. */
export const hasShortcut = (condition: FilterCondition): boolean =>
  condition in shortcutForms

/**
 * The text that parses back to `rules`: the inverse of `parseShortcuts`.
 * Conditions without a shortcut (`Equal`, comparisons) are written as plain
 * text, so the caller must pass their condition as the parse `base`.
 */
export function serializeFilterRules(
  rules: ReadonlyArray<{
    condition: FilterCondition
    value: FilterValue
  }>
): string {
  return rules
    .map(rule => {
      const text = String(rule.value)
      return (shortcutForms[rule.condition] ?? ((v: string) => v))(text)
    })
    .join(',')
}

/**
 * Condition the user is heading for while typing, for the label under the
 * input. Partial operators (`*`, `!*`, `!`) are read before the text is
 * complete enough to parse.
 */
export function previewCondition(
  raw: string,
  base: FilterCondition
): FilterCondition {
  const text = raw.trim()
  if (text === '*') {
    return 'Contains'
  }
  if (text === '!*') {
    return 'NotContains'
  }
  if (text === '!') {
    return 'NotEqual'
  }
  return parseShortcuts(text, base)[0]?.condition ?? base
}
