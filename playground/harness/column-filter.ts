import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

import type {
  Column,
  ColumnType,
  FilterCondition,
  FilterRule
} from '../../src/contract'
import { parseFilterInput } from '../../src/index'

// Consumer-side helpers behind the compact (phone) filter UI of the
// playground: the condition list a sheet offers, the text a chip shows, and
// the draft a sheet edits. The table only sees the `query.filters` they write.

/** Width under which a page drops the header filter row (container, not viewport). */
const COMPACT_WIDTH = 640

/** Tracks whether `target` is narrower than `limit`, by its own width. */
export function useCompact(
  target: Ref<HTMLElement | null>,
  limit = COMPACT_WIDTH
): Ref<boolean> {
  const compact = ref(false)
  let observer: ResizeObserver | undefined
  onMounted(() => {
    const el = target.value
    if (!el) {
      return
    }
    compact.value = el.getBoundingClientRect().width < limit
    // Switching modes changes the element's content; doing it in the next
    // frame keeps the observer out of a "loop completed" error.
    observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width < limit
      requestAnimationFrame(() => {
        compact.value = next
      })
    })
    observer.observe(el)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return compact
}

export const typeOf = (column: Column): ColumnType =>
  (column.type?.toLowerCase() as ColumnType | undefined) ?? 'string'

export const titleOf = (column: Column) => column.title ?? column.field

const words: Record<FilterCondition, string> = {
  Contains: 'contains',
  NotContains: 'does not contain',
  Equal: 'equals',
  NotEqual: 'is not',
  StartsWith: 'starts with',
  EndsWith: 'ends with',
  GreaterThan: 'greater than',
  GreaterThanOrEqual: 'at least',
  LessThan: 'less than',
  LessThanOrEqual: 'at most'
}
const temporalWords: Partial<Record<FilterCondition, string>> = {
  GreaterThan: 'after',
  LessThan: 'before'
}

const conditionsByType: Record<ColumnType, FilterCondition[]> = {
  string: [
    'Contains',
    'NotContains',
    'Equal',
    'NotEqual',
    'StartsWith',
    'EndsWith'
  ],
  number: [
    'Equal',
    'NotEqual',
    'GreaterThan',
    'GreaterThanOrEqual',
    'LessThan',
    'LessThanOrEqual'
  ],
  integer: [
    'Equal',
    'NotEqual',
    'GreaterThan',
    'GreaterThanOrEqual',
    'LessThan',
    'LessThanOrEqual'
  ],
  date: ['Equal', 'NotEqual', 'GreaterThan', 'LessThan'],
  datetime: ['Equal', 'NotEqual', 'GreaterThan', 'LessThan'],
  bool: ['Equal', 'NotEqual']
}

const wordOf = (type: ColumnType, condition: FilterCondition) =>
  (type === 'date' || type === 'datetime'
    ? temporalWords[condition]
    : undefined) ?? words[condition]

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)

/** Conditions a sheet offers for the column, with a sentence-case label. */
export const conditionsFor = (column: Column) => {
  const type = typeOf(column)
  return conditionsByType[type].map(value => ({
    value,
    label: capitalize(wordOf(type, value))
  }))
}

const defaultCondition = (column: Column): FilterCondition =>
  typeOf(column) === 'string' ? 'Contains' : 'Equal'

/** "City contains ank", "Age greater than 30 or less than 20". */
export function describeRules(column: Column, rules: FilterRule[]): string {
  const type = typeOf(column)
  const negative = rules.every(
    rule => rule.condition === 'NotEqual' || rule.condition === 'NotContains'
  )
  const parts = rules.map(
    rule => `${wordOf(type, rule.condition)} ${String(rule.value)}`
  )
  return `${titleOf(column)} ${parts.join(negative ? ' and ' : ' or ')}`
}

export interface FilterDraft {
  condition: FilterCondition
  text: string
  /**
   * The rules in the query cannot be shown in one input (several rules, or a
   * value the grammar would read differently). The sheet shows them as a
   * summary; an empty input then keeps them.
   */
  summary: string | null
}

/** Whether two rule lists for one column are the same rules, in order. */
export const same = (a: FilterRule[], b: FilterRule[]) =>
  a.length === b.length &&
  a.every(
    (rule, index) =>
      rule.condition === b[index].condition && rule.value === b[index].value
  )

/** The draft a sheet starts from: built from the committed rules every time it opens. */
export function draftFrom(column: Column, rules: FilterRule[]): FilterDraft {
  if (rules.length === 0) {
    return { condition: defaultCondition(column), text: '', summary: null }
  }
  if (rules.length === 1) {
    const [rule] = rules
    const text = String(rule.value)
    // Only when typing the value back gives the very same rule; `a*` with
    // `Equal` would come back as `StartsWith`.
    if (same(parseFilterInput(text, column, rule.condition), rules)) {
      return { condition: rule.condition, text, summary: null }
    }
  }
  return {
    condition: defaultCondition(column),
    text: '',
    summary: describeRules(column, rules)
  }
}

export type DraftResult =
  | { kind: 'rules'; rules: FilterRule[] }
  | { kind: 'keep' }
  | { kind: 'error'; message: string }

const invalidMessage: Partial<Record<ColumnType, string>> = {
  number: 'Enter a number, for example 30.',
  integer: 'Enter a whole number, for example 30.',
  bool: 'Pick yes or no.',
  date: 'Enter a date as yyyy-mm-dd.',
  datetime: 'Enter a date and time.'
}

/** What applying a draft does: new rules for the column, nothing, or an error to show. */
export function commitDraft(column: Column, draft: FilterDraft): DraftResult {
  const text = draft.text.trim()
  if (text === '') {
    return draft.summary ? { kind: 'keep' } : { kind: 'rules', rules: [] }
  }
  const type = typeOf(column)
  if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { kind: 'error', message: invalidMessage.date! }
  }
  const rules = parseFilterInput(text, column, draft.condition)
  if (rules.length === 0) {
    return {
      kind: 'error',
      message: invalidMessage[type] ?? 'Enter a value to filter by.'
    }
  }
  return { kind: 'rules', rules }
}

/**
 * Whether a key event belongs to an input method composing a word: its Enter
 * picks a candidate and must not apply the filter. Some browsers report the
 * Enter that ends a composition only through `keyCode` 229.
 */
export const isComposing = (event: KeyboardEvent) =>
  event.isComposing || event.keyCode === 229
