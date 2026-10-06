import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// Generates llms.txt (llmstxt.org: a title, a summary and sectioned link
// lists) and llms-full.txt (the full text) from the README, docs/**/*.md and
// the Claude Code skill. The playground is a single page application behind
// a hash route, so an agent that fetches it sees no content: these two files
// are the text of the project, published at the root of the site.
//
// It runs on every build (llms-plugin.ts) instead of being committed: a
// committed copy can go stale and needs a CI diff check to notice; a build
// output cannot. llms.spec.ts tests this function against the real
// repository.

const rawBase = 'https://raw.githubusercontent.com/dolusoft/query-table/next'

interface LlmsSource {
  /** Path from the repository root, with forward slashes. */
  path: string
  title: string
  /** The first sentence of the file, for the link list. */
  summary: string
  text: string
}

interface LlmsSection {
  title: string
  paths: string[]
}

const markdownFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        // Code samples next to the guides are not documentation text.
        return entry.name === 'examples' ? [] : markdownFiles(path)
      }
      return entry.name.endsWith('.md') ? [path] : []
    })

const firstSentence = (text: string) => {
  const paragraph = text
    .split(/\r?\n\r?\n/)
    .map(part => part.trim())
    .find(
      part =>
        // A short opener such as "For backend developers." says too little.
        part.length >= 40 &&
        !/^(#|!\[|\||```|>|-|\d+\.)/.test(part) &&
        !part.startsWith('Status:')
    )
  const flat = (paragraph ?? '').replace(/\s+/g, ' ')
  // The first sentence that ends at least 40 characters in.
  const end = flat.slice(40).search(/[.!?](\s|$)/)
  return (end === -1 ? flat : flat.slice(0, 40 + end + 1))
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

const readSource = (root: string, file: string): LlmsSource => {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd()
  const path = relative(root, file).replaceAll('\\', '/')
  const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? path
  return { path, title, summary: firstSentence(text), text }
}

/** The files and their sections, in the order the output lists them. */
const llmsSections = (root: string): LlmsSection[] => {
  const docs = (dir: string) =>
    markdownFiles(join(root, dir)).map(file =>
      relative(root, file).replaceAll('\\', '/')
    )
  const first = (paths: string[], name: string) => [
    ...paths.filter(path => path.endsWith(name)),
    ...paths.filter(path => !path.endsWith(name))
  ]
  return [
    { title: 'Start here', paths: ['README.md'] },
    { title: 'Guides', paths: first(docs('docs/guide'), 'README.md') },
    {
      title: 'Decisions',
      paths: first(docs('docs/decisions'), 'README.md')
    },
    {
      title: 'Claude Code skill',
      paths: docs('skills/query-table')
    }
  ]
}

export interface Llms {
  llms: string
  full: string
  sources: LlmsSource[]
}

export const buildLlms = (root: string): Llms => {
  const sections = llmsSections(root).map(section => ({
    title: section.title,
    sources: section.paths.map(path => readSource(root, join(root, path)))
  }))
  const sources = sections.flatMap(section => section.sources)
  const readme = sources.find(source => source.path === 'README.md')!
  const summary = firstSentence(readme.text.split('\n').slice(1).join('\n'))

  const link = (source: LlmsSource) =>
    `- [${source.title}](${rawBase}/${source.path})${
      source.summary ? `: ${source.summary}` : ''
    }`
  const llms = [
    '# Query Table',
    '',
    `> ${summary}`,
    '',
    'Query Table v3 is three packages (`@dolusoft/query-protocol`, `@dolusoft/query-table-core`, `@dolusoft/query-table`) on TanStack Table v9. The links below are raw Markdown files; `llms-full.txt` holds all of them in one file.',
    '',
    ...sections.flatMap(section => [
      `## ${section.title}`,
      '',
      ...section.sources.map(link),
      ''
    ])
  ]
    .join('\n')
    .trimEnd()

  const full = [
    '# Query Table: full documentation',
    '',
    `> ${summary}`,
    '',
    'Every file below starts with a `Source:` line giving its path in the repository.',
    '',
    ...sources.flatMap(source => [
      '---',
      '',
      `Source: ${source.path}`,
      '',
      source.text,
      ''
    ])
  ]
    .join('\n')
    .trimEnd()

  return { llms: `${llms}\n`, full: `${full}\n`, sources }
}
