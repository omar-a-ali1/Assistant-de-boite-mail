<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: Number, default: 6 },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: undefined },
  class: { type: [String, Array, Object], default: '' },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <textarea
    :id="id"
    :rows="rows"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="
      cn(
        'flex w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-2 text-sm shadow-sm placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
    @input="emit('update:modelValue', $event.target.value)"
  />
</template>
