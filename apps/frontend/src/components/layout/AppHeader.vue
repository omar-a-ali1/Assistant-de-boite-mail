<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => route.meta.title || 'Assistant e-mail')
</script>

<template>
  <header
    class="flex h-14 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 md:px-6"
  >
    <h1 class="truncate text-base font-semibold">{{ title }}</h1>
    <div class="flex items-center gap-3">
      <slot name="actions" />
    </div>
  </header>
</template>
