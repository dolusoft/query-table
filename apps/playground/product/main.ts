import { createApp } from 'vue'

// The reference skin on its own: no Tailwind, no shadcn-vue test skin. It is
// imported by its package name, as a consumer imports it (ADR 0023), so this
// page shows what a product that loads `@dolusoft/query-table-skin` sees.
import '@dolusoft/query-table-skin/table.css'
import './demo.css'
import ProductSites from './ProductSites.vue'

createApp(ProductSites).mount('#app')
