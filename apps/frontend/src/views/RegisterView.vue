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
  try {
    await auth.register(email.value.trim(), password.value, displayName.value.trim())
    toast.success('Compte créé.')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/today'
    router.push(redirect)
  } catch (err) {
    const code = err.apiError?.code
    if (code === 'EMAIL_ALREADY_EXISTS') {
      error.value = 'Un compte existe déjà avec cet e-mail.'
    } else if (code === 'VALIDATION_ERROR') {
      error.value = 'Vérifiez l’adresse e-mail et le mot de passe (8 caractères minimum).'
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
        <CardDescription>Quelques secondes suffisent pour accéder à votre boîte.</CardDescription>
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
            <Label for="email">Adresse e-mail</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="vous@exemple.fr"
              required
            />
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
