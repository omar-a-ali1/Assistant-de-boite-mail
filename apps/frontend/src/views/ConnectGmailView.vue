<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth'
import { mailApi } from '@/services/api'
import { toast } from '@/composables/useToast'

const auth = useAuthStore()
const router = useRouter()

const gmailAppPassword = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  const password = gmailAppPassword.value.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9]{8,}$/.test(password)) {
    error.value = 'Le mot de passe d’application Gmail doit contenir au moins 8 caractères.'
    return
  }

  loading.value = true
  try {
    const { data } = await mailApi.connect(password)
    await auth.fetchMe()
    const imported = data.data.initialSync?.imported ?? 0
    if (data.data.initialSync?.error) {
      toast.warning(
        'Gmail est connecté, mais la première synchronisation a échoué. Utilisez « Synchroniser ».'
      )
    } else {
      toast.success(`Gmail connecté. ${imported} e-mail(s) importé(s).`)
    }
    router.push('/today')
  } catch (err) {
    const code = err.apiError?.code
    if (code === 'GMAIL_AUTH_FAILED') {
      error.value =
        'Gmail a refusé ce mot de passe d’application. Vérifiez qu’il vient bien de votre compte Google.'
    } else if (code === 'GMAIL_ACCOUNT_REQUIRED') {
      error.value = 'Ce compte n’utilise pas une adresse Gmail.'
    } else if (code === 'GMAIL_APP_PASSWORD_INVALID') {
      error.value = 'Le mot de passe d’application doit contenir au moins 8 caractères.'
    } else {
      error.value = err.apiError?.message || 'Connexion Gmail impossible.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <Card>
      <CardHeader>
        <CardTitle>Connecter Gmail</CardTitle>
        <CardDescription>
          Connectez la boîte {{ auth.user?.email }} pour importer ses vrais e-mails.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="space-y-1.5">
            <Label for="gmailAppPassword">Mot de passe d’application Gmail</Label>
            <Input
              id="gmailAppPassword"
              v-model="gmailAppPassword"
              type="password"
              placeholder="abcd efgh ijkl mnop"
              autocomplete="off"
              required
            />
            <p class="text-xs text-[var(--color-muted-foreground)]">
              Au moins 8 caractères (16 pour un vrai mot de passe Google), généré dans votre compte Google avec la validation en deux étapes.
              Ce n’est pas votre mot de passe Google habituel.
            </p>
          </div>

          <p
            v-if="error"
            class="rounded-md border border-[var(--color-destructive)] bg-red-50 p-2 text-sm text-red-700"
            role="alert"
          >
            {{ error }}
          </p>

          <div class="flex gap-2">
            <Button type="submit" :disabled="loading">
              {{ loading ? 'Connexion…' : 'Connecter et synchroniser' }}
            </Button>
            <Button type="button" variant="outline" @click="router.push('/today')">
              Plus tard
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
