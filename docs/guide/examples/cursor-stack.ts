import type { CursorQuery, PageCursors } from '@dolusoft/query-protocol'

/**
 * A backend that only answers forward: a token in, rows and the token of the
 * next page out. (Think of a keyset on `(time, id)`.)
 */
export interface ForwardBackend<Row> {
  fetch(
    token: string | null,
    pageSize: number
  ): { rows: Row[]; next: string | null }
}

// #region stack
const first = '' // the token that stands for "the first page"

/**
 * Gives a forward-only backend the `prev` cursor the table asks for: the
 * consumer remembers the tokens of the pages already visited.
 */
export function createCursorPager<Row>(backend: ForwardBackend<Row>) {
  const visited: Array<string | null> = [] // tokens of the pages before this
  let current: string | null = null

  return (query: CursorQuery): { rows: Row[]; cursors: PageCursors } => {
    const { cursor } = query
    if (cursor === null) {
      visited.length = 0
      current = null
    } else if (cursor.direction === 'next') {
      visited.push(current)
      current = cursor.token
    } else {
      // The table asked for `prev`: go back to the page we came from.
      visited.pop()
      current = cursor.token === first ? null : cursor.token
    }
    const { rows, next } = backend.fetch(current, query.pageSize)
    const before = visited[visited.length - 1]
    return {
      rows,
      cursors: {
        next,
        // `prev` is whatever token leads back; the table does not care who
        // made it.
        prev: visited.length === 0 ? null : (before ?? first)
      }
    }
  }
}
// #endregion stack
