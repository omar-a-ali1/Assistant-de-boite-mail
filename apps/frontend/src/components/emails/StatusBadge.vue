<script setup>
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { CATEGORY_LABELS, STATUS_LABELS, PRIORITY_LABELS } from '@/utils/format'

const props = defineProps({
  type: { type: String, required: true }, // category | status | priority
  value: { type: [String, Number], default: null },
})

const variantByCategory = {
  client: 'default',
  facture: 'destructive',
  'rendez-vous': 'secondary',
  newsletter: 'outline',
  'spam probable': 'outline',
  autre: 'secondary',
}

const label = computed(() => {
  if (props.value == null || props.value === '') return '—'
  if (props.type === 'category') return CATEGORY_LABELS[props.value] || props.value
  if (props.type === 'status') return STATUS_LABELS[props.value] || props.value
  if (props.type === 'priority') return `Priorité ${PRIORITY_LABELS[props.value] || props.value}`
  return props.value
})

const variant = computed(() =>
  props.type === 'category' ? variantByCategory[props.value] || 'secondary' : 'outline'
)
</script>

<template>
  <Badge :variant="variant">
    <span
      v-if="type === 'priority'"
      class="mr-1 inline-block h-2 w-2 rounded-full bg-current"
      aria-hidden="true"
    />
    {{ label }}
  </Badge>
</template>
