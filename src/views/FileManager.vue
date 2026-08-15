<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { Refresh, Search, FolderOpened, Folder, Document, EditPen, Cpu, ArrowLeft } from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

// HomeView 注入的页面跳转函数：跳转到词库调试并携带指定词库路径
const navigateTo = inject('navigateTo', null)

/* ================= 目录浏览 ================= */
// 当前目录（相对应用目录，空表示根目录）
const currentDir = ref('')
// 应用数据目录的真实名称（后端返回），用作面包屑根节点显示
const rootName = ref('')
const entries = ref([])
const loading = ref(false)
const keyword = ref('')

async function loadEntries() {
  loading.value = true
  try {
    const data = await apiPost({ type: 'file_list', data: { path: currentDir.value } })
    entries.value = data?.entries || []
    if (data?.root) rootName.value = data.root
  } catch (e) {
    console.error('加载文件列表失败:', e)
    ElMessage.error('加载文件列表失败: ' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 进入文件夹
function enterDir(entry) {
  currentDir.value = entry.path
  loadEntries()
}

// 面包屑导航（根节点显示应用数据目录真实名称）
const breadcrumbs = computed(() => {
  const crumbs = [{ name: rootName.value || '文件管理', path: '' }]
  const parts = currentDir.value.split('/').filter(Boolean)
  let acc = ''
  for (const p of parts) {
    acc = acc ? acc + '/' + p : p
    crumbs.push({ name: p, path: acc })
  }
  return crumbs
})

function goTo(path) {
  if (path === currentDir.value) return
  currentDir.value = path
  loadEntries()
}

// 返回上级目录
function goUp() {
  const idx = currentDir.value.lastIndexOf('/')
  goTo(idx > 0 ? currentDir.value.slice(0, idx) : '')
}

// 当前目录下按名称过滤
const visibleEntries = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return entries.value
  return entries.value.filter((e) => e.name.toLowerCase().includes(kw))
})

/* ================= 文件操作 ================= */
function isDicFile(path) {
  return path.toLowerCase().endsWith('.n')
}

// 文件夹进入浏览；词库文件跳转词库调试；其他文件弹窗临时查看/编辑
function onEntryClick(entry) {
  if (entry.dir) {
    enterDir(entry)
    return
  }
  if (isDicFile(entry.path)) {
    openInDicDebug(entry.path)
    return
  }
  openEditDialog(entry.path)
}

function openInDicDebug(path) {
  if (navigateTo) {
    navigateTo('dic-debug', path)
    return
  }
  // 兜底：直接更新 URL 刷新页面
  const url = new URL(location.href)
  url.searchParams.set('page', 'dic-debug')
  url.searchParams.set('path', path)
  location.href = url.href
}

/* ================= 编辑弹窗 ================= */
const editVisible = ref(false)
const editPath = ref('')
const editContent = ref('')
const editLoading = ref(false)
const editSaving = ref(false)
const editBinary = ref(false)

async function openEditDialog(path) {
  editPath.value = path
  editBinary.value = false
  editContent.value = ''
  editVisible.value = true
  editLoading.value = true
  try {
    const data = await apiPost({ type: 'file_read', data: { path } })
    if (data?.binary) {
      editBinary.value = true
    } else {
      editContent.value = data?.content || ''
    }
  } catch (e) {
    console.error('读取文件失败:', e)
    ElMessage.error('读取文件失败: ' + (e.message || '未知错误'))
    editVisible.value = false
  } finally {
    editLoading.value = false
  }
}

async function saveEdit() {
  editSaving.value = true
  try {
    await apiPost({ type: 'file_write', data: { path: editPath.value, content: editContent.value } })
    ElMessage.success('文件已保存')
    editVisible.value = false
    loadEntries()
  } catch (e) {
    console.error('保存文件失败:', e)
    ElMessage.error('保存文件失败: ' + (e.message || '未知错误'))
  } finally {
    editSaving.value = false
  }
}

/* ================= 格式化 ================= */
function formatSize(bytes) {
  if (bytes == null) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function formatTime(sec) {
  if (!sec) return '-'
  const d = new Date(sec * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(loadEntries)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">文件管理</h2>
      <p class="page-subtitle">词库文件（.n）点击后直接在词库调试中打开，其他文件点击可在弹窗中临时查看与编辑</p>
    </div>

    <div class="toolbar">
      <div class="breadcrumb">
        <ElButton
          text
          class="up-btn"
          :disabled="!currentDir"
          :icon="ArrowLeft"
          @click="goUp"
        >上级</ElButton>
        <template v-for="(seg, i) in breadcrumbs" :key="seg.path">
          <span v-if="i > 0" class="crumb-sep">/</span>
          <a
            v-if="i < breadcrumbs.length - 1"
            class="crumb-link"
            @click="goTo(seg.path)"
          >{{ seg.name }}</a>
          <span v-else class="crumb-current">{{ seg.name }}</span>
        </template>
      </div>
      <ElInput
        v-model="keyword"
        placeholder="搜索当前目录"
        clearable
        class="search-input"
        :prefix-icon="Search"
      />
      <ElButton :icon="Refresh" :loading="loading" @click="loadEntries">刷新</ElButton>
    </div>

    <div v-loading="loading" class="file-panel">
      <template v-if="visibleEntries.length">
        <div
          v-for="e in visibleEntries"
          :key="e.path"
          class="file-row"
          @click="onEntryClick(e)"
        >
          <div class="file-icon">
            <ElIcon :size="18" :color="e.dir ? '#e6a23c' : isDicFile(e.path) ? '#409eff' : '#909399'">
              <Folder v-if="e.dir" />
              <Document v-else />
            </ElIcon>
          </div>
          <div class="file-info">
            <div class="file-name">
              {{ e.name }}
              <ElTag v-if="!e.dir && isDicFile(e.path)" size="small" type="primary" class="dic-tag">词库</ElTag>
            </div>
            <div class="file-path">{{ e.path }}</div>
          </div>
          <div class="file-size">{{ e.dir ? '-' : formatSize(e.size) }}</div>
          <div class="file-time">{{ formatTime(e.mtime) }}</div>
          <div class="file-action">
            <ElButton size="small" text :icon="e.dir ? FolderOpened : isDicFile(e.path) ? Cpu : EditPen">
              {{ e.dir ? '打开' : isDicFile(e.path) ? '词库调试' : '编辑' }}
            </ElButton>
          </div>
        </div>
      </template>
      <ElEmpty v-else-if="!loading" :description="keyword ? '未找到匹配的项' : '该目录为空'" />
    </div>

    <!-- 编辑弹窗 -->
    <ElDialog
      v-model="editVisible"
      :title="'编辑文件：' + editPath"
      :width="isMobile ? '94%' : 720"
      destroy-on-close
      top="5vh"
    >
      <div v-if="editLoading" v-loading="true" class="edit-loading"></div>
      <template v-else>
        <ElAlert
          v-if="editBinary"
          type="warning"
          :closable="false"
          show-icon
          title="该文件为二进制文件，不支持在线编辑"
          class="edit-alert"
        />
        <ElInput
          v-else
          v-model="editContent"
          type="textarea"
          :rows="20"
          class="edit-textarea"
          spellcheck="false"
          placeholder="文件内容"
        />
      </template>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :disabled="editBinary" :loading="editSaving" @click="saveEdit">
          保存
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

.page-header {
  margin-bottom: 16px;
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
  flex-wrap: wrap;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  font-size: 14px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.up-btn {
  flex-shrink: 0;
}

.crumb-sep {
  color: var(--el-text-color-placeholder);
  margin: 0 2px;
}

.crumb-link {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: none;
}

.crumb-link:hover {
  text-decoration: underline;
}

.crumb-current {
  color: var(--el-text-color-regular);
  font-weight: 600;
}

.search-input {
  max-width: 240px;
  flex-shrink: 0;
}

.file-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 4px 0;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  border-top: 1px solid var(--el-border-color-lighter);
  transition: background-color 0.2s;
}

.file-row:first-child {
  border-top: none;
}

.file-row:hover {
  background: var(--el-fill-color-light);
}

.file-icon {
  flex-shrink: 0;
  display: flex;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dic-tag {
  flex-shrink: 0;
}

.file-path {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: Consolas, Monaco, 'Courier New', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size,
.file-time {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.file-size {
  width: 80px;
  text-align: right;
}

.file-time {
  width: 130px;
  text-align: right;
}

.file-action {
  flex-shrink: 0;
  width: 88px;
  text-align: right;
}

.edit-loading {
  height: 200px;
}

.edit-alert {
  margin-bottom: 12px;
}

.edit-textarea :deep(.el-textarea__inner) {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

/* 手机端：隐藏次要信息列，只保留名称与操作 */
@media (max-width: 768px) {
  .page-title {
    font-size: 18px;
  }

  .search-input {
    max-width: none;
    flex: 1;
  }

  .file-size,
  .file-time {
    display: none;
  }

  .file-action {
    width: auto;
  }

  .file-row {
    gap: 8px;
    padding: 10px 12px;
  }
}

@media (max-width: 480px) {
  .page-title {
    font-size: 16px;
  }

  .page-subtitle {
    font-size: 12px;
  }

  .page-header {
    margin-bottom: 12px;
  }
}
</style>
