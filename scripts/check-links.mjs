// `pnpm check:links` (opt-in, needs a network): every external link of the
// playground guide pages must answer 200. Runs apps/playground/guides/links.spec.ts
// with CHECK_LINKS set. `LINK_BRANCH=<branch>` checks the skill files on a
// branch that is not merged into `main` yet.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--project',
    'unit',
    'apps/playground/guides/links.spec.ts'
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CHECK_LINKS: '1' }
  }
)
process.exit(result.status ?? 1)
