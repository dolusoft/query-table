import { repositoryUrl } from '../home/home-content'

// The playground pages that are not an API example: they have no entry in
// manifest.ts (which ties a page to API members and rules) but a route, a
// sidebar link and search documents of their own.

export interface GuidePage {
  /** Route path segment, also the page id. */
  id: string
  title: string
  summary: string
}

export const guidePages: GuidePage[] = [
  {
    id: 'features',
    title: 'Features',
    summary:
      'What TanStack Table has, where Query Table offers it and what a server must do.'
  },
  {
    id: 'tanstack',
    title: 'TanStack Table',
    summary:
      'The pinned TanStack Table v9 version, the features Query Table builds on and the v9 documentation.'
  },
  {
    id: 'ai',
    title: 'Use with AI',
    summary:
      'A Claude Code skill and `llms.txt` so a coding agent writes Query Table code from the real API.'
  }
]

/**
 * Raw files of `main` on GitHub: what an agent downloads. `main` holds the
 * latest release, and the Pages site that links here is built from it.
 */
const rawBase = 'https://raw.githubusercontent.com/dolusoft/query-table/main'

/** A file of the repository, shown on GitHub. */
export const blobUrl = (path: string) => `${repositoryUrl}/blob/main/${path}`

/** The files of the Claude Code skill, relative to the repository root. */
export const skillFiles = [
  'skills/query-table/SKILL.md',
  'skills/query-table/references/vue-component.md',
  'skills/query-table/references/local-query.md',
  'skills/query-table/references/tanstack-path.md',
  'skills/query-table/references/protocol-server.md'
]

export const rawUrl = (path: string) => `${rawBase}/${path}`

/**
 * The AI group of the sidebar: the page and the two parts people come for.
 * 	o is a route; the hash is a section id of the AI page (iSections).
 */
export const aiNav: Array<{ id: string; title: string; to: string }> = [
  { id: 'ai', title: 'Use with AI', to: '/ai' },
  { id: 'ai-skill', title: 'Claude Code skill', to: '/ai#ai-skill' },
  { id: 'ai-llms', title: 'llms.txt / llms-full.txt', to: '/ai#ai-llms' }
]

/** Where the skill goes in a project. */
export const skillTarget = '.claude/skills/query-table'

export const skillInstall = `# from the root of your project
mkdir -p ${skillTarget}/references
${skillFiles
  .map(path => {
    const target = `${skillTarget}/${path.slice('skills/query-table/'.length)}`
    return `curl -fsSL ${rawUrl(path)} -o ${target}`
  })
  .join('\n')}`

/** The text sections of the AI page; the search indexes them. */
export const aiSections: Array<{ id: string; title: string; text: string }> = [
  {
    id: 'ai-skill',
    title: 'The Claude Code skill',
    text: 'The skill tells a coding agent when to use `QueryTable`, `useQueryTable()` or the TanStack path, how `v-model:query` and one update per action work, the server-side Query protocol, the filter text grammar, cursor paging, selection and search, and the usual mistakes. Every API name in it is checked against the source.'
  },
  {
    id: 'ai-install',
    title: 'Add the skill to a project',
    text: `Copy the files into your project under \`${skillTarget}/\`. Claude Code picks up a skill from a folder with a \`SKILL.md\`, and loads the references when the task needs them. Update it by copying again.`
  },
  {
    id: 'ai-files',
    title: 'Raw files',
    text: 'The skill files as raw GitHub files, for an agent or a script that downloads them.'
  },
  {
    id: 'ai-llms',
    title: 'llms.txt',
    text: 'The playground is a single page application behind a hash route, so an agent that fetches it sees no content. `llms.txt` lists the documentation with links, and `llms-full.txt` holds the full text of the README, the guides and the skill. Both are generated from the repository on every build.'
  }
]
