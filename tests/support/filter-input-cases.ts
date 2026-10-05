import type {
  Column,
  ColumnType,
  FilterCondition,
  FilterRule,
  FilterValue
} from '../../src/contract'

// One table of filter inputs and the rules they stand for (C-53). The unit
// test of `parseFilterInput` and the test that types the same text into the
// table's filter input both read it, so the exported function and the UI
// cannot drift apart.

export interface FilterInputCase {
  type: ColumnType
  text: string
  /** Condition picked in the filter menu first; the type default without it. */
  condition?: FilterCondition
  /** `[condition, value]` of each rule, in order. */
  expected: Array<[FilterCondition, FilterValue]>
}

export const filterInputColumn = (type: ColumnType): Column => ({
  field: 'value',
  title: 'Value',
  type
})

export const rulesOf = (expected: FilterInputCase['expected']): FilterRule[] =>
  expected.map(([condition, value]) => ({ field: 'value', condition, value }))

export const filterInputCases: FilterInputCase[] = [
  // Text: the shortcuts of C-15.
  { type: 'string', text: 'ank', expected: [['Contains', 'ank']] },
  { type: 'string', text: '*ank*', expected: [['Contains', 'ank']] },
  { type: 'string', text: 'ank*', expected: [['StartsWith', 'ank']] },
  { type: 'string', text: '*ank', expected: [['EndsWith', 'ank']] },
  { type: 'string', text: '!ank', expected: [['NotEqual', 'ank']] },
  { type: 'string', text: '!*ank*', expected: [['NotContains', 'ank']] },
  { type: 'string', text: '!ank*', expected: [['NotContains', 'ank']] },
  {
    type: 'string',
    text: ' a , b* ',
    expected: [
      ['Contains', 'a'],
      ['StartsWith', 'b']
    ]
  },
  {
    type: 'string',
    text: 'a,,*,b',
    expected: [
      ['Contains', 'a'],
      ['Contains', 'b']
    ]
  },
  {
    type: 'string',
    text: 'ank',
    condition: 'Equal',
    expected: [['Equal', 'ank']]
  },
  {
    type: 'string',
    text: '*ank',
    condition: 'Equal',
    expected: [['EndsWith', 'ank']]
  },
  { type: 'string', text: '*', expected: [] },
  { type: 'string', text: '!', expected: [] },
  { type: 'string', text: '!*', expected: [] },
  { type: 'string', text: '   ', expected: [] },
  // Numbers: one rule with a number value (C-16).
  { type: 'integer', text: '42', expected: [['Equal', 42]] },
  { type: 'number', text: '-3.5', expected: [['Equal', -3.5]] },
  {
    type: 'number',
    text: '10',
    condition: 'GreaterThan',
    expected: [['GreaterThan', 10]]
  },
  { type: 'number', text: 'abc', expected: [] },
  { type: 'integer', text: '2.5', expected: [] },
  // Bool: the select's values.
  { type: 'bool', text: 'true', expected: [['Equal', true]] },
  { type: 'bool', text: 'false', expected: [['Equal', false]] },
  { type: 'bool', text: 'yes', expected: [] },
  // Dates: the input's ISO text, as a string.
  { type: 'date', text: '2024-03-20', expected: [['Equal', '2024-03-20']] },
  {
    type: 'date',
    text: '2024-03-20',
    condition: 'LessThan',
    expected: [['LessThan', '2024-03-20']]
  }
]

export const caseName = (item: FilterInputCase) =>
  `${item.type} ${JSON.stringify(item.text)}${item.condition ? ` with ${item.condition}` : ''}`
