import { config } from '@vue/test-utils'
import FloatingVue from 'floating-vue'

// column-header.vue uses <VDropdown> without importing it: the library relies on
// the consumer  registering floating-vue globally. Tests do the same.
config.global.plugins = [FloatingVue]
