<script setup>
import { cn } from '@/lib/utils'
import { buttonVariants } from '.'

const props = defineProps({
  variant: { type: String, default: 'default' },
  size: { type: String, default: 'default' },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  class: { type: [String, Array, Object], default: '' },
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </button>
</template>
