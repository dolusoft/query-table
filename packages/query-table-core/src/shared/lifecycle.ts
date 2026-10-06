// Teardown. TanStack's `TableFeature` has init and reset hooks but no
// dispose hook, so plugins register their cleanup here and the framework
// adapter calls `dispose` when the table goes away (for Vue, from
// `onScopeDispose`). Debounce timers must not outlive the table.
import { recordOf, takeRecord } from './registry'

/** Registers a cleanup to run when `table` is disposed. */
export const onDispose = (table: object, cleanup: () => void): void => {
  recordOf(table)?.disposers.push(cleanup)
}

/**
 * Disposes the plugin state of `table`: runs every registered cleanup once
 * and makes every later shared/ call on it a no-op. Calling it again does
 * nothing.
 */
export const dispose = (table: object): void => {
  const record = takeRecord(table)
  if (!record) {
    return
  }
  for (const cleanup of record.disposers) {
    cleanup()
  }
}
