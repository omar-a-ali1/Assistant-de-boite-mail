<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  LayoutDashboard,
  Inbox,
  FileText,
  CheckCircle2,
  Archive,
  Menu,
  X,
  LogOut,
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const mobileOpen = ref(false)

const nav = [
  { name: 'today', label: 'Aujourd’hui', icon: LayoutDashboard },
  { name: 'inbox', label: 'Boîte de réception', icon: Inbox },
  { name: 'drafts', label: 'Brouillons', icon: FileText },
  { name: 'replied', label: 'Répondus', icon: CheckCircle2 },
  { name: 'ignored', label: 'Ignorés', icon: Archive },
]

const activeName = computed(() => route.name)

async function go(name) {
  mobileOpen.value = false
  await router.push({ name })
}

async function logout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <!-- Mobile top bar -->
  <div
    class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2 md:hidden"
  >
    <button aria-label="Ouvrir la navigation" @click="mobileOpen = true">
      <Menu class="h-5 w-5" />
    </button>
    <span class="text-sm font-semibold">Assistant e-mail</span>
    <span class="w-5" />
  </div>

  <!-- Sidebar -->
  <aside
    :class="
      cn(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)] transition-transform md:static md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )
    "
  >
    <div class="flex h-14 items-center justify-between px-4">
      <span class="text-sm font-semibold">Assistant e-mail</span>
      <button class="md:hidden" aria-label="Fermer" @click="mobileOpen = false">
        <X class="h-5 w-5" />
      </button>
    </div>

    <nav class="flex-1 space-y-1 px-2">
      <button
        v-for="item in nav"
        :key="item.name"
        :class="
          cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            activeName === item.name
              ? 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]'
              : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
          )
        "
        :aria-current="activeName === item.name ? 'page' : undefined"
        @click="go(item.name)"
      >
        <component :is="item.icon" class="h-4 w-4" />
        {{ item.label }}
      </button>
    </nav>

    <div class="border-t border-[var(--color-border)] p-3">
      <div class="mb-2 truncate text-xs text-[var(--color-muted-foreground)]">
        {{ auth.user?.email }}
      </div>
      <button
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
        @click="logout"
      >
        <LogOut class="h-4 w-4" />
        Déconnexion
      </button>
    </div>
  </aside>

  <!-- Mobile backdrop -->
  <div
    v-if="mobileOpen"
    class="fixed inset-0 z-30 bg-black/40 md:hidden"
    aria-hidden="true"
    @click="mobileOpen = false"
  />
</template>
