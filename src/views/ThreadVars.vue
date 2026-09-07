<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

const loading = ref(false)
const loadFailed = ref(false)
const list = ref([])
const lastUpdate = ref('')
const expanded = ref({})
const collapsedClasses = ref({})

// 添加
const adding = ref(false)
const newKey = ref('')
const newValue = ref('')

// 编辑（点击键或值进入编辑态，同时编辑键跟值）
const editingKey = ref(null)
const editKey = ref('')
const editValue = ref('')

let timer = null

const VAR_LIMIT = 100
const PAGE_SIZE = 50
const total = ref(0)
const hasMore = ref(false)
const loadingMore = ref(false)
const scrollBoxRef = ref(null)

function isValidKey(key) {
  const k = (key || '').trim()
  if (!k) {
    ElMessage.error('键不能为空')
    return false
  }
  return true
}

function isLong(item) {
  return String(item.v ?? '').length > VAR_LIMIT
}

function displayVal(item, id) {
  const s = String(item.v ?? '')
  if (!expanded.value[id] && s.length > VAR_LIMIT) {
    return s.slice(0, VAR_LIMIT) + '…'
  }
  return s
}

function toggleExpand(item, id) {
  expanded.value[id] = !expanded.value[id]
}

// 是否为可折叠的类对象/对象/数组（含 children 成员变量）
function isClassVal(item) {
  return (
    item &&
    item.children &&
    typeof item.children === 'object' &&
    !Array.isArray(item.children) &&
    Object.keys(item.children).length > 0
  )
}

function isClassCollapsed(id) {
  return !!collapsedClasses.value[id]
}

function toggleClass(id) {
  if (collapsedClasses.value[id]) {
    delete collapsedClasses.value[id]
  } else {
    collapsedClasses.value[id] = true
  }
}

function nodeId(path) {
  return path.join('.')
}

// 将线程变量树展开为可见行，类对象/对象/数组成员按折叠状态展开
const rows = computed(() => {
  const out = []
  const walk = (key, item, depth, path) => {
    const id = nodeId(path)
    const hasChildren = isClassVal(item)
    const collapsed = hasChildren && isClassCollapsed(id)
    out.push({ key, item, depth, id, hasChildren, collapsed, top: depth === 0 })
    if (hasChildren && !collapsed) {
      for (const [ck, cv] of Object.entries(item.children)) {
        walk(ck, cv, depth + 1, [...path, ck])
      }
    }
  }
  for (const it of list.value) {
    walk(it.key, it, 0, [it.key])
  }
  return out
})

function startEdit(row) {
  const item = row.item || row
  if (item.t === '类') {
    ElMessage.warning('该变量为类实例，编辑后将变为字符串')
  }
  editingKey.value = row.key
  editKey.value = row.key
  editValue.value = String(item.v ?? '')
}

function cancelEdit() {
  editingKey.value = null
  editKey.value = ''
  editValue.value = ''
}

function startAdd() {
  cancelEdit()
  adding.value = true
  newKey.value = ''
  newValue.value = ''
}

function cancelAdd() {
  adding.value = false
  newKey.value = ''
  newValue.value = ''
}

async function fetchVars({ reset = false, silent = false } = {}) {
  if (reset) {
    if (!silent) loading.value = true
  } else {
    if (loadingMore.value) return
    loadingMore.value = true
  }
  loadFailed.value = false
  const skip = reset ? 0 : list.value.length
  try {
    const data = await apiPost({ type: 'get_thread_vars', data: { limit: PAGE_SIZE, skip } })
    const items = data.list || []
    if (reset) {
      list.value = items
    } else {
      list.value = list.value.concat(items)
    }
    total.value = data.total ?? list.value.length
    hasMore.value = !!data.hasMore
    lastUpdate.value = new Date().toLocaleString()
  } catch (e) {
    console.error('获取线程变量失败:', e)
    loadFailed.value = true
    if (!silent) ElMessage.error('获取线程变量失败')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadList({ silent = false } = {}) {
  return fetchVars({ reset: true, silent })
}

function loadMore() {
  return fetchVars({ reset: false, silent: true })
}

// 静默刷新已加载区间（供定时器使用），只重取当前已加载条数，避免每次都全量拉取
async function refreshLoaded() {
  if (loadingMore.value) return
  try {
    const limit = Math.max(PAGE_SIZE, list.value.length)
    const data = await apiPost({ type: 'get_thread_vars', data: { limit, skip: 0 } })
    list.value = data.list || []
    total.value = data.total ?? list.value.length
    hasMore.value = !!data.hasMore
    lastUpdate.value = new Date().toLocaleString()
  } catch (e) {
    // 静默刷新失败不打断
  }
}

function onScroll() {
  const el = scrollBoxRef.value
  if (!el || !hasMore.value || loadingMore.value) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
    loadMore()
  }
}

async function saveAdd() {
  const key = newKey.value.trim()
  if (!isValidKey(key)) return
  if (list.value.some(item => item.key === key)) {
    ElMessage.error('该键已存在')
    return
  }

  try {
    await apiPost({ type: 'set_thread_var', data: { key, value: newValue.value } })
    cancelAdd()
    ElMessage.success('已添加')
    await loadList()
  } catch (e) {
    console.error('添加线程变量失败:', e)
    ElMessage.error('添加失败: ' + (e.message || '未知错误'))
  }
}

async function saveEdit() {
  const key = editKey.value.trim()
  const oldKey = editingKey.value
  if (!isValidKey(key)) return
  if (key !== oldKey && list.value.some(item => item.key === key)) {
    ElMessage.error('该键已存在')
    return
  }

  try {
    await apiPost({ type: 'set_thread_var', data: { key, value: editValue.value } })
    if (key !== oldKey) {
      await apiPost({ type: 'del_thread_var', data: { key: oldKey } })
    }
    cancelEdit()
    ElMessage.success('已保存')
    await loadList()
  } catch (e) {
    console.error('保存线程变量失败:', e)
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  }
}

async function deleteRow(row) {
  try {
    await ElMessageBox.confirm(`确定删除线程变量「${row.key}」吗？`, '删除线程变量', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch (e) {
    return
  }

  try {
    await apiPost({ type: 'del_thread_var', data: { key: row.key } })
    if (editingKey.value === row.key) cancelEdit()
    ElMessage.success('已删除')
    await loadList()
  } catch (e) {
    console.error('删除线程变量失败:', e)
    ElMessage.error('删除失败: ' + (e.message || '未知错误'))
  }
}

async function clearThreadVars() {
  try {
    await ElMessageBox.confirm('确定清空全部线程变量吗？', '清空线程变量', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch (e) {
    return
  }

  try {
    await apiPost({ type: 'dic_thread_vars_clear' })
    cancelEdit()
    ElMessage.success('线程变量已清空')
    await loadList()
  } catch (e) {
    console.error('清空线程变量失败:', e)
    ElMessage.error('清空线程变量失败')
  }
}

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    refreshLoaded()
  }, 2000)
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(() => {
  loadList()
  startTimer()
})

onBeforeUnmount(() => {
  stopTimer()
})
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <ElButton size="small" type="primary" @click="startAdd">添加</ElButton>
      <ElButton
        size="small"
        type="danger"
        :disabled="!list.length"
        @click="clearThreadVars"
      >回收清空</ElButton>
      <div class="toolbar-right">
        <span v-if="lastUpdate" class="update-time">更新于 {{ lastUpdate }}</span>
        <ElButton size="small" @click="loadList()">刷新</ElButton>
      </div>
    </div>

    <div v-if="adding" class="add-form">
      <ElInput v-model="newKey" placeholder="键" size="small" class="add-input" />
      <ElInput v-model="newValue" placeholder="值" size="small" class="add-input" />
      <ElButton size="small" type="primary" @click="saveAdd">保存</ElButton>
      <ElButton size="small" @click="cancelAdd">取消</ElButton>
    </div>

    <ElEmpty
      v-if="!loadFailed && list.length === 0"
      description="暂无线程变量"
    />
    <div
      v-else
      ref="scrollBoxRef"
      class="table-scroll"
      @scroll="onScroll"
    >
      <ElTable
          :data="rows"
          :size="isMobile ? 'small' : 'default'"
          empty-text="暂无线程变量"
        >
          <ElTableColumn label="键" min-width="180">
            <template #default="{ row }">
              <ElInput
                v-if="row.top && editingKey === row.key"
                v-model="editKey"
                size="small"
              />
              <div
                v-else
                class="key-cell"
                :style="{ paddingLeft: row.depth * 14 + 'px' }"
              >
                <span
                  v-if="row.hasChildren"
                  class="var-arrow"
                  @click="toggleClass(row.id)"
                >{{ row.collapsed ? '▶' : '▼' }}</span>
                <ElTag v-if="row.item.t" size="small" type="info">{{ row.item.t }}</ElTag>
                <span
                  v-if="row.top"
                  class="cell-click"
                  title="点击编辑"
                  @click="startEdit(row)"
                >{{ row.key }}</span>
                <span v-else class="var-key">{{ row.key }}</span>
              </div>
            </template>
          </ElTableColumn>

          <ElTableColumn label="值" min-width="260">
            <template #default="{ row }">
              <ElInput
                v-if="row.top && editingKey === row.key"
                v-model="editValue"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 6 }"
                size="small"
              />
              <div v-else class="val-cell">
                <span
                  class="val-text"
                  :class="{ 'cell-click': row.top }"
                  :title="row.top ? '点击编辑' : ''"
                  @click="row.top && startEdit(row)"
                >{{ displayVal(row.item, row.id) }}</span>
                <ElButton
                  v-if="isLong(row.item)"
                  link
                  type="primary"
                  size="small"
                  @click.stop="toggleExpand(row.item, row.id)"
                >
                  {{ expanded[row.id] ? '收起' : '展开' }}
                </ElButton>
              </div>
            </template>
          </ElTableColumn>

          <ElTableColumn label="操作" :width="isMobile ? 130 : 160">
            <template #default="{ row }">
              <template v-if="row.top">
                <template v-if="editingKey === row.key">
                  <ElButton size="small" type="primary" @click="saveEdit">保存</ElButton>
                  <ElButton size="small" @click="cancelEdit">取消</ElButton>
                </template>
                <ElButton
                  v-else
                  size="small"
                  type="danger"
                  link
                  @click="deleteRow(row)"
                >删除</ElButton>
              </template>
            </template>
          </ElTableColumn>
        </ElTable>

        <div v-if="hasMore" class="load-more">
          <ElButton
            size="small"
            :loading="loadingMore"
            @click="loadMore"
          >加载更多</ElButton>
          <span class="load-more-count">已加载 {{ list.length }} / {{ total }}</span>
        </div>
      </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.3px;
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.update-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.add-form {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
}

.add-input {
  flex: 1;
  min-width: 0;
}

.cell-click {
  cursor: pointer;
  display: inline-block;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.2s;
}

.cell-click:hover {
  border-bottom-color: var(--el-color-primary);
}

.key-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.var-arrow {
  cursor: pointer;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  user-select: none;
  font-size: 12px;
}

.var-key {
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.val-cell {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.val-text {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-regular);
  word-break: break-all;
  white-space: pre-wrap;
}

.table-scroll {
  max-height: 65vh;
  overflow-y: auto;
}

.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 0 4px;
}

.load-more-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .page-title {
    font-size: 18px;
  }

  .toolbar {
    flex-wrap: wrap;
    gap: 8px;
  }

  .add-form {
    flex-wrap: wrap;
  }

  .add-input {
    flex: 1 1 100%;
  }
}

@media (max-width: 480px) {
  .page-header {
    margin-bottom: 16px;
  }

  .page-title {
    font-size: 16px;
  }

  .page-subtitle {
    font-size: 12px;
  }
}
</style>
