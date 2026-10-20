<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import StatusBadge from '@/components/emails/StatusBadge.vue'
import ReplyComposer from '@/components/emails/ReplyComposer.vue'
import { emailApi } from '@/services/api'
import { toast } from '@/composables/useToast'
import { formatDateTime, REPLY_STATUS_LABELS } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const loading = ref(true)
const error = ref(null)

const lastMessage = computed(() => data.value?.messages?.[data.value.messages.length - 1] || null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await emailApi.thread(route.params.id)
    data.value = res.data.data
  } catch (err) {
    error.value = err.apiError?.message || 'Conversation introuvable.'
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-4">
    <Button variant="ghost" size="sm" @click="router.back()">
      <ArrowLeft class="h-4 w-4" /> Retour
    </Button>

    <div v-if="loading" class="space-y-3">
      <Skeleton class="h-8 w-1/2" />
      <Skeleton class="h-32 w-full" />
      <Skeleton class="h-32 w-full" />
    </div>

    <div
      v-else-if="error"
      class="rounded-lg border border-[var(--color-destructive)] bg-red-50 p-4 text-sm text-red-700"
      role="alert"
    >
      {{ error }}
    </div>

    <template v-else-if="data">
      <div>
        <h2 class="text-lg font-semibold">{{ data.thread.subject }}</h2>
        <p class="text-xs text-[var(--color-muted-foreground)]">
          {{ data.messages.length }} message(s) — dernière activité le
          {{ formatDateTime(data.thread.latestMessageAt) }}
        </p>
      </div>

      <!-- Messages -->
      <ol class="space-y-3">
        <li v-for="msg in data.messages" :key="msg.id">
          <Card>
            <CardHeader class="pb-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <CardTitle class="text-sm">{{ msg.sender }}</CardTitle>
                  <p class="text-xs text-[var(--color-muted-foreground)]">
                    À : {{ (msg.recipients || []).join(', ') }} — {{ formatDateTime(msg.receivedAt) }}
                  </p>
                </div>
                <div class="flex flex-wrap justify-end gap-1">
                  <StatusBadge type="category" :value="msg.category" />
                  <StatusBadge type="priority" :value="msg.priority" />
                </div>
              </div>
            </CardHeader>
            <CardContent class="space-y-3">
              <p class="whitespace-pre-wrap text-sm">{{ msg.body }}</p>

              <div
                v-if="msg.summary"
                class="rounded-md bg-[var(--color-muted)] p-3 text-xs text-[var(--color-muted-foreground)]"
              >
                <p><span class="font-medium">Résumé IA :</span> {{ msg.summary }}</p>
                <p v-if="msg.expectedAction">
                  <span class="font-medium">Action attendue :</span> {{ msg.expectedAction }}
                </p>
                <p v-if="msg.needsReview" class="text-amber-700">Classification à vérifier manuellement.</p>
              </div>
            </CardContent>
          </Card>
        </li>
      </ol>

      <!-- Existing replies history -->
      <Card v-if="data.replies.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm">Historique des réponses</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2">
          <div
            v-for="r in data.replies"
            :key="r.id"
            class="flex items-center justify-between gap-2 text-sm"
          >
            <span class="truncate text-[var(--color-muted-foreground)]">
              {{ r.body.slice(0, 80) }}…
            </span>
            <span class="shrink-0">{{ REPLY_STATUS_LABELS[r.status] || r.status }}</span>
          </div>
        </CardContent>
      </Card>

      <!-- Reply composer -->
      <Card v-if="lastMessage">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm">Répondre</CardTitle>
        </CardHeader>
        <CardContent>
          <ReplyComposer
            :email="lastMessage"
            :thread-id="data.thread.id"
            :existing-replies="data.replies"
            @reply-updated="load"
          />
        </CardContent>
      </Card>
    </template>
  </div>
</template>
