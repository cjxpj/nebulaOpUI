<script setup>
import { ref, onMounted } from 'vue'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch } from 'element-plus'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 表单数据 ================= */
const serverForm = ref({
  server: '',
  cors: false,
  cors_origins: '',
  temp_cleanup_interval: 60,
  tls: false,
  cert_file: '',
  key_file: '',
  autostart: false,
})

const loading = ref(false)
const savingServer = ref(false)
const loadFailed = ref(false)
const togglingAutostart = ref(false)

/* ================= 初始化加载 ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const [serverData, autostartData] = await Promise.all([
      apiPost({ type: 'get_server' }),
      apiPost({ type: 'get_autostart' }),
    ])

    serverForm.value.server = serverData.server || ''
    serverForm.value.cors = Boolean(serverData.cors)
    serverForm.value.cors_origins = serverData.cors_origins || ''
    serverForm.value.temp_cleanup_interval = serverData.temp_cleanup_interval ?? 60
    serverForm.value.tls = Boolean(serverData.tls)
    serverForm.value.cert_file = serverData.cert_file || ''
    serverForm.value.key_file = serverData.key_file || ''
    serverForm.value.autostart = Boolean(autostartData.enabled)
  } catch (e) {
    console.error('获取配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存 Server ================= */
async function saveServer() {
  if (loadFailed.value) return

  savingServer.value = true
  try {
    await apiPost({
        type: 'save_server',
        data: {
          server: serverForm.value.server,
          cors: serverForm.value.cors,
          cors_origins: serverForm.value.cors_origins,
          temp_cleanup_interval: Number(serverForm.value.temp_cleanup_interval),
          tls: serverForm.value.tls,
          cert_file: serverForm.value.cert_file,
          key_file: serverForm.value.key_file,
        },
      })
    ElMessage.success('Server 配置已保存')
  } catch (e) {
    console.error('保存 Server 配置失败:', e)
    ElMessage.error('保存 Server 配置失败')
  } finally {
    savingServer.value = false
  }
}

/* ================= 开机自启开关 ================= */
async function toggleAutoStart(val) {
  togglingAutostart.value = true
  try {
    const res = val
      ? await apiPost({ type: 'set_autostart' })
      : await apiPost({ type: 'cancel_autostart' })

    if (res.status === 'error') {
      throw new Error(res.error || '操作失败')
    }

    ElMessage.success(val ? '已开启开机自启' : '已关闭开机自启')
  } catch (e) {
    serverForm.value.autostart = !val
    ElMessage.error(e?.message || '操作失败')
  } finally {
    togglingAutostart.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">Server 配置</h2>
      <p class="page-subtitle">配置服务器监听地址、跨域等基础参数</p>
    </div>

    <!-- Server 卡片 -->
    <div class="panel-card">
      <ElForm :model="serverForm" v-loading="loading" :label-position="isMobile ? 'top' : 'right'">
        <ElFormItem label="监听地址">
          <ElInput v-model="serverForm.server" placeholder="0.0.0.0:8080" :disabled="loadFailed" />
        </ElFormItem>

        <ElFormItem label="跨域开关">
          <ElSwitch
            v-model="serverForm.cors"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
          />
        </ElFormItem>

        <ElFormItem label="跨域白名单">
          <ElInput
            v-model="serverForm.cors_origins"
            placeholder="* 或 http://example.com,http://localhost:3000"
            :disabled="loadFailed"
          />
        </ElFormItem>

        <ElFormItem label="临时读写清理周期">
          <ElInput v-model="serverForm.temp_cleanup_interval" placeholder="60" :disabled="loadFailed">
            <template #suffix>秒</template>
          </ElInput>
        </ElFormItem>

        <ElFormItem label="启用 HTTPS">
          <ElSwitch
            v-model="serverForm.tls"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
          />
          <div class="form-hint">
            开启后使用 SSL 证书加密传输，需重启服务生效
          </div>
        </ElFormItem>

        <ElFormItem label="证书文件路径">
          <ElInput
            v-model="serverForm.cert_file"
            placeholder="private/https/cert.pem"
            :disabled="loadFailed || !serverForm.tls"
          />
          <div class="form-hint">
            SSL 证书文件（.pem 或 .crt），如通过 Nginx 反代则无需配置
          </div>
        </ElFormItem>

        <ElFormItem label="密钥文件路径">
          <ElInput
            v-model="serverForm.key_file"
            placeholder="private/https/key.pem"
            :disabled="loadFailed || !serverForm.tls"
          />
          <div class="form-hint">
            SSL 私钥文件（.pem 或 .key）
          </div>
        </ElFormItem>

        <ElFormItem label="开机自启">
          <ElSwitch
            v-model="serverForm.autostart"
            :loading="togglingAutostart"
            :disabled="loadFailed || loading"
            active-text="已开启"
            inactive-text="已关闭"
            @change="toggleAutoStart"
          />
          <div class="form-hint">
            开启后，系统启动时将自动运行 Nebula 服务（Windows: 注册表，Linux: systemd，macOS: launchd）
          </div>
        </ElFormItem>

        <ElFormItem>
          <div class="form-actions">
            <ElButton type="primary" :loading="savingServer" :disabled="loadFailed" @click="saveServer">
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
