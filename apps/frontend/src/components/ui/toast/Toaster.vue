<script setup>
import { toasts, dismissToast } from '@/composables/useToast'
import { cn } from '@/lib/utils'

const variantClass = {
  info: 'border-[var(--color-border)] bg-[var(--color-card)]',
  success: 'border-green-600 bg-green-50 text-green-900',
  error: 'border-[var(--color-destructive)] bg-red-50 text-red-900',
}
</script>

<template>
  <div class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
    <div
      v-for="t in toasts"
      :key="t.id"
      :class="cn('pointer-events-auto rounded-md border p-3 text-sm shadow-md', variantClass[t.type])"
      role="status"
    >
      <div class="flex items-start justify-between gap-3">
        <span>{{ t.message }}</span>
        <button class="text-xs opacity-60 hover:opacity-100" aria-label="Fermer" @click="dismissToast(t.id)">
          ✕
        </button>
      </div>
    </div>
  </div>
</template>
