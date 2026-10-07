import { describe, expect, it } from 'vitest'

import { liveUpdateDom } from '../../support/live-update-dom'

// C-95: a table without `flash` draws the DOM of 3.2, absolutely. The DOM
// of a mount and of 20 live updates is compared with a snapshot taken from
// the 3.2.1 build. `scripts/equivalence.mjs` runs this file on the 3.2
// baseline and on the candidate, so both must match the same file;
// flash.spec.ts checks that `flash: false` draws it too.

describe('C-95 Change flash off: the DOM of 3.2 [own]', () => {
  it('draws the DOM of the 3.2 build on a mount and on live updates', async () => {
    await expect(await liveUpdateDom({})).toMatchFileSnapshot(
      './__snapshots__/flash-off-dom.html'
    )
  })
})
