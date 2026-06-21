<script setup>
import { ref, onMounted } from 'vue'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 表单数据 ================= */
const form = ref({
  websocket: '', // WebSocket 监听地址
  cors: false, // 跨域开关
  open: false, // Open 开关
})

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)

/* ================= 初始化加载 ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const data = await apiPost({
        type: 'get_websocket',
      })

    form.value.websocket = data.websocket || ''
    form.value.cors = Boolean(data.cors)
    form.value.open = Boolean(data.open)
  } catch (e) {
    console.error('获取 WebSocket 配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取 WebSocket 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存配置 ================= */
async function saveConfig() {
  if (loadFailed.value) return

  saving.value = true
  try {
    await apiPost({
        type: 'save_websocket',
        data: {
          websocket: form.value.websocket,
          cors: form.value.cors,
          open: form.value.open,
        },
      })

    ElMessage.success('配置已保存')
  } catch (e) {
    console.error('保存 WebSocket 配置失败:', e)
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">WebSocket 配置</h2>
      <p class="page-subtitle">配置 WebSocket 连接参数</p>
    </div>

    <div class="panel-card">
      <ElForm :model="form" v-loading="loading" :label-position="isMobile ? 'top' : 'right'">
        <ElFormItem label="开关">
          <ElSwitch
            v-model="form.open"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
          />
        </ElFormItem>

        <ElFormItem label="跨域">
          <ElSwitch
            v-model="form.cors"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
          />
        </ElFormItem>

        <ElFormItem label="访问路径">
          <ElInput v-model="form.websocket" placeholder="ws" :disabled="loadFailed" />
        </ElFormItem>

        <!-- 操作区 -->
        <ElFormItem>
          <div class="form-actions">
            <ElButton type="primary" :loading="saving" :disabled="loadFailed" @click="saveConfig">
              保存配置
            </ElButton>
          </div>
        </ElFormItem>
      </ElForm>
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

.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .panel-card {
    padding: 20px 16px;
  }

  .page-title {
    font-size: 18px;
  }

  .form-actions :deep(.el-button) {
    width: 100%;
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
