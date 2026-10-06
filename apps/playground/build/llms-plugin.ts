import type { Plugin } from 'vite'

import { buildLlms } from './llms'

/**
 * Emits `llms.txt` and `llms-full.txt` into the build output, from the
 * repository at `root`. Runs on every build, so the files cannot go stale.
 */
export const llmsPlugin = (root: string): Plugin => ({
  name: 'query-table-llms',
  apply: 'build',
  generateBundle() {
    const { llms, full } = buildLlms(root)
    this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llms })
    this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: full })
  }
})
