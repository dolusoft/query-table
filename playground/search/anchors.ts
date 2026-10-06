// Stable element ids on a playground page, shared by the page sections and
// the documentation search that scrolls to them.

/** The kinds of API member a page lists, as keyed in contract/api.json. */
export type MemberKind =
  'props' | 'emits' | 'slots' | 'exposed' | 'functions' | 'types'

const slug = (text: string) =>
  text.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')

/** The id of one row of the API panel, e.g. `api-props-totalRows`. */
export const memberAnchor = (kind: MemberKind, name: string) =>
  `api-${kind}-${slug(name)}`

/** The id of one behavior rule in "Covered rules", e.g. `rule-C-01`. */
export const ruleAnchor = (id: string) => `rule-${slug(id)}`

/** The fixed sections every page has. */
export const sectionAnchors = {
  example: 'section-example',
  source: 'section-source',
  api: 'section-api',
  rules: 'section-rules'
} as const
