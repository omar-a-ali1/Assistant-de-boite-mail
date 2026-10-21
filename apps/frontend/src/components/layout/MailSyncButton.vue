<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, PlugZap } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { mailApi } from '@/services/api'
import { toast } from '@/composables/useToast'

const auth = useAuthStore()
const router = useRouter()
const syncing = ref(false)

const isGmailAccount = computed(() => {
  const email = String(auth.user?.email || '').toLowerCase()
  return email.endsWith('@gmail.com') || email.endsWith('@googlemail.com')
})

async function sync() {
  syncing.value = true
  try {
    const { data } = await mailApi.sync()
    const result = data.data
    toast.success(
      `Synchronisation terminée : ${result.imported} nouveau(x), ${result.skipped} déjà présent(s).`
    )
    setTimeout(() => window.location.reload(), 800)
  } catch (err) {
    const code = err.apiError?.code
    if (code === 'GMAIL_NOT_CONNECTED' || code === 'GMAIL_CREDENTIALS_UNREADABLE') {
      toast.error('Aucune boîte Gmail valide n’est connectée à ce compte.')
    } else if (code === 'GMAIL_SYNC_FAILED') {
      toast.error('La synchronisation Gmail a échoué. Réessayez dans un instant.')
    } else {
      toast.error(err.apiError?.message || 'Synchronisation impossible.')
    }
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <Button
    v-if="isGmailAccount && !auth.user?.gmailConnected"
    variant="outline"
    size="sm"
    @click="router.push('/connect-gmail')"
  >
    <PlugZap class="mr-2 h-4 w-4" />
    Connecter Gmail
  </Button>
  <Button
    v-else-if="auth.user?.gmailConnected"
    variant="outline"
    size="sm"
    :disabled="syncing"
    @click="sync"
  >
    <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': syncing }" />
    {{ syncing ? 'Synchronisation…' : 'Synchroniser' }}
  </Button>
</template>
