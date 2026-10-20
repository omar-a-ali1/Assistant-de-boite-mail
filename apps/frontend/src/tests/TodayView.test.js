import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock the API module before importing components that use it.
vi.mock('@/services/api', () => ({
  emailApi: {
    list: vi.fn(),
    thread: vi.fn(),
    summary: vi.fn(),
  },
  draftApi: { create: vi.fn(), update: vi.fn() },
  replyApi: { submit: vi.fn(), status: vi.fn(), retry: vi.fn() },
  authApi: { me: vi.fn(), login: vi.fn(), logout: vi.fn() },
}))

import { emailApi } from '@/services/api'
import TodayView from '@/views/TodayView.vue'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('TodayView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows a loading state before data resolves', async () => {
    let resolve
    emailApi.summary.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = mount(TodayView, {
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.text()).toContain('Résumé du jour')
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
    resolve({ data: { data: sampleSummary() } })
    await flush()
  })

  it('renders stats and the top-5 list with reasons', async () => {
    emailApi.summary.mockResolvedValue({ data: { data: sampleSummary() } })
    const wrapper = mount(TodayView, { global: { stubs: { RouterLink: true } } })
    await flush()
    await flush()
    expect(wrapper.text()).toContain('E-mails reçus')
    expect(wrapper.text()).toContain('Les 5 e-mails à traiter en priorité')
    expect(wrapper.text()).toContain('Sélectionné')
  })

  it('renders an accessible error state when the API fails', async () => {
    emailApi.summary.mockRejectedValue({
      apiError: { message: 'Service indisponible.' },
    })
    const wrapper = mount(TodayView, { global: { stubs: { RouterLink: true } } })
    await flush()
    await flush()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Service indisponible.')
  })
})

function sampleSummary() {
  return {
    date: '2026-10-20',
    total: 6,
    byCategory: {
      client: 2,
      facture: 1,
      'rendez-vous': 1,
      newsletter: 1,
      'spam probable': 1,
      autre: 0,
    },
    byStatus: { TO_PROCESS: 3, DRAFT_READY: 1, REPLIED: 0, IGNORED: 2 },
    priority: { high: 3, medium: 1, low: 2 },
    needsReview: 1,
    topEmails: [
      {
        id: '1',
        threadId: 't1',
        sender: 'client@exemple.fr',
        subject: 'Devis urgent',
        receivedAt: '2026-10-20T09:00:00.000Z',
        category: 'client',
        priority: 3,
        status: 'TO_PROCESS',
        reason: 'Sélectionné : priorité haute, catégorie client.',
      },
    ],
  }
}
