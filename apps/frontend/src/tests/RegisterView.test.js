import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push }),
}))

vi.mock('@/services/api', () => ({
  authApi: { register: vi.fn() },
}))

import { authApi } from '@/services/api'
import RegisterView from '@/views/RegisterView.vue'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

function fill(wrapper, password, confirmPassword) {
  return Promise.all([
    wrapper.find('#email').setValue('new@gmail.com'),
    wrapper.find('#gmailAppPassword').setValue('abcd efgh ijkl mnop'),
    wrapper.find('#displayName').setValue('New User'),
    wrapper.find('#password').setValue(password),
    wrapper.find('#confirmPassword').setValue(confirmPassword),
  ])
}

describe('RegisterView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('refuses mismatched passwords without calling the API', async () => {
    const wrapper = mount(RegisterView, { global: { stubs: { RouterLink: true } } })
    await fill(wrapper, 'password-123', 'different-123')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toContain('ne correspondent pas')
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('refuses an invalid Gmail App Password without calling the API', async () => {
    const wrapper = mount(RegisterView, { global: { stubs: { RouterLink: true } } })
    await fill(wrapper, 'password-123', 'password-123')
    await wrapper.find('#gmailAppPassword').setValue('too-short')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toContain('8 caractères')
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('registers, auto-logs in and redirects to today', async () => {
    authApi.register.mockResolvedValue({
      data: {
        data: {
          user: { id: 'u1', email: 'new@gmail.com', gmailConnected: true },
          csrfToken: 'csrf',
          initialSync: { imported: 3, skipped: 0 },
        },
      },
    })
    const wrapper = mount(RegisterView, { global: { stubs: { RouterLink: true } } })
    await fill(wrapper, 'password-123', 'password-123')
    await wrapper.find('form').trigger('submit')
    await flush()

    expect(authApi.register).toHaveBeenCalledWith({
      email: 'new@gmail.com',
      password: 'password-123',
      displayName: 'New User',
      gmailAppPassword: 'abcdefghijklmnop',
    })
    expect(push).toHaveBeenCalledWith('/today')
  })
})
