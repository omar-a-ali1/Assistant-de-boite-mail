<script setup>
import { cn } from '@/lib/utils'
import { badgeVariants } from '.'

const props = defineProps({
  variant: { type: String, default: 'default' },
  class: { type: [String, Array, Object], default: '' },
})
</script>

<template>
  <span :class="cn(badgeVariants({ variant }), props.class)">
    <slot />
  </span>
</template>
