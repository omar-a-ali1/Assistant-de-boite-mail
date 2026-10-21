import { reactive } from 'vue'

let counter = 0

export const toasts = reactive([])

export function pushToast(message, { type = 'info', timeout = 4000 } = {}) {
  const id = ++counter
  toasts.push({ id, message, type })
  if (timeout) setTimeout(() => dismissToast(id), timeout)
  return id
}

export function dismissToast(id) {
  const idx = toasts.findIndex((t) => t.id === id)
  if (idx !== -1) toasts.splice(idx, 1)
}

export const toast = {
  info: (m) => pushToast(m, { type: 'info' }),
  success: (m) => pushToast(m, { type: 'success' }),
  warning: (m) => pushToast(m, { type: 'warning', timeout: 7000 }),
  error: (m) => pushToast(m, { type: 'error', timeout: 6000 }),
}
