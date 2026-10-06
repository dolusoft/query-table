<script setup lang="ts">
import {
  ArrowRightIcon,
  BlocksIcon,
  CheckIcon,
  CopyIcon,
  PaintbrushIcon,
  ServerIcon,
  ShieldCheckIcon
} from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import { ref } from 'vue'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { ScrollArea, ScrollBar } from '@/ui/scroll-area'

import {
  architecture,
  installCommand,
  moreFeatures,
  onTopOfTanstack,
  pitch,
  principles,
  repositoryUrl,
  showcase,
  showcaseFeatures,
  tanstackLine
} from './home-content'
import ShowcaseTable from './ShowcaseTable.vue'
import InlineCode from '../shell/InlineCode.vue'

// The home page: what the library is, how to install it, one table that
// shows it working, and links into the documentation pages.

const { copy, copied } = useClipboard({ copiedDuring: 1500, legacy: true })

const principleIcons: Record<string, typeof BlocksIcon> = {
  'principle-headless': BlocksIcon,
  'principle-no-css': PaintbrushIcon,
  'principle-server-first': ServerIcon,
  'principle-contract-tested': ShieldCheckIcon
}

// The diagram is a static file that may not exist yet: the image shows only
// once it has loaded, so a missing file leaves the text alone.
const diagramUrl = `${import.meta.env.BASE_URL}architecture.svg`
const diagramLoaded = ref(false)
</script>

<template>
  <div
    class="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 pt-10 pb-16 sm:px-6 lg:gap-24 lg:pt-16"
  >
    <section
      aria-labelledby="home-title"
      class="flex flex-col items-start gap-5"
    >
      <!-- No version here: package.json carries the next version before its
           release exists. -->
      <Badge variant="secondary">Vue 3 · headless</Badge>
      <h1
        id="home-title"
        class="text-4xl font-semibold tracking-tight sm:text-5xl"
      >
        Query Table
      </h1>
      <p class="max-w-2xl text-lg text-balance text-muted-foreground">
        {{ pitch }}
      </p>
      <p class="text-sm text-muted-foreground" data-testid="tanstack-line">
        <RouterLink to="/tanstack" class="underline underline-offset-4">{{
          tanstackLine
        }}</RouterLink>
      </p>
      <!-- The command scrolls sideways in its own box; the copy button sits
           next to it, never over the text. -->
      <div
        class="flex w-full max-w-4xl items-center gap-1 rounded-lg border bg-muted/50 pr-1"
        data-testid="install-command"
      >
        <ScrollArea class="min-w-0 flex-1">
          <pre
            class="w-max py-3 pr-2 pl-4 font-mono text-sm"
          ><code>{{ installCommand }}</code></pre>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="size-11 shrink-0 sm:size-8"
          :aria-label="copied ? 'Copied' : 'Copy install command'"
          data-testid="copy-install"
          @click="copy(installCommand)"
        >
          <CheckIcon v-if="copied" />
          <CopyIcon v-else />
        </Button>
        <span class="sr-only" aria-live="polite">{{
          copied ? 'Install command copied' : ''
        }}</span>
      </div>
      <div class="flex flex-wrap gap-3">
        <Button as-child size="lg">
          <RouterLink to="/overview">
            Read the docs
            <ArrowRightIcon data-icon="inline-end" />
          </RouterLink>
        </Button>
        <Button as-child size="lg" variant="outline">
          <a :href="repositoryUrl" target="_blank" rel="noopener">GitHub</a>
        </Button>
      </div>
    </section>

    <section
      :id="showcase.id"
      aria-labelledby="showcase-title"
      class="flex scroll-mt-20 flex-col gap-5"
    >
      <div class="flex flex-col gap-3">
        <h2 id="showcase-title" class="text-2xl font-semibold tracking-tight">
          {{ showcase.title }}
        </h2>
        <p class="max-w-3xl text-muted-foreground">{{ showcase.text }}</p>
        <ul class="flex flex-wrap gap-2" aria-label="Features in this table">
          <li v-for="feature in showcaseFeatures" :key="feature.label">
            <Badge as-child variant="outline">
              <RouterLink :to="`/${feature.pageId}`">{{
                feature.label
              }}</RouterLink>
            </Badge>
          </li>
        </ul>
        <p class="text-sm text-muted-foreground">
          Try it: type <InlineCode text="`!ankara`" /> into City or
          <InlineCode text="`ali,eve`" /> into Name, or pick Greater Than in the
          filter menu of Age.
        </p>
      </div>
      <div class="min-w-0 rounded-xl border p-3 sm:p-4">
        <ShowcaseTable />
      </div>
    </section>

    <section
      id="more-features"
      aria-labelledby="more-features-title"
      class="flex scroll-mt-20 flex-col gap-5"
    >
      <h2
        id="more-features-title"
        class="text-2xl font-semibold tracking-tight"
      >
        More on their own pages
      </h2>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="feature in moreFeatures" :id="feature.id" :key="feature.id">
          <RouterLink
            :to="`/${feature.pageId}`"
            class="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card class="h-full transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <CardTitle class="flex items-center justify-between gap-2">
                  {{ feature.title }}
                  <ArrowRightIcon
                    aria-hidden="true"
                    class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </CardTitle>
                <CardDescription>{{ feature.text }}</CardDescription>
              </CardHeader>
            </Card>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section
      :id="onTopOfTanstack.id"
      aria-labelledby="on-top-of-tanstack-title"
      class="flex scroll-mt-20 flex-col gap-4"
    >
      <h2
        id="on-top-of-tanstack-title"
        class="text-2xl font-semibold tracking-tight"
      >
        {{ onTopOfTanstack.title }}
      </h2>
      <p class="max-w-3xl text-muted-foreground">{{ onTopOfTanstack.text }}</p>
      <div class="flex flex-wrap gap-3">
        <Button as-child variant="outline">
          <RouterLink to="/features">
            Feature matrix
            <ArrowRightIcon data-icon="inline-end" />
          </RouterLink>
        </Button>
        <Button as-child variant="ghost">
          <RouterLink to="/tanstack">TanStack Table</RouterLink>
        </Button>
      </div>
    </section>

    <section
      id="principles"
      aria-labelledby="principles-title"
      class="flex scroll-mt-20 flex-col gap-5"
    >
      <h2 id="principles-title" class="text-2xl font-semibold tracking-tight">
        Principles
      </h2>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <li
          v-for="principle in principles"
          :id="principle.id"
          :key="principle.id"
        >
          <Card class="h-full">
            <CardHeader>
              <component
                :is="principleIcons[principle.id]"
                aria-hidden="true"
                class="mb-2 size-5 text-muted-foreground"
              />
              <CardTitle>{{ principle.title }}</CardTitle>
              <CardDescription>{{ principle.text }}</CardDescription>
            </CardHeader>
          </Card>
        </li>
      </ul>
    </section>

    <section
      :id="architecture.id"
      aria-labelledby="architecture-title"
      class="flex scroll-mt-20 flex-col gap-5"
    >
      <h2 id="architecture-title" class="text-2xl font-semibold tracking-tight">
        {{ architecture.title }}
      </h2>
      <p class="max-w-3xl text-muted-foreground">{{ architecture.text }}</p>
      <img
        v-show="diagramLoaded"
        :src="diagramUrl"
        alt="Architecture diagram: the page, the table and the server around v-model:query"
        class="w-full max-w-4xl rounded-xl border bg-card p-4"
        @load="diagramLoaded = true"
      />
    </section>
  </div>
</template>
