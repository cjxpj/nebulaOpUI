<script setup>
import { ref, onMounted } from 'vue'
import { ElCard, ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'

/* ================= 表单数据 ================= */
const form = ref({
  open: false, // Ngrok 开关
  token: '', // Ngrok 密钥
  domain: '', // 绑定域名（必填）
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
        type: 'get_ngrok',
      }),
    })

    if (!res.ok) {
      throw new Error('request failed')
    }

    const data = await res.json()

    form.value.open = Boolean(data.open)
    form.value.token = data.token || ''
    form.value.domain = data.domain || ''
  } catch {
    loadFailed.value = true
    ElMessage.error('获取 Ngrok 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存配置 ================= */
async function saveConfig() {
  if (loadFailed.value) return

  if (!form.value.domain) {
    ElMessage.error('绑定域名不能为空')
    return
  }

  saving.value = true
  try {
    await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'save_ngrok',
        data: {
          open: form.value.open,
          token: form.value.token,
          domain: form.value.domain,
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
      <ElFormItem label="启用 Ngrok">
        <ElSwitch
          v-model="form.open"
          :disabled="loadFailed"
          active-text="开启"
          inactive-text="关闭"
        />
      </ElFormItem>

      <ElFormItem label="Ngrok 密钥">
        <ElInput
          v-model="form.token"
          placeholder="ngrok authtoken"
          show-password
          :disabled="loadFailed"
        />
      </ElFormItem>

      <ElFormItem label="绑定域名">
        <ElInput v-model="form.domain" placeholder="example.ngrok.app" :disabled="loadFailed" />
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
