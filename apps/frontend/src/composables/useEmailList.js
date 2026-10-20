import { ref, reactive, watch } from 'vue'
import { emailApi } from '@/services/api'
import { toast } from '@/composables/useToast'

/**
 * Reactive, paginated email list with combinable filters.
 * Server state is kept separate from local filter form state.
 */
export function useEmailList(initial = {}) {
  const items = ref([])
  const meta = reactive({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const loading = ref(false)
  const error = ref(null)

  const filters = reactive({
    category: initial.category || '',
    priority: initial.priority || '',
    status: initial.status || '',
    sender: initial.sender || '',
    startDate: initial.startDate || '',
    endDate: initial.endDate || '',
    search: initial.search || '',
    sortBy: initial.sortBy || 'received_at',
    sortOrder: initial.sortOrder || 'desc',
  })

  let controller = null

  function buildParams(page = meta.page) {
    const params = { page, limit: meta.limit }
    for (const [k, v] of Object.entries(filters)) {
      if (v !== '' && v != null) params[k] = v
    }
    return params
  }

  async function fetchList(page = 1) {
    if (controller) controller.abort()
    controller = new AbortController()
    loading.value = true
    error.value = null
    try {
      const { data } = await emailApi.list(buildParams(page))
      items.value = data.data
      Object.assign(meta, data.meta)
    } catch (err) {
      if (err.code === 'ERR_CANCELED') return
      error.value = err.apiError?.message || 'Impossible de charger les e-mails.'
      toast.error(error.value)
    } finally {
      loading.value = false
    }
  }

  function resetFilters() {
    filters.category = ''
    filters.priority = ''
    filters.status = ''
    filters.sender = ''
    filters.startDate = ''
    filters.endDate = ''
    filters.search = ''
    fetchList(1)
  }

  function nextPage() {
    if (meta.page < meta.totalPages) fetchList(meta.page + 1)
  }
  function prevPage() {
    if (meta.page > 1) fetchList(meta.page - 1)
  }

  // Refetch from page 1 whenever any filter changes.
  watch(filters, () => fetchList(1))

  return { items, meta, loading, error, filters, fetchList, resetFilters, nextPage, prevPage }
}
