<script setup>
import { ref, onMounted } from 'vue'
import { ElCard, ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'

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
    const res = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'get_websocket',
      }),
    })

    if (!res.ok) {
      throw new Error('request failed')
    }

    const data = await res.json()

    form.value.websocket = data.websocket || ''
    form.value.cors = Boolean(data.cors)
    form.value.open = Boolean(data.open)
  } catch {
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
    await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'save_websocket',
        data: {
          websocket: form.value.websocket,
          cors: form.value.cors,
          open: form.value.open,
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
  </ElCard>
</template>

<style scoped>
.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}
</style>
