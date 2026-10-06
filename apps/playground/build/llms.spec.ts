import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildLlms } from './llms'

const root = resolve(import.meta.dirname, '../../..')
const { llms, full, sources } = buildLlms(root)

describe('llms.txt generation', () => {
  it('follows the llmstxt.org shape: title, summary, sections of links', () => {
    const lines = llms.split('\n')
    expect(lines[0]).toBe('# Query Table')
    expect(lines.find(line => line.startsWith('> '))).toBeTruthy()
    expect(lines.filter(line => line.startsWith('## '))).toEqual([
      '## Start here',
      '## Guides',
      '## Decisions',
      '## Claude Code skill'
    ])
    for (const item of lines.filter(entry => entry.startsWith('- '))) {
      expect(item).toMatch(/^- \[[^\]]+\]\(https:\/\/[^)\s]+\.md\)/)
    }
  })

  it('lists the README, every guide, every decision and every skill file', () => {
    const listed = sources.map(source => source.path)
    expect(listed).toContain('README.md')
    expect(listed).toContain('skills/query-table/SKILL.md')
    for (const dir of ['docs/guide', 'docs/decisions']) {
      for (const name of readdirSync(join(root, dir)).filter(file =>
        file.endsWith('.md')
      )) {
        expect(listed, `${dir}/${name}`).toContain(`${dir}/${name}`)
      }
    }
    for (const path of listed) {
      expect(existsSync(join(root, path)), path).toBe(true)
      expect(llms, path).toContain(`/next/${path})`)
    }
  })

  it('holds the full text of every source in llms-full.txt', () => {
    for (const source of sources) {
      expect(full, source.path).toContain(`Source: ${source.path}`)
      expect(full, source.path).toContain(source.text)
    }
  })

  it('has a one-sentence summary for every source', () => {
    for (const source of sources) {
      expect(source.summary, source.path).not.toBe('')
    }
  })
})
