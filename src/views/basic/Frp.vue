<script setup>
import { ref, watch, onMounted } from 'vue'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 表单数据 ================= */
const form = ref({
  open: false,
  server_addr: '',
  token: '',
  debug: false,
})

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)
const toggling = ref(false)

/* ================= 地址协议自动转换 ================= */
watch(
  () => form.value.server_addr,
  (val) => {
    if (val.startsWith('https://')) {
      form.value.server_addr = val.replace('https://', 'wss://')
    } else if (val.startsWith('http://')) {
      form.value.server_addr = val.replace('http://', 'ws://')
    }
  }
)

/* ================= 初始化加载 ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const data = await apiPost({
        type: 'get_frp',
      })

    form.value.open = Boolean(data.open)
    form.value.server_addr = data.server_addr || ''
    form.value.token = data.token || ''
    form.value.debug = Boolean(data.debug)
  } catch (e) {
    console.error('获取 BeerFrp 配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取 BeerFrp 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 实时开关 ================= */
async function toggleFrp() {
  if (loadFailed.value || toggling.value) return

  toggling.value = true
  try {
    const result = await apiPost({
        type: 'save_frp',
        data: {
          open: form.value.open,
          server_addr: form.value.server_addr,
          token: form.value.token,
          debug: form.value.debug,
        },
      })

    if (result.status === 'error') {
      ElMessage.error(result.error || '操作失败')
      form.value.open = !form.value.open
      return
    }

    ElMessage.success(form.value.open ? 'BeerFrp 已启用' : 'BeerFrp 已关闭')
  } catch (e) {
    console.error('操作失败:', e)
    ElMessage.error('操作失败')
    form.value.open = !form.value.open
  } finally {
    toggling.value = false
  }
}

/* ================= 保存配置 ================= */
async function saveConfig() {
  if (loadFailed.value) return

  saving.value = true
  try {
    const result = await apiPost({
        type: 'save_frp',
        data: {
          open: form.value.open,
          server_addr: form.value.server_addr,
          token: form.value.token,
          debug: form.value.debug,
        },
      })

    if (result.status === 'error') {
      ElMessage.error(result.error || '保存配置失败')
      return
    }

    ElMessage.success('配置已保存')
  } catch (e) {
    console.error('保存 BeerFrp 配置失败:', e)
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
      <h2 class="page-title">BeerFrp 穿透配置</h2>
      <p class="page-subtitle">管理 BeerWebFrp WebSocket 隧道连接</p>
    </div>

    <div class="panel-card">
      <ElForm :model="form" v-loading="loading" :label-position="isMobile ? 'top' : 'right'">
        <ElFormItem label="启用 BeerFrp">
          <ElSwitch
            v-model="form.open"
            :disabled="loadFailed"
            :loading="toggling"
            active-text="开启"
            inactive-text="关闭"
            @change="toggleFrp"
          />
          <div class="form-hint">
            开启后通过 WebSocket 连接 BeerWebFrp 服务端，断线每 5 秒自动重连
          </div>
        </ElFormItem>

        <ElFormItem label="服务端地址">
          <ElInput
            v-model="form.server_addr"
            placeholder="wss://frp.cjxpj.com"
            :disabled="loadFailed"
          />
          <div class="form-hint">
            BeerWebFrp 服务端 WebSocket 地址
          </div>
        </ElFormItem>

        <ElFormItem label="密钥">
          <ElInput
            v-model="form.token"
            placeholder="你的密钥"
            show-password
            :disabled="loadFailed"
          />
          <div class="form-hint">
            BeerWebFrp 中创建的密钥
          </div>
        </ElFormItem>

        <ElFormItem label="调试日志">
          <ElSwitch
            v-model="form.debug"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
          />
          <div class="form-hint">
            开启后在服务端控制台输出 FRP 连接与代理的调试日志
          </div>
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

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
