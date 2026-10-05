// The same application without the table: the baseline that
// `pnpm measure:consumer-size` subtracts to get the cost of the package.
import { createApp, h } from 'vue'

createApp({ render: () => h('div', 'a') }).mount('#app')
