<script setup>
import { ref, onMounted } from 'vue'
import { ElCard, ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'

const form = ref({
  open: false,
  dic: 'private/bot/napcat',
  path: 'napcat',
  api: 'http://127.0.0.1:3000',
  secret: '',
})

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)

async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const res = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'get_napcat' }),
    })

    if (!res.ok) throw new Error()

    const data = await res.json()
    form.value.open = Boolean(data.open)
    form.value.dic = data.dic || 'private/bot/napcat'
    form.value.path = data.path || 'napcat'
    form.value.api = data.api || 'http://127.0.0.1:3000'
    form.value.secret = data.secret || ''
  } catch {
    loadFailed.value = true
    ElMessage.error('获取 NapCat 配置失败')
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  if (loadFailed.value) return
  if (!form.value.api) return ElMessage.error('发送消息接口不能为空')

  saving.value = true
  try {
    await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'save_napcat',
        data: form.value,
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
    <ElForm :model="form" v-loading="loading" label-width="110px">
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

      <ElFormItem label="访问路径">
        <ElInput v-model="form.path" :disabled="loadFailed" />
      </ElFormItem>

      <ElFormItem label="发送消息接口">
        <ElInput v-model="form.api" :disabled="loadFailed" />
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
  </ElCard>
</template>

<style scoped>
.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}
</style>
