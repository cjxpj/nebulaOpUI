<script setup>
import { ref, onMounted } from 'vue'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

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
    const data = await apiPost({
        type: 'get_ngrok',
      })

    form.value.open = Boolean(data.open)
    form.value.token = data.token || ''
    form.value.domain = data.domain || ''
  } catch (e) {
    console.error('获取 Ngrok 配置失败:', e)
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
    await apiPost({
        type: 'save_ngrok',
        data: {
          open: form.value.open,
          token: form.value.token,
          domain: form.value.domain,
        },
      })

    ElMessage.success('配置已保存')
  } catch (e) {
    console.error('保存 Ngrok 配置失败:', e)
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="page">
    <ElForm :model="form" v-loading="loading" :label-position="isMobile ? 'top' : 'right'">
      <ElFormItem label="启用 Ngrok">
        <ElSwitch
          v-model="form.open"
          :disabled="loadFailed"
          inline-prompt
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
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .form-actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
