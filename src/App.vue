<template>
  <Login v-if="needLogin" @login-success="onLoginSuccess" />
  <HomeView v-else />
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import HomeView from '@/views/HomeView.vue'
import Login from '@/views/Login.vue'
import { apiPost, onPush, disconnect, onUnauthorized, onWsAddressRequired, getStoredWsAddress, saveWsAddress, DEFAULT_WS_ADDRESS } from '@/api.js'
import { clearDocCache } from '@/docCache.js'

/* ================= URL 参数注入 ================= */
// 支持通过 GET 参数一键注入 WS 地址与登录密码：?ws=ws://host:port/nebula&key=密钥
const urlParams = new URLSearchParams(window.location.search)
const urlWs = urlParams.get('ws')
if (urlWs) {
  saveWsAddress(urlWs)
}
const urlKey = urlParams.get('key')
if (urlKey) {
  localStorage.setItem('nebula_opui_key', urlKey)
}

/* ================= 主题 ================= */
const isDarkMode = ref(true)

function applyTheme() {
  document.documentElement.classList.toggle('dark', isDarkMode.value)
}

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value
  localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light')
  applyTheme()
}

// 主题初始化必须最早执行，确保登录页也有正确主题
isDarkMode.value = localStorage.getItem('theme') !== 'light'
applyTheme()

provide('isDarkMode', isDarkMode)
provide('toggleTheme', toggleTheme)

/* ================= 登录态 ================= */
const needLogin = ref(true)

// 注册未认证回调：API 返回 unauthorized 或 WS 重连耗尽时退回登录页
onUnauthorized(() => {
  clearDocCache()
  needLogin.value = true
})

// 特殊域名下 WS 连接失败：要求手动填写 WS 地址（反向代理域名无法转发 WS 时，可直连局域网服务器）
onWsAddressRequired(() => {
  ElMessageBox.prompt(
    '当前域名无法建立 WebSocket 连接，请填写可用的 WS 地址：完整地址（如 ws://127.0.0.1:8080/nebula，用于直连局域网服务器）或路径（如 /nebula）。',
    'WS 连接配置',
    {
      confirmButtonText: '保存并重试',
      cancelButtonText: '取消',
      closeOnClickModal: false,
      closeOnPressEscape: false,
      inputValue: getStoredWsAddress() || DEFAULT_WS_ADDRESS,
      inputPlaceholder: '例如 ws://127.0.0.1:8080/nebula 或 /nebula',
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
})

function onLoginSuccess() {
  disconnect() // 断开旧的未认证连接，后续请求会用带 key 的 URL 重新连接
  needLogin.value = false
}

function logout() {
  disconnect()
  clearDocCache()
  sessionStorage.removeItem('nebula_opui_key')
  localStorage.removeItem('nebula_opui_key')
  needLogin.value = true
}

provide('logout', logout)

/* ================= WebSocket 推送事件处理 ================= */
onPush((data) => {
  if (data.type === 'login_event') {
    const isFail = data.event_type === 'admin_login_fail'
    ElNotification({
      title: isFail ? '登录失败' : '管理员登录',
      message: `${data.detail}\nIP: ${data.ip}\n时间: ${data.time}`,
      type: isFail ? 'warning' : 'info',
      duration: 5000,
    })
  }
})

/* ================= 登录态检查 ================= */
onMounted(async () => {
  // 检查 localStorage 和 sessionStorage 中是否已登录
  const savedKey = localStorage.getItem('nebula_opui_key') || sessionStorage.getItem('nebula_opui_key')
  if (savedKey) {
    try {
      const data = await apiPost({ type: 'check_opui_key', data: { key: savedKey } }, { noRetry: true })
      if (data.valid) {
        needLogin.value = false
        return
      }
    } catch (e) {
      console.error('[OPUI Auth] session check failed:', e)
    }
    sessionStorage.removeItem('nebula_opui_key')
    localStorage.removeItem('nebula_opui_key')
  }

  // 检查是否配置了密钥
  try {
    const data = await apiPost({ type: 'get_opui' }, { noRetry: true })
    if (!data.secret) {
      // 未配置密钥，无需登录
      needLogin.value = false
      return
    }
  } catch (e) {
    // 网络错误/超时不跳过登录，保持登录页面等待用户重试
    console.error('[OPUI Auth] get_opui failed:', e)
  }
})

onUnmounted(() => {
  disconnect()
})
</script>
