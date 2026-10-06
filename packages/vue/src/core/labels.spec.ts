import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    return statSync(path).isDirectory()
      ? vueFiles(path)
      : entry.endsWith('.vue')
        ? [path]
        : []
  })

describe('C-44 Labels', () => {
  it('has no literal aria-label in a component template', () => {
    const offenders = vueFiles(src).filter(file =>
      /\saria-label="/.test(readFileSync(file, 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})
