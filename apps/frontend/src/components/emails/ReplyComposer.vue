<script setup>
import { computed, ref } from 'vue'
import { Sparkles, Save, Send, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { draftApi, replyApi } from '@/services/api'
import { toast } from '@/composables/useToast'
import { TONE_LABELS, REPLY_STATUS_LABELS } from '@/utils/format'

const props = defineProps({
  email: { type: Object, required: true },
  threadId: { type: String, required: true },
  existingReplies: { type: Array, default: () => [] },
})
const emit = defineEmits(['reply-updated'])

const tone = ref('formal')
const body = ref('')
const draftId = ref(null)
const generating = ref(false)
const saving = ref(false)
const sending = ref(false)
const confirmOpen = ref(false)
const currentReply = ref(null)
const pollTimer = ref(null)

const isAiDraft = computed(() => !!draftId.value && !saving.value)
const canSend = computed(() => body.value.trim().length > 0 && !sending.value)

async function generate() {
  generating.value = true
  try {
    const { data } = await draftApi.create(props.email.id, tone.value)
    body.value = data.data.body
    draftId.value = data.data.id
    toast.success('Brouillon généré par IA. Vous pouvez le modifier.')
  } catch (err) {
    toast.error(err.apiError?.message || 'Génération du brouillon impossible.')
  } finally {
    generating.value = false
  }
}

async function save() {
  if (!draftId.value) {
    toast.info('Aucun brouillon à enregistrer. Générez d’abord un brouillon.')
    return
  }
  saving.value = true
  try {
    await draftApi.update(draftId.value, body.value, tone.value)
    toast.success('Brouillon enregistré.')
  } catch (err) {
    toast.error(err.apiError?.message || 'Enregistrement impossible.')
  } finally {
    saving.value = false
  }
}

function requestSend() {
  if (!canSend.value) return
  confirmOpen.value = true
}

async function confirmSend() {
  confirmOpen.value = false
  sending.value = true
  try {
    // Idempotency key is generated per deliberate send operation.
    const key = crypto.randomUUID()
    const payload = { body: body.value, confirm: true }
    if (draftId.value) payload.draftId = draftId.value
    const { data } = await replyApi.submit(props.email.id, payload, key)
    currentReply.value = data.data
    toast.info('Envoi en cours…')
    startPolling(data.data.id)
    emit('reply-updated')
  } catch (err) {
    if (err.apiError?.code === 'IDEMPOTENCY_CONFLICT') {
      toast.error('Opération déjà effectuée avec un contenu différent.')
    } else {
      toast.error(err.apiError?.message || 'Envoi impossible.')
    }
  } finally {
    sending.value = false
  }
}

function startPolling(replyId) {
  stopPolling()
  pollTimer.value = setInterval(async () => {
    try {
      const { data } = await replyApi.status(replyId)
      currentReply.value = data.data
      if (['SENT', 'FAILED', 'UNKNOWN'].includes(data.data.status)) {
        stopPolling()
        emit('reply-updated')
      }
    } catch {
      stopPolling()
    }
  }, 2500)
}

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

async function retry() {
  if (!currentReply.value) return
  try {
    const { data } = await replyApi.retry(currentReply.value.id)
    currentReply.value = { ...currentReply.value, status: data.data.status }
    toast.info('Nouvelle tentative d’envoi…')
    startPolling(data.data.id)
  } catch (err) {
    toast.error(err.apiError?.message || 'Réessai impossible.')
  }
}

const replyStatusVariant = computed(() => {
  const s = currentReply.value?.status
  if (s === 'SENT') return 'default'
  if (s === 'FAILED') return 'destructive'
  return 'secondary'
})
</script>

<template>
  <div class="space-y-3">
    <!-- Delivery status panel -->
    <div
      v-if="currentReply"
      class="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] p-3 text-sm"
      role="status"
    >
      <Badge :variant="replyStatusVariant">
        <Clock v-if="currentReply.status === 'PENDING' || currentReply.status === 'SENDING'" class="mr-1 h-3 w-3" />
        <CheckCircle2 v-else-if="currentReply.status === 'SENT'" class="mr-1 h-3 w-3" />
        <AlertTriangle v-else class="mr-1 h-3 w-3" />
        {{ REPLY_STATUS_LABELS[currentReply.status] || currentReply.status }}
      </Badge>

      <span v-if="currentReply.status === 'SENDING'" class="text-[var(--color-muted-foreground)]">
        Envoi en cours…
      </span>
      <span v-else-if="currentReply.status === 'SENT'" class="text-[var(--color-muted-foreground)]">
        Message envoyé dans le fil.
      </span>
      <span v-else-if="currentReply.status === 'FAILED'" class="text-[var(--color-muted-foreground)]">
        Échec : {{ currentReply.errorMessage || 'erreur inconnue' }}
      </span>
      <span v-else-if="currentReply.status === 'UNKNOWN'" class="text-[var(--color-muted-foreground)]">
        Résultat incertain — réconciliation requise avant tout nouvel envoi.
      </span>
      <span v-else class="text-[var(--color-muted-foreground)]">
        Opération enregistrée, en attente d’envoi.
      </span>

      <Button
        v-if="currentReply.retryable"
        variant="outline"
        size="sm"
        class="ml-auto"
        @click="retry"
      >
        <RefreshCw class="h-4 w-4" /> Réessayer
      </Button>
    </div>

    <!-- Tone + generate -->
    <div class="flex flex-wrap items-end gap-2">
      <div class="space-y-1.5">
        <Label for="tone">Ton de la réponse</Label>
        <Select id="tone" v-model="tone" class="w-40">
          <option v-for="(label, key) in TONE_LABELS" :key="key" :value="key">{{ label }}</option>
        </Select>
      </div>
      <Button variant="secondary" :disabled="generating" @click="generate">
        <Sparkles class="h-4 w-4" />
        {{ generating ? 'Génération…' : 'Générer un brouillon IA' }}
      </Button>
    </div>

    <p v-if="isAiDraft" class="text-xs text-[var(--color-muted-foreground)]">
      Brouillon proposé par IA, entièrement modifiable. Aucun envoi sans votre validation.
    </p>

    <!-- Editable body -->
    <div class="space-y-1.5">
      <Label for="reply-body">Réponse</Label>
      <Textarea id="reply-body" v-model="body" :rows="8" placeholder="Rédigez votre réponse…" />
    </div>

    <div class="flex flex-wrap gap-2">
      <Button variant="outline" :disabled="!draftId || saving" @click="save">
        <Save class="h-4 w-4" /> Enregistrer le brouillon
      </Button>
      <Button :disabled="!canSend" @click="requestSend">
        <Send class="h-4 w-4" /> Envoyer la réponse
      </Button>
    </div>

    <!-- Explicit confirmation dialog -->
    <Dialog
      :open="confirmOpen"
      title="Confirmer l’envoi"
      @update:open="confirmOpen = $event"
    >
      <p class="text-sm text-[var(--color-muted-foreground)]">
        Cette réponse sera envoyée dans le fil de discussion d’origine. Cette action est définitive.
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <Button variant="ghost" @click="confirmOpen = false">Annuler</Button>
        <Button @click="confirmSend">Confirmer l’envoi</Button>
      </div>
    </Dialog>
  </div>
</template>
