<script setup>
import { ref, onMounted } from 'vue'
import { ElCard, ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'

/* ================= 表单数据 ================= */
const form = ref({
  open: false,
  dic: 'private/bot/qq',
  path: 'qq-bot',
  appid: '',
  secret: '',
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'get_qq' }),
    })

    if (!res.ok) throw new Error()

    const data = await res.json()
    form.value.open = Boolean(data.open)
    form.value.dic = data.dic || 'private/bot/qq'
    form.value.path = data.path || 'qq-bot'
    form.value.appid = data.appid || ''
    form.value.secret = data.secret || ''
  } catch {
    loadFailed.value = true
    ElMessage.error('获取 QQ 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存配置 ================= */
async function saveConfig() {
  if (loadFailed.value) return
  if (!form.value.path) return ElMessage.error('访问路径不能为空')
  if (!form.value.appid) return ElMessage.error('APPID 不能为空')

  saving.value = true
  try {
    await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'save_qq',
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
    <ElForm :model="form" v-loading="loading" label-width="90px">
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
  </ElCard>
</template>

<style scoped>
.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}
</style>
