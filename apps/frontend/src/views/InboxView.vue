<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import StatusBadge from '@/components/emails/StatusBadge.vue'
import { useEmailList } from '@/composables/useEmailList'
import { CATEGORY_LABELS, STATUS_LABELS, formatDateTime } from '@/utils/format'

const props = defineProps({
  presetStatus: { type: String, default: '' },
})

const router = useRouter()
const route = useRoute()

const { items, meta, loading, error, filters, fetchList, resetFilters, nextPage, prevPage } =
  useEmailList({ status: props.presetStatus })

// When navigating between sidebar entries that reuse this view, update the
// status preset without a full remount.
watch(
  () => props.presetStatus,
  (val) => {
    filters.status = val
  }
)

const hasFilters = computed(() =>
  ['category', 'priority', 'status', 'sender', 'startDate', 'endDate', 'search'].some(
    (k) => filters[k] !== ''
  )
)

onMounted(() => fetchList(1))

function openThread(threadId) {
  router.push({ name: 'thread', params: { id: threadId } })
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4">
    <!-- Filters -->
    <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <div class="flex flex-wrap items-end gap-2">
        <div class="min-w-[200px] flex-1 space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="search">
            Recherche
          </label>
          <div class="relative">
            <Search class="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
            <Input id="search" v-model="filters.search" class="pl-8" placeholder="Objet, contenu, expéditeur…" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="f-cat">Catégorie</label>
          <Select id="f-cat" v-model="filters.category" class="w-40">
            <option value="">Toutes</option>
            <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">{{ label }}</option>
          </Select>
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="f-prio">Priorité</label>
          <Select id="f-prio" v-model="filters.priority" class="w-32">
            <option value="">Toutes</option>
            <option value="3">Haute</option>
            <option value="2">Moyenne</option>
            <option value="1">Basse</option>
          </Select>
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="f-status">Statut</label>
          <Select id="f-status" v-model="filters.status" class="w-40">
            <option value="">Tous</option>
            <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
          </Select>
        </div>
        <Button variant="ghost" size="sm" :disabled="!hasFilters" @click="resetFilters">
          <RefreshCw class="h-4 w-4" /> Réinitialiser
        </Button>
      </div>

      <div class="mt-2 flex flex-wrap items-end gap-2">
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="f-from">Du</label>
          <Input id="f-from" v-model="filters.startDate" type="date" class="w-40" />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="f-to">Au</label>
          <Input id="f-to" v-model="filters.endDate" type="date" class="w-40" />
        </div>
        <div class="min-w-[160px] space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="f-sender">Expéditeur</label>
          <Input id="f-sender" v-model="filters.sender" placeholder="ex: acme" />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="f-sort">Trier par</label>
          <Select id="f-sort" v-model="filters.sortBy" class="w-40">
            <option value="received_at">Date</option>
            <option value="priority">Priorité</option>
            <option value="subject">Objet</option>
            <option value="sender">Expéditeur</option>
          </Select>
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-[var(--color-muted-foreground)]" for="f-order">Ordre</label>
          <Select id="f-order" v-model="filters.sortOrder" class="w-28">
            <option value="desc">Décroissant</option>
            <option value="asc">Croissant</option>
          </Select>
        </div>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-2" aria-busy="true" aria-label="Chargement">
      <div
        v-for="n in 5"
        :key="n"
        class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
      >
        <Skeleton class="mb-2 h-4 w-1/3" />
        <Skeleton class="mb-2 h-4 w-2/3" />
        <Skeleton class="h-3 w-1/4" />
      </div>
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-lg border border-[var(--color-destructive)] bg-red-50 p-4 text-sm text-red-700"
      role="alert"
    >
      {{ error }}
    </div>

    <!-- Empty -->
    <div
      v-else-if="items.length === 0"
      class="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted-foreground)]"
    >
      Aucun e-mail ne correspond à votre recherche.
    </div>

    <!-- List -->
    <ul v-else class="space-y-2">
      <li v-for="email in items" :key="email.id">
        <button
          class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left transition-colors hover:bg-[var(--color-accent)]"
          @click="openThread(email.threadId)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium">{{ email.sender }}</span>
                <span v-if="email.needsReview" class="text-xs text-amber-600">À vérifier</span>
              </div>
              <p class="truncate text-sm font-semibold">{{ email.subject }}</p>
              <p class="truncate text-xs text-[var(--color-muted-foreground)]">{{ email.preview }}</p>
            </div>
            <div class="shrink-0 text-right">
              <div class="text-xs text-[var(--color-muted-foreground)]">
                {{ formatDateTime(email.receivedAt) }}
              </div>
              <div class="mt-1 flex flex-wrap justify-end gap-1">
                <StatusBadge type="category" :value="email.category" />
                <StatusBadge type="priority" :value="email.priority" />
                <StatusBadge type="status" :value="email.status" />
              </div>
            </div>
          </div>
        </button>
      </li>
    </ul>

    <!-- Pagination -->
    <div v-if="!loading && !error && items.length > 0" class="flex items-center justify-between">
      <span class="text-xs text-[var(--color-muted-foreground)]">
        {{ meta.total }} e-mail(s) — page {{ meta.page }} / {{ meta.totalPages }}
      </span>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="meta.page <= 1" @click="prevPage">
          <ChevronLeft class="h-4 w-4" /> Précédent
        </Button>
        <Button variant="outline" size="sm" :disabled="meta.page >= meta.totalPages" @click="nextPage">
          Suivant <ChevronRight class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
