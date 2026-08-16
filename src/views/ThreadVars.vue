<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

const loading = ref(false)
const loadFailed = ref(false)
const list = ref([])
const autoRefresh = ref(true)
const expanded = ref({})

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

function isValidKey(key) {
  const k = (key || '').trim()
  if (!k) {
    ElMessage.error('键不能为空')
    return false
  }
  if (k.startsWith('_')) {
    ElMessage.error('键不能以下划线开头（系统保留）')
    return false
  }
  return true
}

function isLong(row) {
  return String(row.v ?? '').length > VAR_LIMIT
}

function displayVal(row) {
  const s = String(row.v ?? '')
  if (!expanded.value[row.key] && s.length > VAR_LIMIT) {
    return s.slice(0, VAR_LIMIT) + '…'
  }
  return s
}

function toggleExpand(row) {
  expanded.value[row.key] = !expanded.value[row.key]
}

function startEdit(row) {
  editingKey.value = row.key
  editKey.value = row.key
  editValue.value = String(row.v ?? '')
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

async function loadList({ silent = false } = {}) {
  if (!silent) loading.value = true
  loadFailed.value = false
  try {
    const data = await apiPost({ type: 'get_thread_vars' })
    list.value = data.list || []
  } catch (e) {
    console.error('获取线程变量失败:', e)
    loadFailed.value = true
    if (!silent) ElMessage.error('获取线程变量失败')
  } finally {
    if (!silent) loading.value = false
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
    await ElMessageBox.confirm('确定清空全部线程变量吗？（系统内部变量会保留）', '清空线程变量', {
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
    if (autoRefresh.value) loadList({ silent: true })
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

onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">实时线程变量</h2>
      <p class="page-subtitle">点击键或值可编辑，支持添加与指定删除</p>
    </div>

    <div class="toolbar">
      <ElSwitch v-model="autoRefresh" active-text="自动刷新" />
      <ElButton size="small" @click="loadList()">刷新</ElButton>
      <ElButton size="small" type="primary" @click="startAdd">添加</ElButton>
      <ElButton
        size="small"
        type="danger"
        :disabled="!list.length"
        @click="clearThreadVars"
      >回收清空</ElButton>
    </div>

    <div v-if="adding" class="add-form">
      <ElInput v-model="newKey" placeholder="键" size="small" class="add-input" />
      <ElInput v-model="newValue" placeholder="值" size="small" class="add-input" />
      <ElButton size="small" type="primary" @click="saveAdd">保存</ElButton>
      <ElButton size="small" @click="cancelAdd">取消</ElButton>
    </div>

    <div class="panel-card" v-loading="loading">
      <ElEmpty
        v-if="!loadFailed && list.length === 0"
        description="暂无线程变量"
      />
      <ElTable
        v-else
        :data="list"
        :size="isMobile ? 'small' : 'default'"
        empty-text="暂无线程变量"
      >
        <ElTableColumn label="键" min-width="140">
          <template #default="{ row }">
            <ElInput
              v-if="editingKey === row.key"
              v-model="editKey"
              size="small"
            />
            <span
              v-else
              class="cell-click"
              title="点击编辑"
              @click="startEdit(row)"
            >{{ row.key }}</span>
          </template>
        </ElTableColumn>

        <ElTableColumn prop="t" label="类型" :width="isMobile ? 90 : 120" />

        <ElTableColumn label="值" min-width="260">
          <template #default="{ row }">
            <ElInput
              v-if="editingKey === row.key"
              v-model="editValue"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 6 }"
              size="small"
            />
            <div v-else class="val-cell">
              <span
                class="val-text cell-click"
                title="点击编辑"
                @click="startEdit(row)"
              >{{ displayVal(row) }}</span>
              <ElButton
                v-if="isLong(row)"
                link
                type="primary"
                size="small"
                @click.stop="toggleExpand(row)"
              >
                {{ expanded[row.key] ? '收起' : '展开' }}
              </ElButton>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="操作" :width="isMobile ? 130 : 160">
          <template #default="{ row }">
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
        </ElTableColumn>
      </ElTable>
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

.panel-card {
  padding: 28px 32px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  transition: border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
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

@media (max-width: 768px) {
  .panel-card {
    padding: 20px 16px;
  }

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
  .panel-card {
    padding: 16px 12px;
    border-radius: 8px;
  }

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
