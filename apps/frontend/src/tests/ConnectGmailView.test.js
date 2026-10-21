import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/services/api', () => ({
  mailApi: { connect: vi.fn(), sync: vi.fn(), status: vi.fn() },
  authApi: { me: vi.fn() },
}))

import { mailApi, authApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import ConnectGmailView from '@/views/ConnectGmailView.vue'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('ConnectGmailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('refuses an invalid App Password without calling the API', async () => {
    const wrapper = mount(ConnectGmailView)
    await wrapper.find('#gmailAppPassword').setValue('too-short')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toContain('8 caractères')
    expect(mailApi.connect).not.toHaveBeenCalled()
  })

  it('connects Gmail, refreshes the session and redirects', async () => {
    authApi.me.mockResolvedValue({
      data: {
        data: {
          user: { id: 'u1', email: 'user@gmail.com', gmailConnected: true },
          csrfToken: 'csrf',
        },
      },
    })
    mailApi.connect.mockResolvedValue({
      data: { data: { gmailConnected: true, initialSync: { imported: 4 } } },
    })

    const wrapper = mount(ConnectGmailView)
    await wrapper.find('#gmailAppPassword').setValue('abcd efgh ijkl mnop')
    await wrapper.find('form').trigger('submit')
    await flush()

    expect(mailApi.connect).toHaveBeenCalledWith('abcdefghijklmnop')
    expect(useAuthStore().user.gmailConnected).toBe(true)
    expect(push).toHaveBeenCalledWith('/today')
  })
})
