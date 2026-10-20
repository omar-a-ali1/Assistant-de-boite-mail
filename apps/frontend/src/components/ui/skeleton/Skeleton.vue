<script setup>
import { cn } from '@/lib/utils'
const props = defineProps({ class: { type: [String, Array, Object], default: '' } })
</script>
<template>
  <div :class="cn('animate-pulse rounded-md bg-[var(--color-muted)]', props.class)" />
</template>
