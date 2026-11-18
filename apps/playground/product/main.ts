import { createApp } from 'vue'

// The product skin on its own: no Tailwind, no shadcn-vue test skin. What
// this page shows is what a consumer that loads `skin.css` sees (#203).
import './skin.css'
import './demo.css'
import ProductSites from './ProductSites.vue'

createApp(ProductSites).mount('#app')
