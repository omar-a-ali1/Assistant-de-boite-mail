import axios from 'axios'

/**
 * Single configurable Axios client for the Express API.
 * - Session cookie is sent via `withCredentials` (never localStorage).
 * - CSRF token is echoed from the in-memory auth store.
 * - Centralized error handling and cancellation support.
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
})

let csrfToken = null
let onUnauthorized = null

export function setCsrfToken(token) {
  csrfToken = token
}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

apiClient.interceptors.request.use((config) => {
  const unsafe = ['post', 'put', 'patch', 'delete'].includes((config.method || '').toLowerCase())
  if (unsafe && csrfToken) config.headers['X-CSRF-Token'] = csrfToken
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status
    if (status === 401 && onUnauthorized) onUnauthorized()
    const payload = error.response?.data?.error
    error.apiError = payload || { code: 'NETWORK_ERROR', message: 'Erreur de communication.' }
    return Promise.reject(error)
  }
)

export default apiClient
