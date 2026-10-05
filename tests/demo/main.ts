import { createApp } from 'vue'

import './demo.css'
import SkinDemo from './SkinDemo.vue'

// A local page for looking at the test skin (`pnpm dev`). Not shipped, not a
// test: `?theme=light|dark` pins the theme, `?state=empty` shows no rows.
createApp(SkinDemo).mount('#app')
