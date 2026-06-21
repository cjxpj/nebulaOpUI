<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElForm, ElFormItem, ElInput, ElInputNumber, ElButton, ElMessage, ElMessageBox, ElSwitch } from 'element-plus'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 表单数据 ================= */
const form = ref({
  open: false,
  port: 21,
  username: 'admin',
  password: '',
  debug: false,
  tls: true,
  pasv_port_start: 32000,
  pasv_port_end: 32005,
})

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)

/* ================= 实时校验 ================= */
const portRangeError = computed(() => {
  if (form.value.pasv_port_start > form.value.pasv_port_end) {
    return '起始端口不能大于结束端口'
  }
  return ''
})

/* ================= 初始化加载 ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const data = await apiPost({ type: 'get_ftp' })

    form.value.open = Boolean(data.open)
    form.value.port = data.port || 21
    form.value.username = data.username || ''
    form.value.password = data.password || ''
    form.value.debug = Boolean(data.debug)
    form.value.tls = data.tls !== undefined ? Boolean(data.tls) : true
    form.value.pasv_port_start = data.pasv_port_start || 32000
    form.value.pasv_port_end = data.pasv_port_end || 32005
  } catch (e) {
    console.error('获取 FTP 配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取 FTP 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存配置 ================= */
async function saveConfig(silent) {
  if (loadFailed.value) return

  // 校验数据端口范围
  if (form.value.pasv_port_start > form.value.pasv_port_end) {
    ElMessage.error('起始端口不能大于结束端口')
    return
  }

  saving.value = true
  try {
    const result = await apiPost({
        type: 'save_ftp',
        data: {
          open: form.value.open,
          port: form.value.port,
          username: form.value.username,
          password: form.value.password,
          debug: form.value.debug,
          tls: form.value.tls,
          pasv_port_start: form.value.pasv_port_start,
          pasv_port_end: form.value.pasv_port_end,
        },
      })

    if (result.status === 'error') {
      ElMessage.error(result.error || '保存配置失败')
      return
    }

    if (!silent) {
      ElMessage.success('FTP 配置已保存')
    }
  } catch (e) {
    console.error('保存 FTP 配置失败:', e)
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

/* ================= 实时开关 ================= */
function onToggleOpen() {
  if (loadFailed.value) return
  saveConfig(true)
  ElMessage.success(form.value.open ? 'FTP 服务已启动' : 'FTP 服务已停止')
}

function onToggleTls() {
  if (loadFailed.value) return
  saveConfig(true)
  ElMessage.success(form.value.tls ? 'FTPS 加密已开启' : 'FTPS 加密已关闭')
}

/* ================= 随机密码 ================= */
function randomPassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let pwd = ''
  for (let i = 0; i < 10; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)]
  }
  return pwd
}

async function genRandomPassword() {
  const newPwd = randomPassword()
  try {
    await ElMessageBox.confirm(
      `将为您生成新的随机密码，当前密码将被替换。`,
      '生成随机密码',
      {
        confirmButtonText: '确认生成',
        cancelButtonText: '取消',
        type: 'warning',
        beforeClose: (action, instance, done) => {
          if (action === 'confirm') {
            instance.confirmButtonLoading = true
            form.value.password = newPwd
            instance.confirmButtonLoading = false
            ElMessage.success('密码已生成')
            done()
          } else {
            done()
          }
        },
      }
    )
  } catch (e) {
    console.error('生成随机密码弹窗:', e)
    // 用户取消，不做任何操作
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">FTP 控制面板</h2>
      <p class="page-subtitle">管理 FTP 文件服务配置</p>
    </div>

    <div class="panel-card">
      <div class="firewall-notice">
        <h4 class="notice-title">注意事项</h4>
        <ul class="notice-list">
          <li>请确保防火墙已开放<strong>连接端口</strong>（默认 21），用于 FTP 控制指令传输</li>
          <li>请确保防火墙已开放<strong>数据端口范围</strong>（默认 32000-32005），用于被动模式文件传输，起始端口不能大于结束端口</li>
          <li>启用 FTPS 加密后，防火墙需放行 TLS 握手，客户端需支持 FTPS 协议</li>
          <li>修改端口配置后需点击「保存配置」方可生效</li>
        </ul>
      </div>
      <ElForm :model="form" v-loading="loading" :label-position="isMobile ? 'top' : 'right'">
        <ElFormItem label="启用 FTP">
          <ElSwitch
            v-model="form.open"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
            @change="onToggleOpen"
          />
          <div class="form-hint">
            开启后启动 FTP 文件服务
          </div>
        </ElFormItem>

        <ElFormItem label="FTPS 加密">
          <ElSwitch
            v-model="form.tls"
            :disabled="loadFailed"
            active-text="开启"
            inactive-text="关闭"
            @change="onToggleTls"
          />
          <div class="form-hint">
            开启 TLS 加密传输（需客户端支持 FTPS），防火墙需放行 TLS 握手
          </div>
        </ElFormItem>

        <ElFormItem label="连接端口">
          <ElInputNumber
            v-model="form.port"
            :min="1"
            :max="65535"
            :disabled="loadFailed"
            controls-position="right"
          />
          <div class="form-hint">
            FTP 控制连接端口（默认 21）
          </div>
        </ElFormItem>

        <ElFormItem label="数据端口" :error="portRangeError">
          <div class="port-range-row">
            <ElInputNumber
              v-model="form.pasv_port_start"
              :min="1"
              :max="65535"
              :disabled="loadFailed"
              controls-position="right"
            />
            <span class="port-range-sep">-</span>
            <ElInputNumber
              v-model="form.pasv_port_end"
              :min="1"
              :max="65535"
              :disabled="loadFailed"
              controls-position="right"
            />
          </div>
          <div class="form-hint">
            被动模式数据传输端口范围（默认 32000 - 32005）
          </div>
        </ElFormItem>

        <ElFormItem label="用户名">
          <ElInput
            v-model="form.username"
            placeholder="admin"
            :disabled="loadFailed"
          />
          <div class="form-hint">
            FTP 登录用户名
          </div>
        </ElFormItem>

        <ElFormItem label="密码">
          <div class="password-row">
            <ElInput
              v-model="form.password"
              placeholder="设置登录密码"
              show-password
              :disabled="loadFailed"
            />
            <ElButton
              :disabled="loadFailed"
              @click="genRandomPassword"
            >
              随机生成
            </ElButton>
          </div>
          <div class="form-hint">
            FTP 登录密码
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
            开启后所有 FTP 数据打印在终端
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

  .firewall-notice {
    margin-bottom: 20px;
    padding: 14px 18px;
    background: var(--el-color-warning-light-9);
    border: 1px solid var(--el-color-warning-light-6);
    border-radius: 8px;
  }

  .notice-title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-color-warning-dark-1);
  }

  .notice-list {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    color: var(--el-text-color-regular);
    line-height: 1.7;
  }

  .password-row {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  .password-row .el-input {
    flex: 1;
  }

  .password-row .el-button {
    flex-shrink: 0;
  }

  .port-range-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .port-range-sep {
    font-size: 16px;
    color: var(--el-text-color-secondary);
    flex-shrink: 0;
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
