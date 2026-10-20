<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  class: { type: [String, Array, Object], default: '' },
})
const emit = defineEmits(['update:open'])

function close() {
  emit('update:open', false)
}
function onKey(e) {
  if (e.key === 'Escape' && props.open) close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
watch(
  () => props.open,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : ''
  }
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div
        :class="
          cn(
            'w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-lg',
            props.class
          )
        "
      >
        <h2 v-if="title" class="mb-2 text-lg font-semibold">{{ title }}</h2>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
