import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/', redirect: '/today' },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: 'Connexion' },
  },
  {
    path: '/today',
    name: 'today',
    component: () => import('@/views/TodayView.vue'),
    meta: { title: 'Aujourd’hui' },
  },
  {
    path: '/inbox',
    name: 'inbox',
    component: () => import('@/views/InboxView.vue'),
    meta: { title: 'Boîte de réception' },
  },
  {
    path: '/drafts',
    name: 'drafts',
    component: () => import('@/views/InboxView.vue'),
    props: { presetStatus: 'DRAFT_READY' },
    meta: { title: 'Brouillons' },
  },
  {
    path: '/replied',
    name: 'replied',
    component: () => import('@/views/InboxView.vue'),
    props: { presetStatus: 'REPLIED' },
    meta: { title: 'Répondus' },
  },
  {
    path: '/ignored',
    name: 'ignored',
    component: () => import('@/views/InboxView.vue'),
    props: { presetStatus: 'IGNORED' },
    meta: { title: 'Ignorés' },
  },
  {
    path: '/threads/:id',
    name: 'thread',
    component: () => import('@/views/ThreadView.vue'),
    meta: { title: 'Conversation' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) await auth.fetchMe()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'today' }
  }
  return true
})

export default router
