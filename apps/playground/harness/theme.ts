// The test skin follows the OS theme (`prefers-color-scheme`); a page that
// wants a fixed theme sets `data-theme` on <html>, which wins over the OS.
// Test code only: the library knows nothing about themes.
export type Theme = 'light' | 'dark'

export const setTheme = (theme: Theme | null | undefined) => {
  const root = document.documentElement
  if (theme) {
    root.setAttribute('data-theme', theme)
  } else {
    root.removeAttribute('data-theme')
  }
}

/** The theme a `?theme=light|dark` query parameter asks for, if any. */
export const themeFromUrl = (): Theme | null => {
  const asked = new URLSearchParams(location.search).get('theme')
  return asked === 'light' || asked === 'dark' ? asked : null
}
