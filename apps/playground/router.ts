import { createRouter, createWebHashHistory } from 'vue-router'

import HomePage from './home/HomePage.vue'
import { pages } from './manifest'
import PageView from './shell/PageView.vue'

// Hash history: the playground is a static site (GitHub Pages) with no
// server-side fallback, and the hash keeps working under any base path.
// `/` is the home page; every documentation page keeps its `/<page id>`.
export const router = createRouter({
  history: createWebHashHistory(),
  // A new page opens at its top (back and forward restore the position);
  // the documentation search scrolls to its anchor after this.
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/', component: HomePage, meta: { landing: true } },
    ...pages.map(page => ({
      path: `/${page.id}`,
      component: PageView,
      props: { page }
    })),
    { path: '/:unknown(.*)', redirect: '/' }
  ]
})
