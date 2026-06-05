<script setup>
import { ref, onMounted } from 'vue'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'

/* ================= 表单数据 ================= */
const form = ref({
  server: '',
  cors: false,
  cors_origins: '',
  temp_cleanup_interval: 60,
})

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)

/* ================= 初始化加载 ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const res = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'get_server',
      }),
    })

    if (!res.ok) {
      throw new Error('request failed')
    }

    const data = await res.json()

    form.value.server = data.server || ''
    form.value.cors = Boolean(data.cors)
    form.value.cors_origins = data.cors_origins || ''
    form.value.temp_cleanup_interval = data.temp_cleanup_interval ?? 60
  } catch {
    loadFailed.value = true
    ElMessage.error('获取 Server 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存配置 ================= */
async function saveConfig() {
  if (loadFailed.value) return

  saving.value = true
  try {
    await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'save_server',
        data: {
          server: form.value.server,
          cors: form.value.cors,
          cors_origins: form.value.cors_origins,
          temp_cleanup_interval: Number(form.value.temp_cleanup_interval),
        },
      }),
    })

    ElMessage.success('配置已保存')
  } catch {
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
      <h2 class="page-title">Server 配置</h2>
      <p class="page-subtitle">配置服务器监听地址、跨域等基础参数</p>
    </div>

    <div class="panel-card">
      <ElForm :model="form" v-loading="loading">
        <ElFormItem label="监听地址">
          <ElInput v-model="form.server" placeholder="0.0.0.0:8080" :disabled="loadFailed" />
        </ElFormItem>

        <ElFormItem label="跨域开关">
          <ElSwitch
            v-model="form.cors"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
          />
        </ElFormItem>

        <ElFormItem label="跨域白名单">
          <ElInput
            v-model="form.cors_origins"
            placeholder="* 或 http://example.com,http://localhost:3000"
            :disabled="loadFailed"
          />
        </ElFormItem>

        <ElFormItem label="临时读写清理周期">
          <ElInput v-model="form.temp_cleanup_interval" placeholder="60" :disabled="loadFailed">
            <template #suffix>秒</template>
          </ElInput>
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
  max-width: 720px;
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
}
</style>
