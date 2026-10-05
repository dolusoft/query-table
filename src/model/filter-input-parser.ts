/**
 * Filter Input Parser
 *
 * Parses user input from filter fields to detect operator shortcuts
 * and produce clean values with the appropriate condition types.
 *
 * Supported operators:
 *   *value*  → Contains
 *   value*   → StartsWith
 *   *value   → EndsWith
 *   !value   → NotEqual
 *   !*value* → NotContains
 *   !value*  → NotContains (fallback - backend has no NotStartsWith)
 *   !*value  → NotContains (fallback - backend has no NotEndsWith)
 *   a,b      → Multiple rules (OR logic)
 *   (none)   → Equal
 */

export interface ParsedFilterRule {
  /** Cleaned value with operators stripped */
  value: string
  /** Detected condition type */
  condition:
    | 'Contains'
    | 'NotContains'
    | 'Equal'
    | 'NotEqual'
    | 'StartsWith'
    | 'EndsWith'
}

export interface ParsedFilterResult {
  /** Parsed filter rules (one per comma-separated segment) */
  rules: ParsedFilterRule[]
  /** Condition of the first/primary rule (for floating label display) */
  displayCondition: string
  /** Whether any operator shortcut was detected in the input */
  isOperatorDetected: boolean
}

/**
 * Parse a single segment (no commas) into a filter rule.
 */
function parseSingleSegment(
  input: string
): { rule: ParsedFilterRule; operatorDetected: boolean } | null {
  let value = input.trim()
  if (value === '') {
    return null
  }

  // Check negation prefix
  const negated = value.startsWith('!')
  if (negated) {
    value = value.substring(1)
  }

  // After removing '!', check if value is empty or only wildcards
  if (value === '' || value === '*' || /^\*+$/.test(value)) {
    return null
  }

  const startsWithStar = value.startsWith('*')
  const endsWithStar = value.endsWith('*')
  let condition: ParsedFilterRule['condition']
  let operatorDetected = negated

  if (startsWithStar && endsWithStar && value.length > 1) {
    // *value* → Contains / !*value* → NotContains
    value = value.substring(1, value.length - 1)
    condition = negated ? 'NotContains' : 'Contains'
    operatorDetected = true
  } else if (endsWithStar) {
    // value* → StartsWith / !value* → NotContains (fallback)
    value = value.substring(0, value.length - 1)
    condition = negated ? 'NotContains' : 'StartsWith'
    operatorDetected = true
  } else if (startsWithStar) {
    // *value → EndsWith / !*value → NotContains (fallback)
    value = value.substring(1)
    condition = negated ? 'NotContains' : 'EndsWith'
    operatorDetected = true
  } else if (negated) {
    // !value → NotEqual
    condition = 'NotEqual'
  } else {
    // No operator → Equal
    condition = 'Equal'
  }

  // After stripping operators, check if value is empty
  if (value.trim() === '') {
    return null
  }

  return {
    rule: { value: value.trim(), condition },
    operatorDetected
  }
}

/**
 * Parse a filter input string with operator shortcuts.
 *
 * @param rawInput - The raw user input from the filter field
 * @returns Parsed result with rules, display condition, and operator detection flag
 *
 * @example
 * parseFilterInput('*facebook*')
 * // → { rules: [{ value: 'facebook', condition: 'Contains' }], displayCondition: 'Contains', isOperatorDetected: true }
 *
 * @example
 * parseFilterInput('!*youtube*,*vimeo*')
 * // → { rules: [
 * //     { value: 'youtube', condition: 'NotContains' },
 * //     { value: 'vimeo', condition: 'Contains' }
 * //   ], displayCondition: 'NotContains', isOperatorDetected: true }
 */
export function parseFilterInput(rawInput: string): ParsedFilterResult {
  const empty: ParsedFilterResult = {
    rules: [],
    displayCondition: '',
    isOperatorDetected: false
  }

  if (!rawInput || typeof rawInput !== 'string') {
    return empty
  }

  const trimmed = rawInput.trim()
  if (trimmed === '') {
    return empty
  }

  // Split by comma for multi-value support
  const segments = trimmed.split(',')
  const rules: ParsedFilterRule[] = []
  let anyOperatorDetected = false

  for (const segment of segments) {
    const result = parseSingleSegment(segment)
    if (result) {
      rules.push(result.rule)
      if (result.operatorDetected) {
        anyOperatorDetected = true
      }
    }
  }

  if (rules.length === 0) {
    return empty
  }

  return {
    rules,
    displayCondition: rules[0].condition,
    isOperatorDetected: anyOperatorDetected
  }
}
