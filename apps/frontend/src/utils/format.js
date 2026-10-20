/**
 * Shared display maps for categories, priorities and statuses.
 * Text labels accompany colours so meaning is never conveyed by colour alone.
 */
export const CATEGORY_LABELS = {
  client: 'Client',
  facture: 'Facture',
  'rendez-vous': 'Rendez-vous',
  newsletter: 'Newsletter',
  'spam probable': 'Spam probable',
  autre: 'Autre',
}

export const STATUS_LABELS = {
  TO_PROCESS: 'À traiter',
  DRAFT_READY: 'Brouillon prêt',
  REPLIED: 'Répondu',
  IGNORED: 'Ignoré',
}

export const PRIORITY_LABELS = {
  1: 'Basse',
  2: 'Moyenne',
  3: 'Haute',
}

export const TONE_LABELS = {
  formal: 'Formel',
  neutral: 'Neutre',
  short: 'Court',
}

export const REPLY_STATUS_LABELS = {
  PENDING: 'En attente',
  SENDING: 'En cours d’envoi',
  SENT: 'Envoyé',
  FAILED: 'Échec',
  UNKNOWN: 'Incertain',
}

export function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('fr-FR', { dateStyle: 'long' })
}

export function todayISO() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}
