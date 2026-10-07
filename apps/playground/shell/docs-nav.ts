import { aiNav, guidePages } from '../guides/guides'
import { pages } from '../manifest'

// The order of the documentation: the API examples, then the guide pages
// (features, TanStack). The AI page and its two parts are a sidebar group of
// their own; in the reading order the AI page comes last.

export interface DocLink {
  id: string
  title: string
}

export const navigation: DocLink[] = [
  ...pages,
  ...guidePages.filter(page => !aiNav.some(entry => entry.id === page.id))
]

const sequence: DocLink[] = [
  ...navigation,
  ...guidePages.filter(page => page.id === 'ai')
]

/** The page before and after `path` (`/<page id>`) in the reading order. */
export const neighbours = (path: string) => {
  const index = sequence.findIndex(page => `/${page.id}` === path)
  return {
    previous: index > 0 ? sequence[index - 1] : undefined,
    next:
      index >= 0 && index < sequence.length - 1
        ? sequence[index + 1]
        : undefined
  }
}
