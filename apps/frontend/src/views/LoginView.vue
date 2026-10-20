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

const email = ref('')
const password = ref('')
const error = ref('')

async function onSubmit() {
  error.value = ''
  try {
    await auth.login(email.value.trim(), password.value)
    toast.success('Connexion réussie.')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/today'
    router.push(redirect)
  } catch (err) {
    error.value = err.apiError?.message || 'Connexion impossible.'
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[var(--color-muted)] p-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Assistant e-mail</CardTitle>
        <CardDescription>Connectez-vous pour accéder à votre boîte de réception.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="onSubmit">
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
              autocomplete="current-password"
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
            {{ auth.loading ? 'Connexion…' : 'Se connecter' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
