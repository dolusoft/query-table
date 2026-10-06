// @dolusoft/query-protocol/local: evaluates a query over rows held in
// memory, with a named semantics profile. A data-source helper, not table
// behaviour: the default entry never exports or imports it (C-75, ADR 0008).
// Zero dependencies; it reaches only protocol/{types,constants,query}.

/** The semantics profiles of this build. */
export const profiles = ['tr-1'] as const

/** A semantics profile: the meaning of text, order and time of a query. */
export type SemanticsProfile = (typeof profiles)[number]
