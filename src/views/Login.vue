<template>
  <div class="login-page">
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
            @keyup.enter="doLogin()"
          />
        </div>
        <div style="margin-bottom: 12px">
          <label class="remember-row">
            <input v-model="rememberMe" type="checkbox" />
            <span>记住登录状态</span>
          </label>
        </div>
        <button class="login-btn" :disabled="!key || logging" @click="doLogin()">
          {{ logging ? '验证中...' : '登录' }}
        </button>
        <p v-if="error" class="login-error">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'

const emit = defineEmits(['login-success'])

const key = ref('')
const rememberMe = ref(false)
const logging = ref(false)
const error = ref('')
const autoLogin = ref(true)
const keyInput = ref(null)

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
  } finally {
    logging.value = false
    autoLogin.value = false
  }
}

onMounted(async () => {
  const urlKey = new URLSearchParams(location.search).get('key')
  if (urlKey) {
    await doLogin(urlKey)
  } else {
    autoLogin.value = false
    await nextTick()
    keyInput.value?.focus()
  }
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
