<script setup lang="ts">
import { CheckIcon, CopyIcon } from '@lucide/vue'
import { useClipboard } from '@vueuse/core'

import { Button } from '@/ui/button'

import {
  aiSections,
  guidePages,
  rawUrl,
  skillFiles,
  skillInstall
} from './guides'
import InlineCode from '../shell/InlineCode.vue'

// The "Use with AI" page: the skill, how to install it, its raw files and
// llms.txt. Text and links come from guides.ts.
const page = guidePages.find(guide => guide.id === 'ai')!
const section = (id: string) => aiSections.find(entry => entry.id === id)!
const { copy, copied } = useClipboard({ copiedDuring: 1500 })
const base = import.meta.env.BASE_URL
</script>

<template>
  <article class="flex max-w-4xl flex-col gap-8">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">{{ page.title }}</h1>
      <p class="pt-1 text-sm text-muted-foreground">
        <InlineCode :text="page.summary" />
      </p>
    </header>
    <section
      v-for="id in ['ai-skill', 'ai-install']"
      :id="id"
      :key="id"
      class="flex flex-col gap-2"
    >
      <h2 class="text-lg font-semibold">{{ section(id).title }}</h2>
      <p class="text-sm text-muted-foreground">
        <InlineCode :text="section(id).text" />
      </p>
      <div v-if="id === 'ai-install'" class="flex flex-col gap-2">
        <pre
          class="overflow-x-auto rounded-md border bg-muted p-3 text-xs"
          data-testid="skill-install"
        ><code>{{ skillInstall }}</code></pre>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="min-h-11 self-start sm:min-h-7"
          @click="copy(skillInstall)"
        >
          <component :is="copied ? CheckIcon : CopyIcon" />
          {{ copied ? 'Copied' : 'Copy the commands' }}
        </Button>
      </div>
    </section>
    <section id="ai-files" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ section('ai-files').title }}</h2>
      <p class="text-sm text-muted-foreground">
        {{ section('ai-files').text }}
      </p>
      <ul class="flex flex-col gap-1 text-sm">
        <li v-for="path in skillFiles" :key="path">
          <a
            :href="rawUrl(path)"
            target="_blank"
            rel="noopener"
            class="font-mono text-xs break-all underline underline-offset-4"
            >{{ path }}</a
          >
        </li>
      </ul>
    </section>
    <section id="ai-llms" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ section('ai-llms').title }}</h2>
      <p class="text-sm text-muted-foreground">
        <InlineCode :text="section('ai-llms').text" />
      </p>
      <ul class="flex flex-col gap-1 text-sm">
        <li>
          <a
            :href="`${base}llms.txt`"
            target="_blank"
            rel="noopener"
            class="underline underline-offset-4"
            >llms.txt</a
          >
        </li>
        <li>
          <a
            :href="`${base}llms-full.txt`"
            target="_blank"
            rel="noopener"
            class="underline underline-offset-4"
            >llms-full.txt</a
          >
        </li>
      </ul>
    </section>
  </article>
</template>
