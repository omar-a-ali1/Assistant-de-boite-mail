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
    wrapper.find('#email').setValue('new@example.com'),
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

  it('registers, auto-logs in and redirects to today', async () => {
    authApi.register.mockResolvedValue({
      data: { data: { user: { id: 'u1', email: 'new@example.com' }, csrfToken: 'csrf' } },
    })
    const wrapper = mount(RegisterView, { global: { stubs: { RouterLink: true } } })
    await fill(wrapper, 'password-123', 'password-123')
    await wrapper.find('form').trigger('submit')
    await flush()

    expect(authApi.register).toHaveBeenCalledWith('new@example.com', 'password-123', 'New User')
    expect(push).toHaveBeenCalledWith('/today')
  })
})
