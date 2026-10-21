<script setup>
import { useRoute, useRouter } from 'vue-router'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/composables/useToast'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const displayName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const gmailAppPassword = ref('')
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (password.value.length < 8) {
    error.value = 'Le mot de passe doit contenir au moins 8 caractères.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Les mots de passe ne correspondent pas.'
    return
  }
  const appPassword = gmailAppPassword.value.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9]{16}$/.test(appPassword)) {
    error.value = 'Le mot de passe d’application Gmail doit contenir 16 caractères.'
    return
  }
  try {
    const result = await auth.register({
      email: email.value.trim(),
      password: password.value,
      displayName: displayName.value.trim(),
      gmailAppPassword: appPassword,
    })
    if (result.initialSync?.error) {
      toast.warning(
        'Compte créé, mais la première synchronisation a échoué. Utilisez « Synchroniser » pour réessayer.'
      )
    } else {
      const imported = result.initialSync?.imported ?? 0
      toast.success(`Compte créé. ${imported} e-mail(s) importé(s).`)
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/today'
    router.push(redirect)
  } catch (err) {
    const code = err.apiError?.code
    if (code === 'EMAIL_ALREADY_EXISTS') {
      error.value = 'Un compte existe déjà avec cet e-mail.'
    } else if (code === 'GMAIL_AUTH_FAILED') {
      error.value =
        'Gmail a refusé ces identifiants. Vérifiez l’adresse et le mot de passe d’application (16 caractères).'
    } else if (code === 'GMAIL_APP_PASSWORD_INVALID') {
      error.value = 'Le mot de passe d’application doit contenir exactement 16 caractères.'
    } else if (code === 'GMAIL_ACCOUNT_REQUIRED') {
      error.value = 'Utilisez une adresse Gmail (@gmail.com).'
    } else if (code === 'VALIDATION_ERROR') {
      error.value =
        'Vérifiez l’adresse Gmail, le mot de passe (8 caractères minimum) et le mot de passe d’application (16 caractères).'
    } else {
      error.value = err.apiError?.message || 'Création du compte impossible.'
    }
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[var(--color-muted)] p-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Créer un compte</CardTitle>
        <CardDescription>Connectez votre Gmail pour retrouver vos vrais e-mails.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="space-y-1.5">
            <Label for="displayName">Nom (optionnel)</Label>
            <Input
              id="displayName"
              v-model="displayName"
              type="text"
              autocomplete="name"
              placeholder="Votre nom"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="email">Adresse Gmail</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="vous@gmail.com"
              required
            />
            <p class="text-xs text-[var(--color-muted-foreground)]">
              Utilisez une adresse @gmail.com. Les autres domaines ne sont pas pris en charge.
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="password">Mot de passe</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              placeholder="8 caractères minimum"
              autocomplete="new-password"
              required
            />
          </div>
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
              16 caractères, généré dans votre compte Google avec la validation en deux étapes.
              Ce n’est pas votre mot de passe Google habituel.
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              placeholder="Répétez le mot de passe"
              autocomplete="new-password"
              required
            />
          </div>

          <p
            v-if="error"
            class="rounded-md border border-[var(--color-destructive)] bg-red-50 p-2 text-sm text-red-700"
            role="alert"
          >
            {{ error }}
          </p>

          <Button type="submit" class="w-full" :disabled="auth.loading">
            {{ auth.loading ? 'Création…' : 'Créer le compte' }}
          </Button>
        </form>

        <p class="mt-4 text-center text-sm text-[var(--color-muted-foreground)]">
          Déjà un compte ?
          <RouterLink to="/login" class="font-medium text-[var(--color-primary)] hover:underline">
            Se connecter
          </RouterLink>
        </p>
      </CardContent>
    </Card>
  </div>
</template>
