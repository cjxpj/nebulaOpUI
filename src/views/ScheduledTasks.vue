<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Plus, Delete, Refresh, FolderOpened, ArrowLeft, Document } from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

const taskLoading = ref(false)
const taskList = ref([])
const taskLastUpdate = ref('')

// 添加表单
const taskAdding = ref(false)
const taskForm = ref({
  dic_path: '',
  trigger: '',
  interval: '',
  once: false,
  run_at_start: false,
})

// 词库路径选择弹窗
const browserVisible = ref(false)
const browserDir = ref('')
const browserEntries = ref([])
const browserLoading = ref(false)

let taskTimer = null

const TASK_PAGE_SIZE = 50
const taskTotal = ref(0)
const taskHasMore = ref(false)
const taskLoadingMore = ref(false)
const taskScrollRef = ref(null)

async function fetchTasks({ reset = false, silent = false } = {}) {
  if (reset) {
    if (!silent) taskLoading.value = true
  } else {
    if (taskLoadingMore.value) return
    taskLoadingMore.value = true
  }
  const skip = reset ? 0 : taskList.value.length
  try {
    const data = await apiPost({ type: 'get_dic_tasks', data: { limit: TASK_PAGE_SIZE, skip } })
    const items = data.list || []
    if (reset) {
      taskList.value = items
    } else {
      taskList.value = taskList.value.concat(items)
    }
    taskTotal.value = data.total ?? taskList.value.length
    taskHasMore.value = !!data.hasMore
    taskLastUpdate.value = new Date().toLocaleString()
  } catch (e) {
    console.error('获取定时任务失败:', e)
    if (!silent) ElMessage.error('获取定时任务失败')
  } finally {
    taskLoading.value = false
    taskLoadingMore.value = false
  }
}

function loadTaskList({ silent = false } = {}) {
  return fetchTasks({ reset: true, silent })
}

function loadMoreTasks() {
  return fetchTasks({ reset: false, silent: true })
}

// 静默刷新已加载区间（供定时器使用），只重取当前已加载条数，避免每次都全量拉取
async function refreshLoadedTasks() {
  if (taskLoadingMore.value) return
  try {
    const limit = Math.max(TASK_PAGE_SIZE, taskList.value.length)
    const data = await apiPost({ type: 'get_dic_tasks', data: { limit, skip: 0 } })
    taskList.value = data.list || []
    taskTotal.value = data.total ?? taskList.value.length
    taskHasMore.value = !!data.hasMore
    taskLastUpdate.value = new Date().toLocaleString()
  } catch (e) {
    // 静默刷新失败不打断
  }
}

function onTaskScroll() {
  const el = taskScrollRef.value
  if (!el || !taskHasMore.value || taskLoadingMore.value) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
    loadMoreTasks()
  }
}

async function startTaskAdd() {
  taskAdding.value = true
  taskForm.value = { dic_path: '', trigger: '', interval: '', once: false, run_at_start: false }
  // 预填默认词库（system.ini [词库调试] 默认词库）
  try {
    const cfg = await apiPost({ type: 'get_dic_config' })
    if (cfg && cfg.path) taskForm.value.dic_path = cfg.path
  } catch (e) {
    // 获取默认词库失败则保持空
  }
}

function cancelTaskAdd() {
  taskAdding.value = false
  taskForm.value = { dic_path: '', trigger: '', interval: '', once: false, run_at_start: false }
}

async function saveTaskAdd() {
  const dicPath = taskForm.value.dic_path.trim()
  if (!dicPath) {
    ElMessage.error('请选择执行词库')
    return
  }
  const interval = taskForm.value.interval.trim()
  if (!interval) {
    ElMessage.error('请填写执行间隔')
    return
  }
  try {
    const data = await apiPost({
      type: 'add_dic_task',
      data: {
        dic_path: dicPath,
        trigger: taskForm.value.trigger.trim() || 'Main',
        interval,
        once: !!taskForm.value.once,
        run_at_start: !!taskForm.value.run_at_start,
      },
    })
    cancelTaskAdd()
    ElMessage.success(`已添加，编号：${data.id}`)
    await loadTaskList()
  } catch (e) {
    console.error('添加定时任务失败:', e)
    ElMessage.error('添加失败: ' + (e.message || '未知错误'))
  }
}

async function deleteTaskRow(row) {
  try {
    await ElMessageBox.confirm(`确定删除定时任务「${row.id}」吗？`, '删除定时任务', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch (e) {
    return
  }
  try {
    await apiPost({ type: 'del_dic_task', data: { id: row.id } })
    ElMessage.success('已删除')
    await loadTaskList()
  } catch (e) {
    console.error('删除定时任务失败:', e)
    ElMessage.error('删除失败: ' + (e.message || '未知错误'))
  }
}

/* ================= 词库路径选择 ================= */
function parentDir(path) {
  const p = (path || '').replace(/\/+$/, '')
  const i = p.lastIndexOf('/')
  return i <= 0 ? '' : p.slice(0, i)
}

async function loadDicDir(path) {
  browserLoading.value = true
  try {
    const data = await apiPost({ type: 'get_dic_list', data: { path: path || '' } })
    browserDir.value = path || ''
    browserEntries.value = data.entries || []
  } catch (e) {
    console.error('读取目录失败:', e)
    ElMessage.error('读取目录失败')
  } finally {
    browserLoading.value = false
  }
}

function openBrowser() {
  browserVisible.value = true
  loadDicDir('private')
}

function onEntryClick(entry) {
  if (entry.dir) {
    loadDicDir(entry.path)
  } else {
    taskForm.value.dic_path = entry.path
    browserVisible.value = false
  }
}

function goUp() {
  loadDicDir(parentDir(browserDir.value))
}

function startTaskTimer() {
  stopTaskTimer()
  taskTimer = setInterval(() => {
    refreshLoadedTasks()
  }, 3000)
}

function stopTaskTimer() {
  if (taskTimer) {
    clearInterval(taskTimer)
    taskTimer = null
  }
}

onMounted(() => {
  loadTaskList()
  startTaskTimer()
})

onBeforeUnmount(() => {
  stopTaskTimer()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-right">
        <span v-if="taskLastUpdate" class="update-time">更新于 {{ taskLastUpdate }}</span>
        <ElButton size="small" :icon="Refresh" @click="loadTaskList()">刷新</ElButton>
        <ElButton size="small" type="primary" :icon="Plus" @click="startTaskAdd">添加任务</ElButton>
      </div>
    </div>

    <ElDialog
      v-model="taskAdding"
      title="添加定时任务"
      width="520px"
      :append-to-body="true"
    >
      <div class="task-add-form">
        <div class="task-add-row">
          <span class="task-add-label">执行词库</span>
          <ElInput
            v-model="taskForm.dic_path"
            placeholder="选择 .n 词库文件"
            size="small"
            class="task-add-dic"
            readonly
          />
          <ElButton size="small" :icon="FolderOpened" @click="openBrowser">浏览</ElButton>
        </div>
        <div class="task-add-row">
          <span class="task-add-label">触发词</span>
          <ElInput v-model="taskForm.trigger" placeholder="触发词，默认 Main" size="small" class="task-add-input" />
        </div>
        <div class="task-add-row">
          <span class="task-add-label">执行间隔</span>
          <ElInput
            v-model="taskForm.interval"
            placeholder="如 5000（毫秒）/ s / m / h / d / 整点 / 整分"
            size="small"
            class="task-add-input"
          />
        </div>
        <div class="task-add-row">
          <span class="task-add-label">执行方式</span>
          <div class="task-add-once">
            <ElSwitch v-model="taskForm.once" size="small" />
            <span class="task-once-text">{{ taskForm.once ? '一次性（执行一次后自动删除）' : '循环（默认）' }}</span>
          </div>
        </div>
        <div class="task-add-row">
          <span class="task-add-label">启动触发</span>
          <div class="task-add-once">
            <ElSwitch v-model="taskForm.run_at_start" size="small" />
            <span class="task-once-text">{{ taskForm.run_at_start ? '启动立即触发一次' : '不触发（默认）' }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <ElButton size="small" type="primary" @click="saveTaskAdd">创建</ElButton>
      </template>
    </ElDialog>

    <div v-loading="taskLoading">
      <ElEmpty v-if="taskList.length === 0" description="暂无定时任务" />
      <div v-else class="panel-card">
        <div
          ref="taskScrollRef"
          class="table-scroll"
          @scroll="onTaskScroll"
        >
          <ElTable
            :data="taskList"
            :size="isMobile ? 'small' : 'default'"
            empty-text="暂无定时任务"
          >
            <ElTableColumn label="编号" min-width="170">
              <template #default="{ row }">
                <span class="mono">{{ row.id }}</span>
              </template>
            </ElTableColumn>
            <ElTableColumn label="执行词库" min-width="200">
              <template #default="{ row }">{{ row.dic_path }}</template>
            </ElTableColumn>
            <ElTableColumn label="触发词" min-width="140">
              <template #default="{ row }">{{ row.trigger }}</template>
            </ElTableColumn>
            <ElTableColumn label="执行间隔" min-width="120">
              <template #default="{ row }">{{ row.interval }}</template>
            </ElTableColumn>
            <ElTableColumn label="类型" width="90">
              <template #default="{ row }">
                <ElTag :type="row.once ? 'warning' : 'success'" size="small">{{ row.once ? '一次性' : '循环' }}</ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="启动触发" width="90">
              <template #default="{ row }">
                <ElTag :type="row.run_at_start ? 'primary' : 'info'" size="small">{{ row.run_at_start ? '开启' : '关闭' }}</ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="操作" :width="isMobile ? 80 : 100">
              <template #default="{ row }">
                <ElButton size="small" type="danger" link :icon="Delete" @click="deleteTaskRow(row)">删除</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>

          <div v-if="taskHasMore" class="load-more">
            <ElButton
              size="small"
              :loading="taskLoadingMore"
              @click="loadMoreTasks"
            >加载更多</ElButton>
            <span class="load-more-count">已加载 {{ taskList.length }} / {{ taskTotal }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 词库路径选择弹窗 -->
    <ElDialog
      v-model="browserVisible"
      title="选择执行词库"
      width="560px"
      :append-to-body="true"
    >
      <div class="browser-toolbar">
        <ElButton size="small" :icon="ArrowLeft" :disabled="!browserDir" @click="goUp">上级</ElButton>
        <span class="browser-path">{{ browserDir || '/' }}</span>
      </div>
      <div class="browser-list" v-loading="browserLoading">
        <ElEmpty v-if="browserEntries.length === 0" description="该目录为空" />
        <div
          v-for="entry in browserEntries"
          :key="entry.path"
          class="browser-item"
          :class="{ 'is-dir': entry.dir }"
          @click="onEntryClick(entry)"
        >
          <ElIcon><FolderOpened v-if="entry.dir" /><Document v-else /></ElIcon>
          <span>{{ entry.name }}</span>
        </div>
      </div>
    </ElDialog>
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

.mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  word-break: break-all;
}

.task-add-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-add-label {
  flex-shrink: 0;
  width: 64px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.task-add-input {
  flex: 1;
  min-width: 0;
}

.task-add-dic {
  flex: 1;
  min-width: 0;
}

.task-add-once {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-once-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.browser-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.browser-path {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.browser-list {
  max-height: 360px;
  overflow-y: auto;
}

.browser-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.browser-item:hover {
  background: var(--el-fill-color-light);
}

.browser-item.is-dir {
  color: var(--el-color-primary);
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

  .task-add-row {
    flex-wrap: wrap;
  }

  .task-add-label {
    width: 56px;
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
