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
// 支持通过 GET 参数一键注入 WS 地址与登录密码：?ws=ws://host:port/nebula&key=密码
const urlParams = new URLSearchParams(window.location.search)
const urlWs = urlParams.get('ws')
if (urlWs) {
  saveWsAddress(urlWs)
}
const urlKey = urlParams.get('key')
if (urlKey) {
  // key 参数（快捷登录码/登录密码）读取后即记录到本地，随后从地址栏移除，
  // 避免刷新/重新打开/分享地址时 key 残留泄露，或重新注入覆盖本地已保存的凭证
  localStorage.setItem('nebula_opui_key', urlKey)
  stripKeyFromUrl()
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
// 有已保存密钥时先假设已登录，避免冷启动/刷新时登录页闪现；校验失败再退回登录页
const needLogin = ref(!(localStorage.getItem('nebula_opui_key') || sessionStorage.getItem('nebula_opui_key')))

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

// 移除地址栏 get 参数中的 key（快捷登录码/登录密码）：
// key 参数在页面加载时已被读取并记录到本地，之后 URL 中不再需要它。
// 保留会造成 key 在刷新/重新打开时被重新注入，覆盖本地已保存的凭证（快捷登录码重启后会失效），并存在地址泄露风险
function stripKeyFromUrl() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('key')) return
  url.searchParams.delete('key')
  window.history.replaceState(null, '', url)
}

function onLoginSuccess() {
  disconnect() // 断开旧的未认证连接，后续请求会用已保存的 key 重新连接认证
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
      // 密钥明确无效，清除并退回登录页
      sessionStorage.removeItem('nebula_opui_key')
      localStorage.removeItem('nebula_opui_key')
      needLogin.value = true
      return
    } catch (e) {
      // 网络错误/连接失败：保留密钥，交由重连机制处理，避免一键登录的正确密钥被误清除
      console.error('[OPUI Auth] session check failed:', e)
      return
    }
  }

  // 检查是否设置了登录密码
  try {
    const data = await apiPost({ type: 'get_opui' }, { noRetry: true })
    if (!data.has_password) {
      // 未设置登录密码，无需登录
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
