// The plugins' options and APIs are typed through TanStack's declaration
// merging (spike/REPORT.md at fb3485b, finding 4): `pnpm typecheck` checks this file, the
// `@ts-expect-error` lines fail it when a wrong option stops being an error.
import type { Query } from '@dolusoft/query-protocol'
import {
  columnFilteringFeature,
  constructTable,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { start } from './support/table'
import { filterInputFeature } from '../src/features/filter-input'
import { serverQueryFeature } from '../src/features/server-query'

const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  serverQueryFeature,
  filterInputFeature
})

describe('typed plugin options and APIs', () => {
  it('needs no cast', () => {
    const table = constructTable({
      features,
      columns: [{ id: 'name', accessorKey: 'name', filterType: 'string' }],
      data: [{ name: 'a' }],
      query: start(),
      onQueryChange: (query, reason) => {
        expectTypeOf(query).toEqualTypeOf<Query>()
        expectTypeOf(reason).toEqualTypeOf<
          'page' | 'pageSize' | 'sort' | 'filter' | 'reset' | 'search'
        >()
      },
      filterDebounce: 50
    })
    expectTypeOf(table.getBaseQuery).returns.toEqualTypeOf<Query>()
    expectTypeOf(table.flushPendingFilters).returns.toEqualTypeOf<boolean>()
    expectTypeOf(
      table.getColumn('name')!.toggleQuerySorting
    ).returns.toEqualTypeOf<void>()
    expect(table.store.state.filterDrafts).toEqual({})
  })

  it('rejects wrong options', () => {
    const make = () =>
      constructTable({
        features,
        columns: [
          // @ts-expect-error -- not a column type
          { id: 'name', accessorKey: 'name', filterType: 'text' }
        ],
        data: [{ name: 'a' }],
        // @ts-expect-error -- not a query
        query: { page: 1 },
        onQueryChange: () => {}
      })
    expect(make).toBeTypeOf('function')
  })
})
