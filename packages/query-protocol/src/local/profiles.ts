// The names this build answers to. Kept apart from the tables and the
// evaluator, so importing a list does not bundle them.

/** Semantics profiles this build implements. Immutable: a profile never changes meaning. */
export const profiles = ['tr-1'] as const

/** A semantics profile: the meaning of text, order and time of a query. */
export type SemanticsProfile = (typeof profiles)[number]

/**
 * Top-level query keys this evaluator rejects with `unsupported-extension`.
 * Frozen for 3.x; future execution forms go to a versioned envelope.
 */
export const reservedQueryKeys = [
  'sorts',
  'any',
  'group',
  'aggregates'
] as const
