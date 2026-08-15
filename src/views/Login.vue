<template>
  <div class="login-page">
    <button
      class="ws-status-dot"
      :class="wsConnected ? 'ws-on' : 'ws-off'"
      :title="wsConnected ? 'WS 已连接（点击编辑连接地址）' : 'WS 未连接（点击编辑连接地址）'"
      @click="editWsAddress"
    ></button>
    <div class="login-card">
      <h1 class="login-title">Nebula</h1>
      <p class="login-subtitle">管理面板</p>
      <div v-if="autoLogin" class="login-status">
        <span>验证中...</span>
      </div>
      <div v-else>
        <div style="margin-bottom: 16px">
          <input
            ref="keyInput"
            v-model="key"
            type="password"
            class="login-input"
            placeholder="请输入密钥"
            @input="connectionError = false"
            @keyup.enter="doLogin()"
          />
        </div>
        <div style="margin-bottom: 12px">
          <label class="remember-row">
            <input v-model="rememberMe" type="checkbox" />
            <span>记住登录状态</span>
          </label>
        </div>
        <button class="login-btn" :disabled="!key || logging || connectionError" @click="doLogin()">
          {{ logging ? '验证中...' : '登录' }}
        </button>
        <p v-if="error" class="login-error">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { config } from '@/config.js'
import { apiPost, getWsConnected, onWsStatusChange, getStoredWsAddress, saveWsAddress, DEFAULT_WS_ADDRESS } from '@/api.js'

const emit = defineEmits(['login-success'])

const key = ref('')
const rememberMe = ref(false)
const logging = ref(false)
const error = ref('')
const autoLogin = ref(false)
const keyInput = ref(null)
const connectionError = ref(false)

// WS 连接状态（右上角红/绿点）
const wsConnected = ref(getWsConnected())
const offWsStatus = onWsStatusChange((v) => {
  wsConnected.value = v
})

// 点击状态点：编辑 WS 连接地址
function editWsAddress() {
  ElMessageBox.prompt(
    '编辑 WS 连接地址：可填完整地址（如 ws://127.0.0.1:8080/nebula）或路径（如 /nebula）。',
    'WS 连接地址',
    {
      confirmButtonText: '保存并重连',
      cancelButtonText: '取消',
      closeOnClickModal: false,
      inputValue: getStoredWsAddress() || DEFAULT_WS_ADDRESS,
      inputPlaceholder: '例如 ws://127.0.0.1:8080/nebula',
      inputValidator: (v) => {
        const p = (v || '').trim()
        if (p.startsWith('/')) return true
        if (/^wss?:\/\//.test(p)) return true
        return '请输入 / 开头的路径，或 ws://、wss:// 开头的完整地址'
      },
    }
  )
    .then(({ value }) => {
      saveWsAddress(value)
      // 使用新地址重新加载，重新建立连接
      location.reload()
    })
    .catch(() => {})
}

async function doLogin(k) {
  const keyToTry = k || key.value
  if (!keyToTry) return

  logging.value = true
  error.value = ''
  try {
    const data = await apiPost({ type: 'check_opui_key', data: { key: keyToTry } })
    if (data.valid) {
      const storage = rememberMe.value ? localStorage : sessionStorage
      storage.setItem('nebula_opui_key', keyToTry)
      emit('login-success')
    } else {
      error.value = '密钥错误'
      key.value = ''
      await nextTick()
      keyInput.value?.focus()
    }
  } catch (e) {
    console.error('[OPUI Login]', e)
    error.value = '验证失败，请稍后重试'
    connectionError.value = true
  } finally {
    logging.value = false
    autoLogin.value = false
  }
}

onMounted(async () => {
  await nextTick()
  keyInput.value?.focus()
})

onUnmounted(() => {
  offWsStatus?.()
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* 右上角 WS 连接状态点（红/绿），点击编辑连接地址 */
.ws-status-dot {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  z-index: 10;
}

.ws-status-dot.ws-on {
  background: var(--el-color-success);
  box-shadow: 0 0 6px rgba(103, 194, 58, 0.6);
}

.ws-status-dot.ws-off {
  background: var(--el-color-danger);
  box-shadow: 0 0 6px rgba(245, 108, 108, 0.6);
}

.login-card {
  width: 360px;
  padding: 40px 36px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  text-align: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.login-title {
  margin: 0 0 4px;
  font-size: 28px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.login-subtitle {
  margin: 0 0 28px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.login-status {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.login-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.login-input:focus {
  border-color: var(--el-color-primary);
}

.login-btn {
  width: 100%;
  padding: 10px 0;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.login-btn:hover:not(:disabled) {
  background: var(--el-color-primary-light-3);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--el-color-danger);
}

.remember-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.remember-row input[type="checkbox"] {
  accent-color: var(--el-color-primary);
  cursor: pointer;
}
</style>
