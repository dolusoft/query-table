<script setup lang="ts">
import { Badge } from '@/ui/badge'

import { guidePages } from './guides'
import {
  tanstackFeatureGuides,
  tanstackGeneralLinks,
  tanstackVersions,
  usedTanstackFeatures
} from './tanstack'
import DocHeader from '../shell/DocHeader.vue'
import InlineCode from '../shell/InlineCode.vue'

// The TanStack page: pinned versions, the features Query Table builds on and
// the v9 documentation. Everything comes from tanstack.ts.
const page = guidePages.find(guide => guide.id === 'tanstack')!
const guideOf = (id: string) =>
  tanstackFeatureGuides.find(guide => guide.id === id)
</script>

<template>
  <article class="flex flex-col gap-10">
    <DocHeader :title="page.title" :summary="page.summary" />
    <section id="tanstack-versions" class="flex scroll-m-28 flex-col gap-3">
      <h2 class="text-xl font-medium tracking-tight">Pinned versions</h2>
      <p>
        Query Table is built on TanStack Table v9 and pins both packages to an
        exact version, read from the package manifests.
      </p>
      <ul class="flex flex-wrap gap-2" data-testid="tanstack-versions">
        <li>
          <Badge variant="secondary" class="font-mono"
            >@tanstack/table-core {{ tanstackVersions.tableCore }}</Badge
          >
        </li>
        <li>
          <Badge variant="secondary" class="font-mono"
            >@tanstack/vue-table {{ tanstackVersions.vueTable }}</Badge
          >
        </li>
      </ul>
    </section>
    <section id="tanstack-used" class="flex scroll-m-28 flex-col gap-3">
      <h2 class="text-xl font-medium tracking-tight">
        TanStack features we use
      </h2>
      <p>
        <code class="font-mono">useQueryTable()</code> registers these, in this
        order, next to <code class="font-mono">serverQueryFeature</code> and
        <code class="font-mono">filterInputFeature</code>. To use them on your
        own, see the
        <RouterLink to="/tanstack-path" class="underline underline-offset-4"
          >TanStack path</RouterLink
        >
        example.
      </p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="used in usedTanstackFeatures"
          :id="`tanstack-used-${used.guide}`"
          :key="used.feature"
          class="rounded-md border p-3 text-sm"
        >
          <code class="font-mono font-medium">{{ used.feature }}</code>
          <span class="block text-muted-foreground">
            <InlineCode :text="used.role" />
            <a
              :href="guideOf(used.guide)?.url"
              target="_blank"
              rel="noopener"
              class="ml-1 underline underline-offset-4"
              >TanStack guide</a
            >
          </span>
        </li>
      </ul>
    </section>
    <section id="tanstack-docs" class="flex scroll-m-28 flex-col gap-3">
      <h2 class="text-xl font-medium tracking-tight">
        TanStack Table v9 documentation
      </h2>
      <ul class="flex flex-col gap-1 text-sm">
        <li
          v-for="link in tanstackGeneralLinks"
          :id="`tanstack-link-${link.id}`"
          :key="link.id"
        >
          <a
            :href="link.url"
            target="_blank"
            rel="noopener"
            class="font-medium underline underline-offset-4"
            >{{ link.title }}</a
          >
          <span class="text-muted-foreground">
            · <InlineCode :text="link.about"
          /></span>
        </li>
      </ul>
    </section>
    <section id="tanstack-guides" class="flex scroll-m-28 flex-col gap-3">
      <h2 class="text-xl font-medium tracking-tight">Feature guides (Vue)</h2>
      <ul class="grid gap-1 text-sm sm:grid-cols-2">
        <li
          v-for="link in tanstackFeatureGuides"
          :id="`tanstack-link-${link.id}`"
          :key="link.id"
        >
          <a
            :href="link.url"
            target="_blank"
            rel="noopener"
            class="underline underline-offset-4"
            >{{ link.title }}</a
          >
        </li>
      </ul>
    </section>
  </article>
</template>
