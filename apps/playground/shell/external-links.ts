import { repositoryUrl } from '../home/home-content'

// The small outside links with a logo: the TanStack Table docs, the GitHub
// repository, its releases and `llms.txt`. The sidebar, the home page header,
// the home page footer and the home page body show them from this one list.
// `links.spec.ts` (`pnpm check:links`) asks the network about the absolute
// URLs; `llms.txt` is a file of this site and is generated at build time.

export type ExternalLinkIcon = 'tanstack' | 'github' | 'releases' | 'llms'

export interface ExternalLink {
  id: ExternalLinkIcon
  label: string
  /** Absolute URL, or a path under the site base when `local` is set. */
  url: string
  local?: boolean
}

export const tanstackDocsUrl = 'https://tanstack.com/table/v9/docs/overview'

export const externalLinks: ExternalLink[] = [
  { id: 'tanstack', label: 'TanStack Table', url: tanstackDocsUrl },
  { id: 'github', label: 'GitHub', url: repositoryUrl },
  { id: 'releases', label: 'Releases', url: `${repositoryUrl}/releases` },
  { id: 'llms', label: 'llms.txt', url: 'llms.txt', local: true }
]

/** The URL to put in `href`: a local file resolves against the site base. */
export const hrefOf = (link: ExternalLink, base: string) =>
  link.local ? `${base}${link.url}` : link.url
