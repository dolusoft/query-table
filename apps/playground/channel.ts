export type PlaygroundChannel = 'release' | 'next'

// Vite injects PLAYGROUND_CHANNEL; local development defaults to release.
export const playgroundChannel: PlaygroundChannel =
  import.meta.env.PLAYGROUND_CHANNEL === 'next' ? 'next' : 'release'

export const sourceBranch = playgroundChannel === 'next' ? 'next' : 'main'

/** The two channels share a site root; the whole hash is a router URL. */
export const channelHref = (
  base: string,
  current: PlaygroundChannel,
  target: PlaygroundChannel,
  hash: string,
  search = ''
) => {
  const root = current === 'next' ? base.replace(/next\/$/, '') : base
  return `${root}${target === 'next' ? 'next/' : ''}${search}${hash}`
}
