import type { HighlighterCore } from 'shiki/core'

// Syntax colors for the example sources, with shiki as on the shadcn-vue
// site (GitHub light and dark themes). Only the core, the JavaScript regex
// engine, the Vue grammar and the two themes are loaded, and only when a
// page first shows its code: the playground's first load stays as it was.
let highlighter: Promise<HighlighterCore> | undefined

const load = async () => {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
    await Promise.all([import('shiki/core'), import('shiki/engine/javascript')])
  return createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [import('shiki/langs/vue.mjs')],
    themes: [
      import('shiki/themes/github-light-default.mjs'),
      import('shiki/themes/github-dark.mjs')
    ]
  })
}

/**
 * The source as HTML: a `pre.shiki` whose spans carry the light color and
 * the dark one as `--shiki-dark` (playground.css switches to it).
 */
export const highlightVue = async (source: string) => {
  highlighter ??= load()
  return (await highlighter).codeToHtml(source, {
    lang: 'vue',
    themes: { light: 'github-light-default', dark: 'github-dark' }
  })
}
