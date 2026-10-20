<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  id: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  class: { type: [String, Array, Object], default: '' },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <select
    :id="id"
    :value="modelValue"
    :disabled="disabled"
    :class="
      cn(
        'flex h-9 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
    @change="emit('update:modelValue', $event.target.value)"
  >
    <slot />
  </select>
</template>
