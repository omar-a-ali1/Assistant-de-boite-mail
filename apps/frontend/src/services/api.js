import apiClient from './apiClient'

export const authApi = {
  register: ({ email, password, displayName, gmailAppPassword }) =>
    apiClient.post('/auth/register', { email, password, displayName, gmailAppPassword }),
  login: (email, password) => apiClient.post('/auth/login', { email, password }),
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me'),
}

export const mailApi = {
  status: () => apiClient.get('/mail/status'),
  connect: (gmailAppPassword) => apiClient.post('/mail/connect', { gmailAppPassword }),
  sync: () => apiClient.post('/mail/sync'),
}

export const emailApi = {
  list: (params = {}) => apiClient.get('/emails', { params }),
  thread: (id) => apiClient.get(`/threads/${id}`),
  summary: (date) => apiClient.get('/summary', { params: { date } }),
}

export const draftApi = {
  create: (emailId, tone) => apiClient.post(`/emails/${emailId}/draft`, { tone }),
  update: (draftId, body, tone) => apiClient.patch(`/drafts/${draftId}`, { body, ...(tone ? { tone } : {}) }),
}

export const replyApi = {
  submit: (emailId, payload, idempotencyKey) =>
    apiClient.post(`/emails/${emailId}/reply`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  status: (id) => apiClient.get(`/replies/${id}`),
  retry: (id) => apiClient.post(`/replies/${id}/retry`),
}
