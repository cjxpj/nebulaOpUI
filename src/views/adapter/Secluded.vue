<script setup>
import { ref, onMounted } from 'vue'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

const form = ref({
  open: false,
  dic: 'private/bot/secluded',
  address: '',
  token: '',
  debug: false,
})

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)

async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const data = await apiPost({ type: 'get_secluded' })

    form.value.open = Boolean(data.open)
    form.value.dic = data.dic || 'private/bot/secluded'
    form.value.address = data.address || ''
    form.value.token = data.token || ''
    form.value.debug = Boolean(data.debug)
  } catch (e) {
    console.error('获取 Secluded 配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取 Secluded 配置失败')
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  if (loadFailed.value) return

  saving.value = true
  try {
    await apiPost({
        type: 'save_secluded',
        data: form.value,
      })
    ElMessage.success('配置已保存')
  } catch (e) {
    console.error('保存 Secluded 配置失败:', e)
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
      <h2 class="page-title">Secluded</h2>
      <p class="page-subtitle">配置 Secluded 对接参数</p>
    </div>

    <div class="panel-card">
      <ElForm :model="form" v-loading="loading" label-width="90px" :label-position="isMobile ? 'top' : 'right'">
        <ElFormItem label="启用">
          <ElSwitch
            v-model="form.open"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
          />
        </ElFormItem>

        <ElFormItem label="词库">
          <ElInput v-model="form.dic" :disabled="loadFailed" />
        </ElFormItem>

        <ElFormItem label="对接地址">
          <ElInput v-model="form.address" placeholder="127.0.0.1:8080" :disabled="loadFailed" />
        </ElFormItem>

        <ElFormItem label="令牌">
          <ElInput v-model="form.token" show-password :disabled="loadFailed" />
        </ElFormItem>

        <ElFormItem label="调试打印">
          <ElSwitch
            v-model="form.debug"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
          />
        </ElFormItem>

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
