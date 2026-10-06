import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { skillFiles, skillInstall, skillTarget } from './guides'

const root = resolve(import.meta.dirname, '../../..')

describe('Claude Code skill', () => {
  it('has every file the AI page links to', () => {
    for (const path of skillFiles) {
      expect(existsSync(resolve(root, path)), path).toBe(true)
    }
  })

  it('declares its name and a trigger description in SKILL.md', () => {
    const text = readFileSync(
      resolve(root, 'skills/query-table/SKILL.md'),
      'utf8'
    )
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
    expect(frontmatter).toMatch(/^name: query-table$/m)
    expect(frontmatter).toMatch(/^description: .{80,}/m)
  })

  it('installs every file under the skill folder', () => {
    for (const path of skillFiles) {
      expect(skillInstall).toContain(path)
    }
    expect(skillInstall).toContain(`${skillTarget}/SKILL.md`)
  })

  it('names only API members that exist in the contract', () => {
    const api = JSON.parse(
      readFileSync(resolve(root, 'contract/api.json'), 'utf8')
    ) as {
      props: Array<{ name: string }>
      emits: Array<{ name: string }>
      slots: Array<{ name: string }>
      exposed: Array<{ name: string }>
      functions: Array<{ name: string }>
    }
    const known = new Set(
      [api.props, api.emits, api.slots, api.exposed, api.functions].flatMap(
        group => group.map(member => member.name)
      )
    )
    const text = skillFiles
      .map(path => readFileSync(resolve(root, path), 'utf8'))
      .join('\n')
    // Every `v-model:name` the skill writes is a prop of the component.
    for (const [, name] of text.matchAll(/v-model:([a-zA-Z]+)/g)) {
      expect(known, `v-model:${name}`).toContain(name)
    }
  })
})
