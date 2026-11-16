import { columnTypeOf } from './column-type'
import { defaultConditionOf } from './conditions'
import { cidrOf, isIp, rangeOfCidr } from './ip'
import { hasShortcut, parseShortcuts, serializeFilterRules } from './shortcuts'
import { conditionArity } from '../protocol/arity'
import type {
  ColumnType,
  FilterColumn,
  FilterCondition,
  FilterRule,
  FilterValue,
  NoValueFilterRule,
  RangeFilterRule,
  ValueCondition,
  ValueFilterRule
} from '../protocol/types'

/**
 * What the user has typed or picked for one column. It is a writing buffer,
 * not part of the query: the query only changes when the draft is applied.
 */
export interface Draft {
  /** The typed text; with `Between`, the lower bound. */
  text: string
  /** With `Between`, the typed upper bound. Absent otherwise. */
  text2?: string
  /** Condition picked from the menu; `null` means the type default. */
  condition: FilterCondition | null
  /**
   * Set when the query holds several rules for a column whose input cannot
   * write them (anything but text): how many. The input is then a read-only
   * summary and the draft is not applied until something replaces it.
   */
  multi?: number
}

/** A rule without its `field`, kept per member so `condition` still picks the operands. */
type WithoutField<R> = R extends FilterRule ? Omit<R, 'field'> : never

/**
 * The rules a draft parses to: condition and operands, the field is the
 * column's. Each entry is one member of `FilterRule` without `field`, so a
 * `Between` entry has `value2` and an `IsNull` entry has no `value`.
 */
export type Parsed = Array<WithoutField<FilterRule>>

/** One operand typed into an input of a column that is not text, or `null`. */
const operandOf = (type: ColumnType, raw: string): FilterValue | null => {
  const text = raw.trim()
  if (text === '') {
    return null
  }
  switch (type) {
    case 'number': {
      const value = Number(text)
      return Number.isFinite(value) ? value : null
    }
    case 'integer': {
      // A whole number in the safe range only: `2.5` is no rule, and neither
      // is `2^53`, which a number cannot hold exactly (C-16).
      const value = Number(text)
      return Number.isSafeInteger(value) ? value : null
    }
    case 'bool':
      return text === 'true' || text === 'false' ? text === 'true' : null
    case 'ip':
      return isIp(text) ? text : null
    default:
      return text
  }
}

/**
 * The `Between` rule of two typed bounds, on a column that has an order
 * (C-114): both bounds must read, or there is no rule. The bounds are never
 * swapped.
 */
const parseRange = (type: ColumnType, draft: Draft): Parsed => {
  if (type === 'string' || type === 'bool') {
    return []
  }
  const value = operandOf(type, draft.text)
  const value2 = operandOf(type, draft.text2 ?? '')
  // IPv4 and IPv6 bounds do not make one range (C-118).
  return value === null ||
    value2 === null ||
    (type === 'ip' && isV6(value) !== isV6(value2))
    ? []
    : [{ condition: 'Between', value, value2 }]
}

const isV6 = (value: FilterValue) => String(value).includes(':')

const isNumeric = (type: ColumnType) => type === 'number' || type === 'integer'

/** Types whose text is a list of exact values (C-16, C-118). */
const isListed = (type: ColumnType) => isNumeric(type) || type === 'ip'

/**
 * The conditions a number list may carry (C-16). An OR of bounds is its
 * loosest bound, so a list of bounds says nothing a single bound does not, and
 * it hides a decimal comma: `0,5` typed for 0.5 with `>` would filter `> 0`.
 */
const takesList = (condition: FilterCondition) =>
  condition === 'Equal' || condition === 'NotEqual'

/**
 * The rules of a number, integer or ip draft (C-16, C-118): one per comma-separated
 * value, `NotEqual` for a value after `!`. Every value must read, the values
 * must all carry `!` or none, and a list without `!` takes `Equal` or
 * `NotEqual` only; otherwise there is no rule. A blank segment is skipped, as
 * in text.
 */
const parseNumberList = (
  type: ColumnType,
  text: string,
  condition: ValueCondition
): Parsed => {
  const parsed: Array<WithoutField<ValueFilterRule>> = []
  let negated = 0
  for (const raw of text.split(',')) {
    const segment = raw.trim()
    if (segment === '') {
      continue
    }
    const not = segment.startsWith('!')
    const value = operandOf(type, not ? segment.slice(1) : segment)
    if (value === null) {
      return []
    }
    negated += not ? 1 : 0
    parsed.push({ condition: not ? 'NotEqual' : condition, value })
  }
  if (negated === 0 && parsed.length > 1 && !takesList(condition)) {
    return []
  }
  return negated === 0 || negated === parsed.length ? parsed : []
}

/** The rules a draft stands for. */
export const parseDraft = (column: FilterColumn, draft: Draft): Parsed => {
  const type = columnTypeOf(column)
  // A condition without a value is a rule on its own, without text (C-113).
  if (draft.condition !== null && conditionArity(draft.condition) === 0) {
    return [{ condition: draft.condition } as WithoutField<NoValueFilterRule>]
  }
  if (draft.condition !== null && conditionArity(draft.condition) === 2) {
    return parseRange(type, draft)
  }
  const text = draft.text.trim()
  if (text === '') {
    return []
  }
  const condition = (draft.condition ??
    defaultConditionOf(column)) as ValueCondition
  if (type === 'string') {
    return parseShortcuts(text, condition) as WithoutField<ValueFilterRule>[]
  }
  if (type === 'ip' && text.includes('/')) {
    // A CIDR prefix alone is the range of its addresses (C-118).
    const bounds = condition === 'Equal' ? rangeOfCidr(text) : null
    return bounds
      ? [{ condition: 'Between', value: bounds[0], value2: bounds[1] }]
      : []
  }
  if (isListed(type)) {
    return parseNumberList(type, text, condition)
  }
  const value = operandOf(type, text)
  return value === null ? [] : [{ condition, value }]
}

/**
 * The rule of `parsed` on `field`, with its keys in the order `field`,
 * `condition`, `value`, `value2`, and only the keys its condition has: a rule
 * without a value has no `value` key, not one that is `undefined`.
 */
const ruleOf = (
  field: string,
  parsed: WithoutField<FilterRule>
): FilterRule => {
  if ('value2' in parsed) {
    const range: RangeFilterRule = {
      field,
      condition: parsed.condition,
      value: parsed.value,
      value2: parsed.value2
    }
    return range
  }
  if (parsed.value === undefined) {
    return { field, condition: parsed.condition }
  }
  return { field, condition: parsed.condition, value: parsed.value }
}

/**
 * The rules the table emits for `draft` in `column`: `parseDraft` with the
 * column's `field` on each rule. New objects, no extra property.
 */
export const rulesFromDraft = (
  column: FilterColumn,
  draft: Draft
): FilterRule[] =>
  parseDraft(column, draft).map(parsed => ruleOf(column.field, parsed))

/** Text that parses as itself: no operator, no comma, no outer spaces. */
const isPlainText = (value: string) =>
  value !== '' &&
  value === value.trim() &&
  !/[*,]/.test(value) &&
  !value.startsWith('!')

/**
 * The draft of several rules on a number, integer or ip column, when the list
 * grammar can write them (C-42, C-118): values of one condition that takes a
 * list (`80,443`) or all `NotEqual` (`!80,!443`). `null` for any other set.
 */
const numberListOf = (
  type: ColumnType,
  rules: readonly FilterRule[]
): Draft | null => {
  const [first] = rules
  const values = rules.map(rule => ('value' in rule ? rule.value : undefined))
  // A value is written only when its text reads back as the same value.
  if (
    !isListed(type) ||
    !takesList(first.condition) ||
    rules.some(rule => rule.condition !== first.condition) ||
    values.some(value => operandOf(type, String(value)) !== value)
  ) {
    return null
  }
  return first.condition === 'NotEqual'
    ? { text: values.map(value => `!${value}`).join(','), condition: null }
    : { text: values.join(','), condition: first.condition }
}

/** The draft that shows `rules` (the inverse of `parseDraft`). */
export const draftFromRules = (
  column: FilterColumn,
  rules: readonly FilterRule[]
): Draft => {
  if (rules.length === 0) {
    return { text: '', condition: null }
  }
  const [first] = rules
  const plain = rules.every(rule => conditionArity(rule.condition) === 1)
  if (!plain) {
    // A rule without a value or with two cannot be written as text: alone it
    // is its condition (and its bounds), with others the count (C-42).
    if (rules.length > 1) {
      return { text: '', condition: first.condition, multi: rules.length }
    }
    if (first.condition === 'Between') {
      // A range that is one prefix shows as the CIDR text that reads back to
      // it (C-118); any other keeps its two bounds.
      const cidr =
        columnTypeOf(column) === 'ip'
          ? cidrOf(String(first.value), String(first.value2))
          : null
      const bounds = cidr === null ? null : rangeOfCidr(cidr)
      if (
        cidr !== null &&
        bounds?.[0] === first.value &&
        bounds[1] === first.value2
      ) {
        return { text: cidr, condition: null }
      }
      return {
        text: String(first.value),
        text2: String(first.value2),
        condition: first.condition
      }
    }
    return { text: '', condition: first.condition }
  }
  if (columnTypeOf(column) === 'string') {
    // A rule written without an operator needs its condition as the base.
    const base0 = rules.find(rule => !hasShortcut(rule.condition))
    const fallback = defaultConditionOf(column)
    const base = base0?.condition ?? fallback
    // A rule of the base condition is written as plain text when the text
    // cannot be read as an operator; the others keep their shortcut.
    const text = rules
      .map(rule => {
        const value = String(rule.value)
        return rule.condition === base && isPlainText(value)
          ? value
          : serializeFilterRules([rule as ValueFilterRule])
      })
      .join(',')
    // The column's default needs no pick: its plain text reads back the same
    // (C-117).
    const picked = base0?.condition
    return {
      text,
      condition: picked === undefined || picked === fallback ? null : picked
    }
  }
  if (rules.length > 1) {
    const list = numberListOf(columnTypeOf(column), rules)
    if (list !== null) {
      return list
    }
    // One input holds one value: show the count instead of dropping rules.
    return { text: '', condition: first.condition, multi: rules.length }
  }
  return {
    text: String(first.value),
    condition: first.condition
  }
}

export const hasContent = (draft: Draft) =>
  draft.text.trim() !== '' ||
  (draft.text2 ?? '').trim() !== '' ||
  draft.condition !== null
