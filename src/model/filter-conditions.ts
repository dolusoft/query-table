export const filterConditions: Record<
  string,
  Array<{ value: string; label: string; icon?: string }>
> = {
  string: [
    { value: '', label: 'No Filter', icon: '' },
    { value: 'Contains', label: 'Contains', icon: '⊃' },
    { value: 'NotContains', label: 'Not Contains', icon: '⊅' },
    { value: 'Equal', label: 'Equal (=)', icon: '=' },
    { value: 'NotEqual', label: 'Not Equal (≠)', icon: '≠' },
    { value: 'StartsWith', label: 'Starts With', icon: 'a..' },
    { value: 'EndsWith', label: 'Ends With', icon: '..a' },
    { value: 'IsNull', label: 'Is Empty', icon: '∅' },
    { value: 'IsNotNull', label: 'Is Not Empty', icon: '∅̸' }
  ],
  number: [
    { value: '', label: 'No Filter', icon: '' },
    { value: 'Equal', label: 'Equal (=)', icon: '=' },
    { value: 'NotEqual', label: 'Not Equal (≠)', icon: '≠' },
    { value: 'GreaterThan', label: 'Greater Than (>)', icon: '>' },
    { value: 'GreaterThanOrEqual', label: 'Greater or Equal (≥)', icon: '≥' },
    { value: 'LessThan', label: 'Less Than (<)', icon: '<' },
    { value: 'LessThanOrEqual', label: 'Less or Equal (≤)', icon: '≤' },
    { value: 'IsNull', label: 'Is Empty', icon: '∅' },
    { value: 'IsNotNull', label: 'Is Not Empty', icon: '∅̸' }
  ],
  integer: [
    { value: '', label: 'No Filter', icon: '' },
    { value: 'Equal', label: 'Equal (=)', icon: '=' },
    { value: 'NotEqual', label: 'Not Equal (≠)', icon: '≠' },
    { value: 'GreaterThan', label: 'Greater Than (>)', icon: '>' },
    { value: 'GreaterThanOrEqual', label: 'Greater or Equal (≥)', icon: '≥' },
    { value: 'LessThan', label: 'Less Than (<)', icon: '<' },
    { value: 'LessThanOrEqual', label: 'Less or Equal (≤)', icon: '≤' },
    { value: 'IsNull', label: 'Is Empty', icon: '∅' },
    { value: 'IsNotNull', label: 'Is Not Empty', icon: '∅̸' }
  ],
  date: [
    { value: '', label: 'No Filter', icon: '' },
    { value: 'Equal', label: 'Equal (=)', icon: '=' },
    { value: 'NotEqual', label: 'Not Equal (≠)', icon: '≠' },
    { value: 'GreaterThan', label: 'After (>)', icon: '>' },
    { value: 'LessThan', label: 'Before (<)', icon: '<' },
    { value: 'IsNull', label: 'Is Empty', icon: '∅' },
    { value: 'IsNotNull', label: 'Is Not Empty', icon: '∅̸' }
  ],
  datetime: [
    { value: '', label: 'No Filter', icon: '' },
    { value: 'Equal', label: 'Equal (=)', icon: '=' },
    { value: 'NotEqual', label: 'Not Equal (≠)', icon: '≠' },
    { value: 'GreaterThan', label: 'After (>)', icon: '>' },
    { value: 'LessThan', label: 'Before (<)', icon: '<' },
    { value: 'IsNull', label: 'Is Empty', icon: '∅' },
    { value: 'IsNotNull', label: 'Is Not Empty', icon: '∅̸' }
  ],
  bool: [
    { value: '', label: 'No Filter', icon: '' },
    { value: 'Equal', label: 'Equal', icon: '=' },
    { value: 'NotEqual', label: 'Not Equal', icon: '≠' }
  ]
}
