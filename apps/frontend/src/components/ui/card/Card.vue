<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({
  class: { type: [String, Array, Object], default: '' },
})
</script>

<template>
  <div
    :class="
      cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-sm',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
