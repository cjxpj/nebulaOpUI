<script setup>
import { ref, onMounted } from 'vue'
import { ElCard, ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'

/* ================= 表单数据 ================= */
const form = ref({
  open: false, // 启用
  dic: 'private/bot/yunhu/dic.n', // 词库
  path: 'yunhu-bot', // 访问路径
  secret: '', // 密钥
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
      body: JSON.stringify({ type: 'get_yunhu' }),
    })

    if (!res.ok) throw new Error()

    const data = await res.json()

    form.value.open = Boolean(data.open)
    form.value.dic = data.dic || 'private/bot/yunhu/dic.n'
    form.value.path = data.path || 'yunhu-bot'
    form.value.secret = data.secret || ''
  } catch {
    loadFailed.value = true
    ElMessage.error('获取 YunHu 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存配置 ================= */
async function saveConfig() {
  if (loadFailed.value) return

  if (!form.value.path) {
    ElMessage.error('访问路径不能为空')
    return
  }

  if (!form.value.dic) {
    ElMessage.error('词库路径不能为空')
    return
  }

  saving.value = true
  try {
    await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'save_yunhu',
        data: {
          open: form.value.open,
          dic: form.value.dic,
          path: form.value.path,
          secret: form.value.secret,
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
        <ElInput v-model="form.dic" placeholder="private/bot/yunhu/dic.n" :disabled="loadFailed" />
      </ElFormItem>

      <ElFormItem label="访问路径">
        <ElInput v-model="form.path" placeholder="yunhu-bot" :disabled="loadFailed" />
      </ElFormItem>

      <ElFormItem label="密钥">
        <ElInput v-model="form.secret" placeholder="xxx" show-password :disabled="loadFailed" />
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
