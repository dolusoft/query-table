import { createApp } from 'vue'

import './playground.css'
import App from './App.vue'
import { router } from './router'

// The playground app (`pnpm dev`). Not shipped with the library.
createApp(App).use(router).mount('#app')
