<script setup>
import { ref, onMounted } from 'vue'
import { ElCard, ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'

/* ================= 表单数据 ================= */
const form = ref({
  server: '',
  cors: false,
  cors_origins: '',
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
  <ElCard shadow="hover">
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
        <ElInput v-model="form.cors_origins" placeholder="* 或 http://example.com,http://localhost:3000" :disabled="loadFailed" />
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
  </ElCard>
</template>

<style scoped>
.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}
</style>
