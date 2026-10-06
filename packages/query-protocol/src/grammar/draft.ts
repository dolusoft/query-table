import { columnTypeOf } from './column-type'
import { defaultConditionFor } from './conditions'
import { hasShortcut, parseShortcuts, serializeFilterRules } from './shortcuts'
import type {
  FilterColumn,
  FilterCondition,
  FilterRule
} from '../protocol/types'

/**
 * What the user has typed or picked for one column. It is a writing buffer,
 * not part of the query: the query only changes when the draft is applied.
 */
export interface Draft {
  text: string
  /** Condition picked from the menu; `null` means the type default. */
  condition: FilterCondition | null
  /**
   * Set when the query holds several rules for a column whose input cannot
   * write them (anything but text): how many. The input is then a read-only
   * summary and the draft is not applied until something replaces it.
   */
  multi?: number
}

type Parsed = Array<Pick<FilterRule, 'condition' | 'value'>>

/** The rules a draft stands for. */
export const parseDraft = (column: FilterColumn, draft: Draft): Parsed => {
  const type = columnTypeOf(column)
  const text = draft.text.trim()
  if (text === '') {
    return []
  }
  const condition = draft.condition ?? defaultConditionFor(type)
  switch (type) {
    case 'string':
      return parseShortcuts(text, condition)
    case 'number': {
      const value = Number(text)
      return Number.isFinite(value) ? [{ condition, value }] : []
    }
    case 'integer': {
      // A whole number only: `2.5` is no rule (C-16).
      const value = Number(text)
      return Number.isInteger(value) ? [{ condition, value }] : []
    }
    case 'bool':
      return text === 'true' || text === 'false'
        ? [{ condition, value: text === 'true' }]
        : []
    default:
      return [{ condition, value: text }]
  }
}

/** Text that parses as itself: no operator, no comma, no outer spaces. */
const isPlainText = (value: string) =>
  value !== '' &&
  value === value.trim() &&
  !/[*,]/.test(value) &&
  !value.startsWith('!')

/** The draft that shows `rules` (the inverse of `parseDraft`). */
export const draftFromRules = (
  column: FilterColumn,
  rules: readonly FilterRule[]
): Draft => {
  if (rules.length === 0) {
    return { text: '', condition: null }
  }
  if (columnTypeOf(column) === 'string') {
    // A rule written without an operator needs its condition as the base.
    const plain = rules.find(rule => !hasShortcut(rule.condition))
    const base = plain?.condition ?? defaultConditionFor('string')
    // A rule of the base condition is written as plain text when the text
    // cannot be read as an operator; the others keep their shortcut.
    const text = rules
      .map(rule => {
        const value = String(rule.value)
        return rule.condition === base && isPlainText(value)
          ? value
          : serializeFilterRules([rule])
      })
      .join(',')
    return { text, condition: plain?.condition ?? null }
  }
  const [first] = rules
  if (rules.length > 1) {
    // One input holds one value: show the count instead of dropping rules.
    return { text: '', condition: first.condition, multi: rules.length }
  }
  return {
    text: String(first.value),
    condition: first.condition
  }
}

export const hasContent = (draft: Draft) =>
  draft.text.trim() !== '' || draft.condition !== null
