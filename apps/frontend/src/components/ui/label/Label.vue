<script setup>
import { cn } from '@/lib/utils'
const props = defineProps({ for: { type: String, default: undefined }, class: { type: [String, Array, Object], default: '' } })
</script>
<template>
  <label
    :for="props.for"
    :class="cn('text-sm font-medium leading-none text-[var(--color-foreground)]', props.class)"
  >
    <slot />
  </label>
</template>
