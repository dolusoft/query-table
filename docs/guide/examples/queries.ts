import {
  type CursorQuery,
  isCursorQuery,
  type PageQuery,
  parseFilterInput,
  type Query,
  type QueryChangeReason,
  queryChangeReasons
} from '@dolusoft/query-protocol'

// #region page
export const firstPage: PageQuery = {
  page: 1,
  pageSize: 20,
  sort: null,
  filters: []
}
// #endregion page

// #region cursor
export const firstCursorPage: CursorQuery = {
  cursor: null,
  pageSize: 50,
  sort: null,
  filters: []
}

export const nextCursorPage: CursorQuery = {
  ...firstCursorPage,
  cursor: { token: 'eyJpZCI6NDJ9', direction: 'next' }
}
// #endregion cursor

// #region narrow
export function describePaging(query: Query): string {
  return isCursorQuery(query)
    ? `cursor ${query.cursor?.token ?? '(first page)'}`
    : `page ${query.page}`
}
// #endregion narrow

// #region grammar
// What a user types into a filter input becomes clean rules. The shortcuts
// (`*`, `!`, `,`) never reach the query.
export const nameRules = parseFilterInput('ali*,!veli', { field: 'name' })
// [
//   { field: 'name', condition: 'StartsWith', value: 'ali' },
//   { field: 'name', condition: 'NotEqual', value: 'veli' }
// ]

export const ageRules = parseFilterInput('18', { field: 'age', type: 'number' })
// [{ field: 'age', condition: 'Equal', value: 18 }]

export const noRules = parseFilterInput('2.5', {
  field: 'count',
  type: 'integer'
})
// [] (an integer column takes whole numbers only)
// #endregion grammar

// #region reasons
export const reasons: readonly QueryChangeReason[] = queryChangeReasons
// ['page', 'pageSize', 'sort', 'filter', 'reset', 'search']
// #endregion reasons
