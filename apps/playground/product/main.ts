import { createApp } from 'vue'

// The reference skin on its own: no Tailwind, no shadcn-vue test skin. It is
// imported by its path in the Vue package, as a consumer imports it (ADR
// 0025), so this page shows what a product that loads
// `@dolusoft/query-table/table.css` sees.
import '@dolusoft/query-table/table.css'
import './demo.css'
import ProductSites from './ProductSites.vue'

createApp(ProductSites).mount('#app')
