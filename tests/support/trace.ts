import { afterEach, beforeEach } from 'vitest'

import type { QueryChangeReason, TableQuery } from '@dolusoft/query-table'

// Every `update:query` a test sees, in order, is stored on the test's `meta`
// (`updates`). The JSON reporter writes it out, and `scripts/equivalence.mjs`
// compares the traces of two builds test by test. The helpers that mount the
// table (`mount-table.ts`, `helpers.ts`) call `traceUpdate`; this file is a
// setup file of the unit and browser projects.

export interface TracedUpdate {
  reason: QueryChangeReason
  query: TableQuery
}

declare module 'vitest' {
  interface TaskMeta {
    updates?: TracedUpdate[]
  }
}

// On `globalThis` so that a helper module and this setup file share it even
// if they are loaded as two module instances.
const key = '__queryTableTrace'
const store = globalThis as unknown as Record<typeof key, TracedUpdate[]>

const steps = (): TracedUpdate[] => (store[key] ??= [])

export const traceUpdate = (query: TableQuery, reason: QueryChangeReason) => {
  steps().push({
    reason,
    query: JSON.parse(JSON.stringify(query)) as TableQuery
  })
}

beforeEach(() => {
  store[key] = []
})

afterEach(context => {
  const updates = steps()
  if (updates.length > 0) {
    context.task.meta.updates = updates
  }
  store[key] = []
})
