import { defineStore } from 'pinia'
import { authApi } from '@/services/api'
import { setCsrfToken } from '@/services/apiClient'

/**
 * Authentication store. Session state lives server-side; this store only
 * mirrors the authenticated user in memory (never localStorage).
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    initialized: false,
    loading: false,
  }),
  getters: {
    isAuthenticated: (state) => !!state.user,
  },
  actions: {
    async fetchMe() {
      try {
        const { data } = await authApi.me()
        this.user = data.data.user
        setCsrfToken(data.data.csrfToken)
      } catch {
        this.user = null
      } finally {
        this.initialized = true
      }
    },
    async register(payload) {
      this.loading = true
      try {
        const { data } = await authApi.register(payload)
        this.user = data.data.user
        setCsrfToken(data.data.csrfToken)
        this.initialized = true
        return { user: this.user, initialSync: data.data.initialSync }
      } finally {
        this.loading = false
      }
    },
    async login(email, password) {
      this.loading = true
      try {
        const { data } = await authApi.login(email, password)
        this.user = data.data.user
        setCsrfToken(data.data.csrfToken)
        this.initialized = true
        return this.user
      } finally {
        this.loading = false
      }
    },
    async logout() {
      try {
        await authApi.logout()
      } finally {
        this.user = null
        setCsrfToken(null)
      }
    },
  },
})
