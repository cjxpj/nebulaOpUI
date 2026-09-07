<script setup>
import { ref, onMounted } from 'vue'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

const form = ref({
  open: false,
  dic: 'private/bot/feishu',
  path: 'feishu-bot',
  appid: '',
  secret: '',
})

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)

async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const data = await apiPost({ type: 'get_feishu' })

    form.value.open = Boolean(data.open)
    form.value.dic = data.dic || 'private/bot/feishu'
    form.value.path = data.path || 'feishu-bot'
    form.value.appid = data.appid || ''
    form.value.secret = data.secret || ''
  } catch (e) {
    console.error('获取 飞书 配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取 飞书 配置失败')
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  if (loadFailed.value) return
  if (!form.value.appid) return ElMessage.error('APPID 不能为空')

  saving.value = true
  try {
    await apiPost({
        type: 'save_feishu',
        data: form.value,
      })
    ElMessage.success('配置已保存')
  } catch (e) {
    console.error('保存 飞书 配置失败:', e)
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="page">
    <ElForm :model="form" v-loading="loading" label-width="90px" :label-position="isMobile ? 'top' : 'right'">
      <ElFormItem label="启用">
        <ElSwitch
          v-model="form.open"
          :disabled="loadFailed"
          inline-prompt
          active-text="开启"
          inactive-text="关闭"
        />
      </ElFormItem>

      <ElFormItem label="词库">
        <ElInput v-model="form.dic" :disabled="loadFailed" />
      </ElFormItem>

      <ElFormItem label="访问路径">
        <ElInput v-model="form.path" :disabled="loadFailed" />
      </ElFormItem>

      <ElFormItem label="APPID">
        <ElInput v-model="form.appid" :disabled="loadFailed" />
      </ElFormItem>

      <ElFormItem label="密钥">
        <ElInput v-model="form.secret" show-password :disabled="loadFailed" />
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
