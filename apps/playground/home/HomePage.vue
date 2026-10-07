<script setup lang="ts">
import {
  ArrowRightIcon,
  BlocksIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  PaintbrushIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon
} from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import { computed, ref } from 'vue'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/ui/card'
import { InputGroup, InputGroupAddon, InputGroupButton } from '@/ui/input-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/ui/item'
import { ScrollArea, ScrollBar } from '@/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'

import {
  aiHome,
  architecture,
  installCommands,
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
import { currentDataset } from '../scenarios/datasets'
import BrandIcon from '../shell/BrandIcon.vue'
import InlineCode from '../shell/InlineCode.vue'

// The home page: what the library is, how to install it, one table that
// shows it working, and links into the documentation pages. Built from
// shadcn-vue parts (Badge, Button, Tabs, InputGroup, Card, Item) after the
// shadcn-vue site: a centred hero, then sections in one column.

// The demo data the header selects: the showcase hint and table follow it.
const dataset = computed(currentDataset)

const manager = ref<string>(installCommands[0].manager)
const command = computed(
  () =>
    installCommands.find(entry => entry.manager === manager.value)?.command ??
    installCommands[0].command
)
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
const base = import.meta.env.BASE_URL
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6">
    <section
      aria-labelledby="home-title"
      class="flex flex-col items-center gap-2 py-12 text-center md:py-20"
    >
      <!-- No version here: package.json carries the next version before its
           release exists. -->
      <Badge as-child variant="secondary" class="mb-2">
        <RouterLink to="/tanstack" data-testid="tanstack-line">
          Vue 3 · {{ tanstackLine }}
          <ArrowRightIcon data-icon="inline-end" />
        </RouterLink>
      </Badge>
      <h1
        id="home-title"
        class="text-4xl leading-tight font-semibold tracking-tighter md:text-5xl md:leading-none"
      >
        Query Table
      </h1>
      <p class="max-w-2xl text-base text-balance text-foreground sm:text-lg">
        {{ pitch }}
      </p>
      <div class="flex flex-wrap justify-center gap-2 pt-2">
        <Button as-child size="sm" class="min-h-11 sm:pointer-fine:min-h-0">
          <RouterLink to="/overview">
            Read the docs
            <ArrowRightIcon data-icon="inline-end" />
          </RouterLink>
        </Button>
        <Button
          as-child
          size="sm"
          variant="ghost"
          class="min-h-11 sm:pointer-fine:min-h-0"
        >
          <a
            :href="repositoryUrl"
            target="_blank"
            rel="noopener"
            aria-label="GitHub (opens in a new tab)"
          >
            <BrandIcon name="github" />
            GitHub
          </a>
        </Button>
      </div>
      <!-- The install command for three package managers. The command
           scrolls sideways in its own box; the copy button sits in the tab
           row, never over the text. -->
      <Tabs
        v-model="manager"
        class="mt-6 w-full max-w-xl gap-0 text-left"
        data-testid="install-command"
      >
        <InputGroup
          class="h-auto flex-col items-stretch bg-muted/50 dark:bg-muted/50"
        >
          <InputGroupAddon
            align="block-start"
            class="gap-2 border-b py-1.5 pr-1.5"
          >
            <TerminalIcon aria-hidden="true" />
            <TabsList
              class="bg-transparent p-0 font-mono group-data-horizontal/tabs:h-11 lg:group-data-horizontal/tabs:h-8"
            >
              <TabsTrigger
                v-for="entry in installCommands"
                :key="entry.manager"
                :value="entry.manager"
                class="h-11 px-2 data-active:border-input data-active:shadow-none lg:pointer-fine:h-7"
              >
                {{ entry.manager }}
              </TabsTrigger>
            </TabsList>
            <InputGroupButton
              size="icon-sm"
              class="ml-auto size-11 lg:pointer-fine:size-7"
              :aria-label="copied ? 'Copied' : 'Copy install command'"
              data-testid="copy-install"
              @click="copy(command)"
            >
              <CheckIcon v-if="copied" />
              <CopyIcon v-else />
            </InputGroupButton>
          </InputGroupAddon>
          <TabsContent
            v-for="entry in installCommands"
            :key="entry.manager"
            :value="entry.manager"
            class="min-w-0"
          >
            <ScrollArea class="w-full">
              <pre
                class="w-max px-4 py-3.5 font-mono text-sm"
              ><code>{{ entry.command }}</code></pre>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </TabsContent>
        </InputGroup>
      </Tabs>
      <span class="sr-only" aria-live="polite">{{
        copied ? 'Install command copied' : ''
      }}</span>
    </section>

    <section
      :id="showcase.id"
      aria-labelledby="showcase-title"
      class="flex scroll-mt-20 flex-col gap-4"
    >
      <div class="flex flex-col gap-2">
        <h2 id="showcase-title" class="text-xl font-semibold tracking-tight">
          {{ showcase.title }}
        </h2>
        <p class="max-w-3xl text-sm text-muted-foreground sm:text-base">
          {{ showcase.text }}
        </p>
      </div>
      <!-- The page background, not bg-card: the table and its toolbar draw
           on bg-background, a lighter card would frame them in two tones. -->
      <Card class="min-w-0 gap-3 bg-background py-3 sm:py-4">
        <CardHeader class="gap-3 px-3 sm:px-4">
          <ul
            class="flex flex-wrap gap-1.5"
            aria-label="Features in this table"
          >
            <li v-for="feature in showcaseFeatures" :key="feature.label">
              <Badge as-child variant="outline">
                <RouterLink :to="`/${feature.pageId}`">{{
                  feature.label
                }}</RouterLink>
              </Badge>
            </li>
          </ul>
          <CardDescription>
            <InlineCode :text="dataset.hint" />
          </CardDescription>
        </CardHeader>
        <CardContent class="min-w-0 px-3 sm:px-4">
          <!-- Mounted again when the header picks another dataset. -->
          <ShowcaseTable :key="dataset.id" />
        </CardContent>
      </Card>
    </section>

    <section
      id="more-features"
      aria-labelledby="more-features-title"
      class="flex scroll-mt-20 flex-col gap-4 pt-16"
    >
      <h2 id="more-features-title" class="text-xl font-semibold tracking-tight">
        More on their own pages
      </h2>
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="feature in moreFeatures" :id="feature.id" :key="feature.id">
          <Item as-child variant="outline" class="h-full min-h-11 flex-nowrap">
            <RouterLink :to="`/${feature.pageId}`">
              <ItemContent>
                <ItemTitle>{{ feature.title }}</ItemTitle>
                <!-- A phone shows the titles only: each one opens its page. -->
                <ItemDescription class="line-clamp-none hidden sm:block">{{
                  feature.text
                }}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon
                  aria-hidden="true"
                  class="size-4 text-muted-foreground"
                />
              </ItemActions>
            </RouterLink>
          </Item>
        </li>
      </ul>
    </section>

    <div class="grid gap-4 pt-16 md:grid-cols-2">
      <section
        :id="onTopOfTanstack.id"
        aria-labelledby="on-top-of-tanstack-title"
        class="scroll-mt-20"
      >
        <Card class="h-full">
          <CardHeader>
            <CardTitle>
              <h2 id="on-top-of-tanstack-title">
                {{ onTopOfTanstack.title }}
              </h2>
            </CardTitle>
            <CardDescription>{{ onTopOfTanstack.text }}</CardDescription>
          </CardHeader>
          <CardFooter class="mt-auto flex-wrap gap-2">
            <Button
              as-child
              variant="outline"
              class="min-h-11 sm:pointer-fine:min-h-0"
            >
              <RouterLink to="/features">
                Feature matrix
                <ArrowRightIcon data-icon="inline-end" />
              </RouterLink>
            </Button>
            <Button
              as-child
              variant="ghost"
              class="min-h-11 sm:pointer-fine:min-h-0"
            >
              <RouterLink to="/tanstack">TanStack Table</RouterLink>
            </Button>
          </CardFooter>
        </Card>
      </section>
      <section
        :id="aiHome.id"
        aria-labelledby="use-with-ai-title"
        class="scroll-mt-20"
      >
        <Card class="h-full">
          <CardHeader>
            <CardTitle>
              <h2 id="use-with-ai-title" class="flex items-center gap-2">
                <SparklesIcon aria-hidden="true" class="size-4" />
                {{ aiHome.title }}
              </h2>
            </CardTitle>
            <CardDescription>
              <InlineCode :text="aiHome.text" />
            </CardDescription>
          </CardHeader>
          <CardFooter class="mt-auto flex-wrap gap-2">
            <Button
              as-child
              variant="outline"
              class="min-h-11 sm:pointer-fine:min-h-0"
            >
              <RouterLink to="/ai#ai-skill">Claude Code skill</RouterLink>
            </Button>
            <Button
              as-child
              variant="outline"
              class="min-h-11 sm:pointer-fine:min-h-0"
            >
              <a
                :href="`${base}llms.txt`"
                target="_blank"
                rel="noopener"
                aria-label="llms.txt (opens in a new tab)"
              >
                <BrandIcon name="llms" />
                llms.txt
              </a>
            </Button>
            <Button
              as-child
              variant="ghost"
              class="min-h-11 sm:pointer-fine:min-h-0"
            >
              <RouterLink to="/ai">
                Use with AI
                <ArrowRightIcon data-icon="inline-end" />
              </RouterLink>
            </Button>
          </CardFooter>
        </Card>
      </section>
    </div>

    <section
      id="principles"
      aria-labelledby="principles-title"
      class="flex scroll-mt-20 flex-col gap-4 pt-16"
    >
      <h2 id="principles-title" class="text-xl font-semibold tracking-tight">
        Principles
      </h2>
      <ul class="grid gap-2 sm:grid-cols-2">
        <li
          v-for="principle in principles"
          :id="principle.id"
          :key="principle.id"
        >
          <Item variant="muted" class="h-full flex-nowrap items-start">
            <ItemMedia variant="icon">
              <component
                :is="principleIcons[principle.id]"
                aria-hidden="true"
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{{ principle.title }}</ItemTitle>
              <ItemDescription class="line-clamp-none">{{
                principle.text
              }}</ItemDescription>
            </ItemContent>
          </Item>
        </li>
      </ul>
    </section>

    <section
      :id="architecture.id"
      aria-labelledby="architecture-title"
      class="flex scroll-mt-20 flex-col gap-4 pt-16 pb-16"
    >
      <h2 id="architecture-title" class="text-xl font-semibold tracking-tight">
        {{ architecture.title }}
      </h2>
      <p class="max-w-3xl text-sm text-muted-foreground sm:text-base">
        {{ architecture.text }}
      </p>
      <!-- The SVG draws its own light card (it is the README's picture too),
           so the page adds only the card's ring and radius around it: a
           padded frame on top of that showed a card inside a card. -->
      <img
        v-show="diagramLoaded"
        :src="diagramUrl"
        alt="Architecture diagram: the page, the table and the server around v-model:query"
        class="w-full max-w-4xl rounded-xl ring-1 ring-foreground/10"
        @load="diagramLoaded = true"
      />
    </section>
  </div>
</template>
