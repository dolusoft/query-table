// The last few searches, kept in localStorage. Storage can be missing or
// throw (private windows, blocked site data); the search then works
// without a history.
const key = 'query-table:playground:recent-searches'
const limit = 5

export const readRecent = (): string[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export const rememberSearch = (query: string): string[] => {
  const text = query.trim()
  if (!text) {
    return readRecent()
  }
  const next = [text, ...readRecent().filter(item => item !== text)].slice(
    0,
    limit
  )
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // No storage: keep the list for this session only.
  }
  return next
}
