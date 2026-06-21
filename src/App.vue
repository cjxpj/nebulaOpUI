<template>
  <Login v-if="needLogin" @login-success="onLoginSuccess" />
  <HomeView v-else />
</template>

<script setup>
import { ref, onMounted, provide } from 'vue'
import HomeView from '@/views/HomeView.vue'
import Login from '@/views/Login.vue'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'

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

function onLoginSuccess() {
  needLogin.value = false
}

function logout() {
  sessionStorage.removeItem('nebula_opui_key')
  localStorage.removeItem('nebula_opui_key')
  needLogin.value = true
}

provide('logout', logout)

onMounted(async () => {
  // 检查 localStorage 和 sessionStorage 中是否已登录
  const savedKey = localStorage.getItem('nebula_opui_key') || sessionStorage.getItem('nebula_opui_key')
  if (savedKey) {
    try {
      const data = await apiPost({ type: 'check_opui_key', data: { key: savedKey } })
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
    const data = await apiPost({ type: 'get_opui' })
    if (!data.secret) {
      // 未配置密钥，无需登录
      needLogin.value = false
      return
    }
  } catch (e) {
    console.error('[OPUI Auth] get_opui failed:', e)
    needLogin.value = false
    return
  }
})
</script>
