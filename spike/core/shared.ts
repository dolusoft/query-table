// Spike sketch of `query-table-core/src/shared/` (SPEC-v3 D1): the only
// thing the two plugins have in common. Neither plugin imports the other;
// both import this file.
//
// - `beforeAction`: a plugin that holds pending input (filterInput) registers
//   a flush; serverQuery runs the flushes before every user action.
// - dispatch: serverQuery marks every update it emits, so `runBeforeAction`
//   can tell whether a flush really emitted (C-14 drops a page action only
//   then), without filterInput knowing how emitting works.
// - dispose: TanStack's `TableFeature` has no teardown hook, so plugins
//   register their cleanup here and the framework adapter calls `dispose`.

interface Shared {
  beforeAction: (() => void)[]
  disposers: (() => void)[]
  emitted: number
}

const store = new WeakMap<object, Shared>()

const sharedOf = (table: object): Shared => {
  let shared = store.get(table)
  if (!shared) {
    shared = { beforeAction: [], disposers: [], emitted: 0 }
    store.set(table, shared)
  }
  return shared
}

export const onBeforeAction = (table: object, flush: () => void) => {
  sharedOf(table).beforeAction.push(flush)
}

export const markEmitted = (table: object) => {
  sharedOf(table).emitted += 1
}

/** Runs every registered flush; true when one of them emitted an update. */
export const runBeforeAction = (table: object): boolean => {
  const shared = sharedOf(table)
  const before = shared.emitted
  for (const flush of shared.beforeAction) {
    flush()
  }
  return shared.emitted !== before
}

export const onDispose = (table: object, cleanup: () => void) => {
  sharedOf(table).disposers.push(cleanup)
}

export const dispose = (table: object) => {
  const shared = store.get(table)
  if (!shared) {
    return
  }
  store.delete(table)
  for (const cleanup of shared.disposers) {
    cleanup()
  }
}

/** For the isolation test: whether a table still holds shared state. */
export const isTracked = (table: object): boolean => store.has(table)
