import { createRouter, createWebHashHistory } from 'vue-router'

import { pages } from './manifest'
import PageView from './shell/PageView.vue'

// Hash history: the playground is a static site (GitHub Pages) with no
// server-side fallback, and the hash keeps working under any base path.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: `/${pages[0].id}` },
    ...pages.map(page => ({
      path: `/${page.id}`,
      component: PageView,
      props: { page }
    })),
    { path: '/:unknown(.*)', redirect: `/${pages[0].id}` }
  ]
})
