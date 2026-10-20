<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Inbox, FileText, Send, AlertTriangle, CheckCircle2 } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import StatusBadge from '@/components/emails/StatusBadge.vue'
import { emailApi } from '@/services/api'
import { toast } from '@/composables/useToast'
import { todayISO, formatDateTime, CATEGORY_LABELS } from '@/utils/format'

const router = useRouter()
const summary = ref(null)
const loading = ref(true)
const error = ref(null)

const today = todayISO()

const stats = computed(() => {
  if (!summary.value) return []
  const s = summary.value
  return [
    { label: 'E-mails reçus', value: s.total, icon: Inbox },
    { label: 'À traiter', value: s.byStatus.TO_PROCESS, icon: AlertTriangle },
    { label: 'Brouillons prêts', value: s.byStatus.DRAFT_READY, icon: FileText },
    { label: 'Répondus', value: s.byStatus.REPLIED, icon: Send },
    { label: 'À vérifier', value: s.needsReview, icon: CheckCircle2 },
  ]
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const { data } = await emailApi.summary(today)
    summary.value = data.data
  } catch (err) {
    error.value = err.apiError?.message || 'Impossible de charger le résumé.'
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h2 class="text-lg font-semibold">Résumé du jour</h2>
      <p class="text-sm text-[var(--color-muted-foreground)]">
        Vue d’ensemble pour le {{ today }} — statistiques calculées à partir des e-mails enregistrés.
      </p>
    </div>

    <div v-if="loading" class="grid grid-cols-2 gap-3 md:grid-cols-5" aria-busy="true" aria-label="Chargement">
      <Skeleton v-for="n in 5" :key="n" class="h-24 w-full" />
    </div>

    <div
      v-else-if="error"
      class="rounded-lg border border-[var(--color-destructive)] bg-red-50 p-4 text-sm text-red-700"
      role="alert"
    >
      {{ error }}
    </div>

    <template v-else>
      <!-- Stat cards -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card v-for="s in stats" :key="s.label">
          <CardContent class="flex items-center gap-3 p-4">
            <component :is="s.icon" class="h-5 w-5 text-[var(--color-muted-foreground)]" />
            <div>
              <div class="text-2xl font-semibold">{{ s.value }}</div>
              <div class="text-xs text-[var(--color-muted-foreground)]">{{ s.label }}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <!-- Category breakdown -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Répartition par catégorie</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2">
            <div
              v-for="(count, key) in summary.byCategory"
              :key="key"
              class="flex items-center justify-between text-sm"
            >
              <span>{{ CATEGORY_LABELS[key] || key }}</span>
              <span class="font-medium">{{ count }}</span>
            </div>
          </CardContent>
        </Card>

        <!-- Priority overview -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Priorités</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span>Haute</span><span class="font-medium">{{ summary.priority.high }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span>Moyenne</span><span class="font-medium">{{ summary.priority.medium }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span>Basse</span><span class="font-medium">{{ summary.priority.low }}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Top 5 to handle -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Les 5 e-mails à traiter en priorité</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            v-if="summary.topEmails.length === 0"
            class="py-6 text-center text-sm text-[var(--color-muted-foreground)]"
          >
            Aucun e-mail en attente de traitement.
          </div>
          <ul v-else class="space-y-2">
            <li v-for="email in summary.topEmails" :key="email.id">
              <button
                class="w-full rounded-md border border-[var(--color-border)] p-3 text-left transition-colors hover:bg-[var(--color-accent)]"
                @click="router.push({ name: 'thread', params: { id: email.threadId } })"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium">{{ email.subject }}</div>
                    <div class="truncate text-xs text-[var(--color-muted-foreground)]">
                      {{ email.sender }} — {{ formatDateTime(email.receivedAt) }}
                    </div>
                    <p class="mt-1 text-xs italic text-[var(--color-muted-foreground)]">
                      {{ email.reason }}
                    </p>
                  </div>
                  <div class="flex shrink-0 flex-wrap justify-end gap-1">
                    <StatusBadge type="category" :value="email.category" />
                    <StatusBadge type="priority" :value="email.priority" />
                  </div>
                </div>
              </button>
            </li>
          </ul>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
