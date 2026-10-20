<script setup>
import { onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { Toaster } from '@/components/ui/toast'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()

onMounted(() => {
  if (!auth.initialized) auth.fetchMe()
})
</script>

<template>
  <!-- Public pages (login) render without the app shell -->
  <RouterView v-if="route.meta.public" />

  <div v-else class="flex h-screen overflow-hidden">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader />
      <main class="flex-1 overflow-y-auto bg-[var(--color-muted)]/40 p-4 md:p-6">
        <RouterView />
      </main>
    </div>
  </div>

  <Toaster />
</template>
