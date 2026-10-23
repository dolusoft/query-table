import type {
  ColumnType,
  FilterCondition,
  FilterConditionOption
} from '../protocol/types'

const equality: FilterConditionOption[] = [
  { value: 'Equal', label: 'Equal (=)' },
  { value: 'NotEqual', label: 'Not Equal (≠)' }
]

const numeric: FilterConditionOption[] = [
  ...equality,
  { value: 'GreaterThan', label: 'Greater Than (>)' },
  { value: 'GreaterThanOrEqual', label: 'Greater or Equal (≥)' },
  { value: 'LessThan', label: 'Less Than (<)' },
  { value: 'LessThanOrEqual', label: 'Less or Equal (≤)' }
]

const temporal: FilterConditionOption[] = [
  ...equality,
  { value: 'GreaterThan', label: 'After (>)' },
  { value: 'LessThan', label: 'Before (<)' }
]

/** Conditions offered per column type, in menu order. */
export const conditionOptions: Record<ColumnType, FilterConditionOption[]> = {
  string: [
    { value: 'Contains', label: 'Contains' },
    { value: 'NotContains', label: 'Not Contains' },
    ...equality,
    { value: 'StartsWith', label: 'Starts With' },
    { value: 'EndsWith', label: 'Ends With' }
  ],
  number: numeric,
  integer: numeric,
  date: temporal,
  datetime: temporal,
  bool: equality
}

/** Text columns match by `Contains`, every other type matches exactly. */
export const defaultConditionFor = (type: ColumnType): FilterCondition =>
  type === 'string' ? 'Contains' : 'Equal'

/**
 * Labels of the conditions of 3.13 (ADR 0020). They are not in
 * `conditionOptions`: a column offers them only when it lists them itself.
 */
const addedLabels: Partial<Record<FilterCondition, string>> = {
  IsNull: 'Is Null',
  IsNotNull: 'Is Not Null',
  Between: 'Between'
}

/**
 * Label of a condition for a column type: the one in `conditionOptions`,
 * else the label of a 3.13 condition (`'Is Null'`, `'Is Not Null'`,
 * `'Between'`), else the raw name.
 */
export const conditionLabel = (
  type: ColumnType,
  condition: FilterCondition
): string =>
  conditionOptions[type].find(option => option.value === condition)?.label ??
  addedLabels[condition] ??
  condition
