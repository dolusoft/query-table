// The names this build answers to. Kept apart from the tables and the
// evaluator, so importing a list does not bundle them.

/**
 * Semantics profiles this build implements. Immutable: a profile never
 * changes meaning. `tr-2` is `tr-1` with `IsNull`, `IsNotNull` and `Between`
 * (ADR 0020).
 */
export const profiles = ['tr-1', 'tr-2'] as const

/** A semantics profile: the meaning of text, order and time of a query. */
export type SemanticsProfile = (typeof profiles)[number]

/**
 * Top-level query keys this evaluator rejects with `unsupported-extension`.
 * Frozen for 3.x, in every profile; future execution forms go to a versioned
 * envelope.
 */
export const reservedQueryKeys = [
  'sorts',
  'any',
  'group',
  'aggregates'
] as const
