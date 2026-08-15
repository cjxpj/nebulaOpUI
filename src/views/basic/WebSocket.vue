<script setup>
import { ref, onMounted } from 'vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

const loading = ref(false)
const loadFailed = ref(false)
const list = ref([])

async function loadList() {
  loading.value = true
  loadFailed.value = false
  try {
    const data = await apiPost({ type: 'get_websocket' })
    list.value = data.list || []
  } catch (e) {
    console.error('获取 WebSocket 监听列表失败:', e)
    loadFailed.value = true
    ElMessage.error('获取 WebSocket 监听列表失败')
  } finally {
    loading.value = false
  }
}

async function closeWs(row) {
  try {
    await ElMessageBox.confirm(`确定关闭 ${row.addr} 吗？`, '关闭 WebSocket', {
      confirmButtonText: '关闭',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch (e) {
    return
  }

  try {
    await apiPost({ type: 'close_websocket', data: { addr: row.addr } })
    ElMessage.success('已关闭')
    await loadList()
  } catch (e) {
    console.error('关闭 WebSocket 失败:', e)
    ElMessage.error('关闭 WebSocket 失败')
  }
}

onMounted(loadList)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">WebSocket 监听</h2>
      <p class="page-subtitle">当前正在监听的 WebSocket 列表</p>
    </div>

    <div class="panel-card" v-loading="loading">
      <ElEmpty
        v-if="!loadFailed && list.length === 0"
        description="暂无正在监听的 WebSocket"
      />
      <ElTable
        v-else
        :data="list"
        :size="isMobile ? 'small' : 'default'"
        empty-text="暂无正在监听的 WebSocket"
      >
        <ElTableColumn prop="addr" label="访问路径" min-width="160" />
        <ElTableColumn label="跨域" :width="isMobile ? 80 : 120">
          <template #default="{ row }">
            <ElTag :type="row.cors ? 'success' : 'info'" size="small">
              {{ row.cors ? '开启' : '关闭' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" :width="isMobile ? 80 : 120">
          <template #default="{ row }">
            <ElTag :type="row.open ? 'success' : 'info'" size="small">
              {{ row.open ? '监听中' : '已停止' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" :width="isMobile ? 90 : 130" align="center">
          <template #default="{ row }">
            <ElButton v-if="row.closable" type="danger" size="small" link @click="closeWs(row)">
              关闭
            </ElButton>
            <span v-else class="muted">-</span>
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

.muted {
  color: var(--el-text-color-disabled);
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

@media (max-width: 768px) {
  .panel-card {
    padding: 20px 16px;
  }

  .page-title {
    font-size: 18px;
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
