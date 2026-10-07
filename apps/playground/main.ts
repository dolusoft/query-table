import { createApp } from 'vue'

// The theme's `--font-sans` is 'Geist Variable'. gen-skin.ts drops the
// Google Fonts import the shadcn-vue CLI wrote (tests must not need the
// network), so the playground loads the font from the package instead.
// Geist Mono is the code font (`--font-mono`, set in playground.css): the
// preset (geist-sans) names no mono font, the shadcn-vue site uses this one.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './playground.css'
import App from './App.vue'
import { router } from './router'

// The playground app (`pnpm dev`). Not shipped with the library.
createApp(App).use(router).mount('#app')
