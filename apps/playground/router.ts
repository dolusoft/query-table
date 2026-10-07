import { createRouter, createWebHashHistory } from 'vue-router'

import AiPage from './guides/AiPage.vue'
import FeatureMatrixPage from './guides/FeatureMatrixPage.vue'
import TanstackPage from './guides/TanstackPage.vue'
import HomePage from './home/HomePage.vue'
import { pages } from './manifest'
import PageView from './shell/PageView.vue'

// Hash history: the playground is a static site (GitHub Pages) with no
// server-side fallback, and the hash keeps working under any base path.
// `/` is the home page; every documentation page keeps its `/<page id>`.
export const router = createRouter({
  history: createWebHashHistory(),
  // A new page opens at its top (back and forward restore the position);
  // a route with a hash (the sidebar's AI entries, "On This Page") scrolls
  // to that section, below the 4rem sticky header; the documentation search
  // scrolls to its anchor after this.
  scrollBehavior: (to, _from, saved) =>
    saved ?? (to.hash ? { el: to.hash, top: 80 } : { top: 0 }),
  routes: [
    { path: '/', component: HomePage, meta: { landing: true } },
    ...pages.map(page => ({
      path: `/${page.id}`,
      component: PageView,
      props: { page }
    })),
    { path: '/features', component: FeatureMatrixPage },
    { path: '/tanstack', component: TanstackPage },
    { path: '/ai', component: AiPage },
    { path: '/:unknown(.*)', redirect: '/' }
  ]
})
