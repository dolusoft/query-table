<script setup lang="ts">
import { Badge } from '@/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/ui/table'

import {
  availabilityLabels,
  featureGroups,
  features,
  groupNotes,
  groupTitles,
  serverModeLabels,
  type Availability,
  type ServerMode
} from './feature-matrix'
import { blobUrl, guidePages } from './guides'
import { tanstackFeatureGuides } from './tanstack'
import { pages } from '../manifest'
import InlineCode from '../shell/InlineCode.vue'

// The feature matrix page: one table per group, all drawn from
// feature-matrix.ts.
const page = guidePages.find(guide => guide.id === 'features')!

const pageTitle = (id: string) => pages.find(entry => entry.id === id)?.title
const guideOf = (id: string | null) =>
  tanstackFeatureGuides.find(guide => guide.id === id)

const availabilityVariant = (value: Availability) =>
  value === 'yes' ? 'default' : value === 'no' ? 'outline' : 'secondary'
const modeVariant = (value: ServerMode) =>
  value === 'server' ? 'default' : value === 'backend' ? 'secondary' : 'outline'
</script>

<template>
  <article class="flex max-w-6xl flex-col gap-8">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">{{ page.title }}</h1>
      <p class="pt-1 text-sm text-muted-foreground">
        <InlineCode :text="page.summary" />
      </p>
    </header>
    <section
      v-for="group in featureGroups"
      :id="`group-${group}`"
      :key="group"
      :aria-labelledby="`group-${group}-title`"
      class="flex scroll-mt-4 flex-col gap-3"
    >
      <div>
        <h2
          :id="`group-${group}-title`"
          class="flex items-center gap-2 text-lg font-semibold"
        >
          {{ groupTitles[group] }}
          <Badge v-if="group === 'own'" data-testid="own-badge"
            >Query Table only</Badge
          >
        </h2>
        <p class="pt-1 text-sm text-muted-foreground">
          <InlineCode :text="groupNotes[group]" />
        </p>
      </div>
      <div class="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="min-w-56">Feature</TableHead>
              <TableHead>In TanStack</TableHead>
              <TableHead>QueryTable</TableHead>
              <TableHead>TanStack path</TableHead>
              <TableHead>With a server</TableHead>
              <TableHead>See it</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="feature in features.filter(entry => entry.group === group)"
              :id="`feature-${feature.id}`"
              :key="feature.id"
              :data-feature="feature.id"
              class="align-top"
            >
              <TableCell class="max-w-md whitespace-normal">
                <span class="block font-medium">{{ feature.title }}</span>
                <span class="block text-xs text-muted-foreground">
                  <InlineCode :text="feature.summary" />
                </span>
              </TableCell>
              <TableCell>
                <template v-if="guideOf(feature.tanstack)">
                  <a
                    :href="guideOf(feature.tanstack)?.url"
                    target="_blank"
                    rel="noopener"
                    class="underline underline-offset-4"
                    >Yes</a
                  >
                </template>
                <span v-else class="text-muted-foreground">No</span>
              </TableCell>
              <TableCell>
                <Badge :variant="availabilityVariant(feature.component)">{{
                  availabilityLabels[feature.component]
                }}</Badge>
              </TableCell>
              <TableCell>
                <Badge :variant="availabilityVariant(feature.tanstackPath)">{{
                  availabilityLabels[feature.tanstackPath]
                }}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  v-if="feature.mode"
                  :variant="modeVariant(feature.mode)"
                  :data-mode="feature.mode"
                  >{{ serverModeLabels[feature.mode] }}</Badge
                >
                <span v-else class="text-muted-foreground">Not applicable</span>
              </TableCell>
              <TableCell class="whitespace-normal">
                <RouterLink
                  v-if="feature.example"
                  :to="`/${feature.example}`"
                  class="underline underline-offset-4"
                  >{{ pageTitle(feature.example) }}</RouterLink
                >
                <a
                  v-else-if="feature.repoPath"
                  :href="blobUrl(feature.repoPath)"
                  target="_blank"
                  rel="noopener"
                  class="underline underline-offset-4"
                  >{{ feature.repoPath }}</a
                >
                <span v-else class="text-muted-foreground"
                  >No live example</span
                >
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>
  </article>
</template>
