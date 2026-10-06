import { describe, expect, it } from 'vitest'

import { rawUrl, skillFiles } from './guides'
import { tanstackFeatureGuides, tanstackGeneralLinks } from './tanstack'
import { repositoryUrl } from '../home/home-content'

// `pnpm check:links`: asks the network whether every external link of the
// guide pages answers 200. It is opt-in (CHECK_LINKS=1) because a unit run
// must not need a network. LINK_BRANCH checks the skill files on a branch
// that is not merged yet (the page links `next`).
const enabled = Boolean(process.env.CHECK_LINKS)
const branch = process.env.LINK_BRANCH

const urls = [
  ...tanstackGeneralLinks.map(link => link.url),
  ...tanstackFeatureGuides.map(link => link.url),
  repositoryUrl,
  ...skillFiles.map(path =>
    branch ? rawUrl(path).replace('/next/', `/${branch}/`) : rawUrl(path)
  )
]

describe.skipIf(!enabled)('external links', () => {
  it('answers 200 for every link', async () => {
    const failed: string[] = []
    await Promise.all(
      urls.map(async url => {
        const response = await fetch(url, { redirect: 'manual' })
        if (response.status !== 200) {
          failed.push(`${response.status} ${url}`)
        }
      })
    )
    console.info(`checked ${urls.length} links, ${failed.length} failed`)
    expect(failed).toEqual([])
  })
})
