import type {
  ColumnType,
  FilterCondition,
  FilterConditionOption
} from '../contract'

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

/** Conditions offered per column type. */
export const filterConditions: Record<ColumnType, FilterConditionOption[]> = {
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

/** Label of a condition for a column type, falling back to the raw name. */
export const conditionLabel = (
  type: ColumnType,
  condition: FilterCondition
): string =>
  filterConditions[type].find(option => option.value === condition)?.label ??
  condition
