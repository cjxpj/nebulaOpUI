<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { apiPost, onPush } from '@/api.js'

// 星云云工具（NebulaCloudTool）连接：账号密码登录，登录 token 存后端，本地仅用 Cookie 记住 token 用于刷新恢复
// 云工具地址从后端配置（system.ini [云工具] 连接地址）读取，前后端统一
// 前端不再直连云工具，所有操作通过后端 OPUI WebSocket 代理转发
const DEFAULT_ADDR = '127.0.0.1:8080/cloudtool'
const TOKEN_COOKIE = 'cloud_token'
const USERNAME_COOKIE = 'cloud_username'

const addr = ref('')
const cloudToolDebug = ref(false)
const username = ref('')
const password = ref('')

const connected = ref(false)
const connecting = ref(false)
const interrupting = ref(false) // 中断重连请求进行中
const reconnecting = ref(false) // 是否正在断线重连（由后端 cloud_tool_status 推送 / get_cloud_tool 返回）
const loading = ref(true)
const funcs = ref([]) // 云函数列表：{ name, rule, desc, price }[]
const dataSize = ref('') // 当前账号用户数据占用大小（人类可读）
const onlineDuration = ref('') // 当前账号累计在线时长（人类可读，实时）
const money = ref('') // 当前账号余额（超高精度十进制字符串）
const coupon = ref('') // 当前账号抵扣金（超高精度十进制字符串）
const totalMoney = ref('') // 当前账号总金额（余额 + 抵扣金）
const devices = ref([]) // 当前账号在线设备：{ ip, start }[]
let onlineSecondsBase = 0 // 登录时拉取的累计在线秒数基准
let onlineStartAt = 0 // 基准时间戳（毫秒）
let onlineTimer = null // 实时刷新定时器
const currentUsername = ref('') // 当前登录账号（已登录页展示用）

const pwdDialogVisible = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const renameDialogVisible = ref(false)
const renamePassword = ref('')
const renameNewUsername = ref('')
const deleteDialogVisible = ref(false)
const deletePassword = ref('')
const moneyLogsDialogVisible = ref(false)
const moneyLogs = ref([]) // 账户资金流水列表：{ type, amount, balance, remark, created_at }[]
const moneyLogsLoading = ref(false)
const moneyLogTotal = ref(0) // 资金流水总条数
const moneyLogPage = ref(1) // 当前页码
const moneyLogPageSize = ref(20) // 每页条数

let unsubPush = null

// 本地仅用 Cookie 记住 token，供刷新后恢复登录；token 实际由后端存数据库
function setTokenCookie(token) {
  document.cookie = TOKEN_COOKIE + '=' + encodeURIComponent(token) + '; max-age=31536000; path=/'
}

function getTokenCookie() {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + TOKEN_COOKIE + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : ''
}

function clearTokenCookie() {
  document.cookie = TOKEN_COOKIE + '=; max-age=0; path=/'
}

// 账号也记在 Cookie，供刷新后拼回连接路径 /:username
function setUsernameCookie(name) {
  document.cookie = USERNAME_COOKIE + '=' + encodeURIComponent(name) + '; max-age=31536000; path=/'
}

function getUsernameCookie() {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + USERNAME_COOKIE + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : ''
}

function clearUsernameCookie() {
  document.cookie = USERNAME_COOKIE + '=; max-age=0; path=/'
}

// 随机账号密码：生成一组随机的账号与密码填入登录表单
const RANDOM_USER_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const RANDOM_PWD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function randomStr(len, chars) {
  let s = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(len)
    crypto.getRandomValues(arr)
    for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length]
  } else {
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

function randomAccount() {
  username.value = 'u' + randomStr(8, RANDOM_USER_CHARS)
  password.value = randomStr(12, RANDOM_PWD_CHARS)
}

// 密码 SHA-256 单向加密（与服务端配置中的密码哈希一致）
// 优先使用 Web Crypto；普通 HTTP（如局域网 IP）下 crypto.subtle 不可用，回退到纯 JS 实现
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text)
  let buf
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    buf = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  } else {
    buf = sha256Bytes(bytes)
  }
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 纯 JS SHA-256 实现（输入为 UTF-8 字节），返回 32 字节摘要
function sha256Bytes(data) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])

  const rotr = (x, n) => (x >>> n) | (x << (32 - n))

  const len = data.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
  padded.set(data)
  padded[len] = 0x80

  const view = new DataView(padded.buffer)
  // 消息长度按 64 位大端写入，低 32 位为实际位长，高 32 位为 0（密码长度远小于 2^32）
  view.setUint32(padded.length - 4, (len * 8) >>> 0, false)

  for (let i = 0; i < padded.length; i += 64) {
    const w = new Uint32Array(64)
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false)
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }

    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) {
    outView.setUint32(i * 4, H[i], false)
  }
  return out
}

// 调试开关：读写 system.ini [云工具] 调试 配置
async function saveDebug(val) {
  try {
    await apiPost({ type: 'save_cloud_tool', data: { addr: addr.value, debug: val } }, { noRetry: true })
    cloudToolDebug.value = val
  } catch (e) {
    ElMessage.error(e?.message || e)
  }
}

// 点击右上角状态点：编辑服务器地址（保存到后端，前后端统一）
async function editAddr() {
  let value
  try {
    ;({ value } = await ElMessageBox.prompt(
      '编辑云工具服务器地址：可填 host:port/路径（如 127.0.0.1:8080/cloudtool）或完整 ws:// 地址。',
      '云工具服务器地址',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        closeOnClickModal: false,
        inputValue: addr.value,
        inputPlaceholder: '127.0.0.1:8080/cloudtool',
      }
    ))
  } catch {
    return
  }

  let v = (value || '').trim()
  if (!v) {
    // 留空 = 清除自定义地址，恢复默认连接本机内置云工具服务端
    try {
      await apiPost(
        { type: 'save_cloud_tool', data: { addr: '', debug: cloudToolDebug.value } },
        { noRetry: true }
      )
      await loadCloudConfig() // 重新拉取，显示后端返回的默认地址
      ElMessage.success('已清除自定义地址，默认连接本机')
    } catch (e) {
      ElMessage.error('保存地址失败：' + (e?.message || e))
      return
    }
    if (connected.value) disconnect()
    return
  }
  if (!/^wss?:\/\//i.test(v)) v = 'ws://' + v

  try {
    await apiPost(
      {
        type: 'save_cloud_tool',
        data: { addr: v, debug: cloudToolDebug.value },
      },
      { noRetry: true }
    )
    addr.value = v
  } catch (e) {
    ElMessage.error('保存地址失败：' + (e?.message || e))
    return
  }

  if (connected.value) {
    disconnect()
  }
}

// 密码登录（密码 SHA-256 单向加密后交给后端转发认证）
async function connect() {
  const u = username.value.trim()
  const p = password.value

  if (!u || !p) {
    ElMessage.error('账号、密码均不能为空')
    return
  }
  if (p.length < 6) {
    ElMessage.error('密码长度不能少于 6 位')
    return
  }

  connecting.value = true
  try {
    const hash = await sha256Hex(p)
    const res = await apiPost({ type: 'cloud_connect', data: { username: u, password: hash } }, { noRetry: true })
    connected.value = true
    loadCloudFuncs()
    loadAccountStats()
    if (res && res.token) setTokenCookie(res.token)
    setUsernameCookie(u)
    currentUsername.value = u
  } catch (e) {
    connected.value = false
    clearTokenCookie()
    clearUsernameCookie()
    ElMessage.error(e?.message || e)
  } finally {
    connecting.value = false
  }
}

// 用 Cookie 记住的 token 与账号恢复登录
async function resume() {
  const token = getTokenCookie()
  const name = getUsernameCookie()
  if (!token || !name) return
  connecting.value = true
  try {
    const res = await apiPost({ type: 'cloud_resume', data: { username: name, token } }, { noRetry: true })
    connected.value = true
    loadCloudFuncs()
    loadAccountStats()
    if (res && res.token) setTokenCookie(res.token)
    currentUsername.value = name
  } catch (e) {
    connected.value = false
    clearTokenCookie()
    clearUsernameCookie()
  } finally {
    connecting.value = false
  }
}

async function disconnect() {
  connected.value = false
  funcs.value = []
  dataSize.value = ''
  money.value = ''
  coupon.value = ''
  totalMoney.value = ''
  devices.value = []
  stopOnlineTicker()
  onlineDuration.value = ''
  currentUsername.value = ''
  try {
    await apiPost({ type: 'cloud_disconnect' }, { noRetry: true })
  } catch (e) {
    // 忽略断开失败
  }
}

// 中断断线重连：停止后端自动重连并清除本地凭据，回到未连接状态，可重新手动登录
async function interruptReconnect() {
  interrupting.value = true
  try {
    await apiPost({ type: 'cloud_cancel_reconnect' }, { noRetry: true })
    reconnecting.value = false
    clearTokenCookie()
    clearUsernameCookie()
  } catch (e) {
    ElMessage.error(e?.message || e)
  } finally {
    interrupting.value = false
  }
}

async function logout() {
  try {
    await apiPost({ type: 'cloud_logout' }, { noRetry: true })
  } catch (e) {
    // 忽略发送失败
  }
  connected.value = false
  funcs.value = []
  dataSize.value = ''
  money.value = ''
  coupon.value = ''
  totalMoney.value = ''
  devices.value = []
  stopOnlineTicker()
  onlineDuration.value = ''
  currentUsername.value = ''
  clearTokenCookie()
  clearUsernameCookie()
  ElMessage.success('已退出登录')
}

function openChangePwd() {
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  pwdDialogVisible.value = true
}

async function changePassword() {
  if (!connected.value) {
    ElMessage.error('请先登录')
    return
  }
  if (!oldPassword.value || !newPassword.value) {
    ElMessage.error('旧密码、新密码均不能为空')
    return
  }
  if (newPassword.value.length < 6) {
    ElMessage.error('新密码长度不能少于 6 位')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    ElMessage.error('两次输入的新密码不一致')
    return
  }

  const oldHash = await sha256Hex(oldPassword.value)
  const newHash = await sha256Hex(newPassword.value)

  try {
    const res = await apiPost(
      { type: 'cloud_change_password', data: { old_password: oldHash, new_password: newHash } },
      { noRetry: true }
    )
    ElMessage.success(res?.result || '密码修改成功')
    pwdDialogVisible.value = false
  } catch (e) {
    ElMessage.error(e?.message || e)
  }
}

function openChangeUsername() {
  renamePassword.value = ''
  renameNewUsername.value = ''
  renameDialogVisible.value = true
}

async function changeUsername() {
  if (!connected.value) {
    ElMessage.error('请先登录')
    return
  }
  const name = renameNewUsername.value.trim()
  if (!renamePassword.value || !name) {
    ElMessage.error('新用户名、当前密码均不能为空')
    return
  }
  // 更改用户名一天仅一次，执行前弹出警告确认
  try {
    await ElMessageBox.confirm(
      '更改用户名一天只能操作一次，修改后其它设备需重新登录，是否继续？',
      '警告',
      { confirmButtonText: '继续修改', cancelButtonText: '取消', type: 'warning', closeOnClickModal: false }
    )
  } catch {
    return
  }
  const pwdHash = await sha256Hex(renamePassword.value)
  try {
    const res = await apiPost(
      { type: 'cloud_change_username', data: { old_password: pwdHash, new_username: name } },
      { noRetry: true }
    )
    ElMessage.success(res?.result || '用户名修改成功')
    renameDialogVisible.value = false
    setUsernameCookie(name)
    currentUsername.value = name
  } catch (e) {
    ElMessage.error(e?.message || e)
  }
}

function openDeleteAccount() {
  deletePassword.value = ''
  deleteDialogVisible.value = true
}

async function deleteAccount() {
  if (!connected.value) {
    ElMessage.error('请先登录')
    return
  }
  if (!deletePassword.value) {
    ElMessage.error('请输入当前密码')
    return
  }
  const hash = await sha256Hex(deletePassword.value)
  try {
    const res = await apiPost({ type: 'cloud_delete_account', data: { password: hash } }, { noRetry: true })
    ElMessage.success(res?.result || '账号已注销')
    deleteDialogVisible.value = false
    connected.value = false
    funcs.value = []
    dataSize.value = ''
    money.value = ''
    coupon.value = ''
    totalMoney.value = ''
    devices.value = []
    stopOnlineTicker()
    onlineDuration.value = ''
    currentUsername.value = ''
    clearTokenCookie()
    clearUsernameCookie()
  } catch (e) {
    ElMessage.error(e?.message || e)
  }
}

async function loadCloudConfig() {
  try {
    const cfg = await apiPost({ type: 'get_cloud_tool' }, { noRetry: true })
    if (cfg) {
      addr.value = cfg.addr || DEFAULT_ADDR
      connected.value = !!cfg.connected
      reconnecting.value = !!cfg.reconnecting
      cloudToolDebug.value = !!cfg.debug
    } else {
      addr.value = DEFAULT_ADDR
    }
  } catch {
    addr.value = DEFAULT_ADDR
  }
}

// 拉取云工具已注册的云函数及参数规则，登录后展示
async function loadCloudFuncs() {
  if (!connected.value) {
    funcs.value = []
    return
  }
  try {
    const res = await apiPost({ type: 'get_cloud_funcs' }, { noRetry: true })
    const infos = res && res.funcs
    funcs.value = infos
      ? Object.keys(infos)
          .filter((name) => name)
          .sort((a, b) => a.localeCompare(b, 'zh'))
          .map((name) => ({ name, rule: infos[name].rule || '', desc: infos[name].desc || '', price: infos[name].price || '' }))
      : []
  } catch {
    funcs.value = []
  }
}

// 拉取当前账号的用户数据占用大小、余额与累计在线秒数，登录后展示并实时计时
async function loadAccountStats() {
  if (!connected.value) {
    dataSize.value = ''
    money.value = ''
    coupon.value = ''
    totalMoney.value = ''
    devices.value = []
    stopOnlineTicker()
    onlineDuration.value = ''
    return
  }
  try {
    const res = await apiPost({ type: 'cloud_account_info', data: {} }, { noRetry: true })
    dataSize.value = typeof res.disk_size === 'number' ? formatBytes(res.disk_size) : ''
    money.value = (typeof res.money === 'string' && res.money) || '0'
    coupon.value = (typeof res.coupon === 'string' && res.coupon) || '0'
    totalMoney.value = (typeof res.total_money === 'string' && res.total_money) || '0'
    devices.value = Array.isArray(res.devices) ? res.devices : []
    const secs = typeof res.online_seconds === 'number' ? res.online_seconds : 0
    startOnlineTicker(secs)
  } catch {
    dataSize.value = ''
    money.value = ''
    coupon.value = ''
    totalMoney.value = ''
    devices.value = []
    stopOnlineTicker()
    onlineDuration.value = ''
  }
}

// 查看账户资金流水（分页，按时间倒序）
async function loadMoneyLogs() {
  if (!connected.value) {
    ElMessage.error('请先登录')
    return
  }
  moneyLogsLoading.value = true
  try {
    const res = await apiPost(
      { type: 'cloud_money_logs', data: { page: moneyLogPage.value, page_size: moneyLogPageSize.value } },
      { noRetry: true }
    )
    moneyLogs.value = res && Array.isArray(res.items) ? res.items : []
    moneyLogTotal.value = res && typeof res.total === 'number' ? res.total : 0
  } catch (e) {
    moneyLogs.value = []
    moneyLogTotal.value = 0
    ElMessage.error(e?.message || e)
  } finally {
    moneyLogsLoading.value = false
  }
}

function openMoneyLogs() {
  moneyLogPage.value = 1
  moneyLogsDialogVisible.value = true
  loadMoneyLogs()
}

// 翻页时重新拉取对应页流水
function moneyLogPageChange(page) {
  moneyLogPage.value = page
  loadMoneyLogs()
}

// 流水金额文案：充值/退款/签到位正，花费/抵扣为负
function moneyLogAmountText(item) {
  const sign = item.type === '花费' || item.type === '抵扣' ? '-' : '+'
  return sign + (item.amount || '0')
}

// 流水金额颜色：花费/抵扣红，充值/退款/签到绿
function moneyLogAmountClass(type) {
  return type === '花费' || type === '抵扣' ? 'money-out' : 'money-in'
}

// 启动在线时长实时计时：以登录时拉取的累计秒数为基准，每秒本地累加并格式化显示。
function startOnlineTicker(baseSeconds) {
  stopOnlineTicker()
  onlineSecondsBase = baseSeconds
  onlineStartAt = Date.now()
  const tick = () => {
    const total = onlineSecondsBase + Math.floor((Date.now() - onlineStartAt) / 1000)
    onlineDuration.value = formatSeconds(total)
  }
  tick()
  onlineTimer = setInterval(tick, 1000)
}

function stopOnlineTicker() {
  if (onlineTimer) {
    clearInterval(onlineTimer)
    onlineTimer = null
  }
}

// 把字节数格式化为人类可读字符串（与服务端云占用一致）。
function formatBytes(n) {
  const unit = 1024
  if (n < unit) return `${n} B`
  let div = unit
  let exp = 0
  for (let m = n / unit; m >= unit; m /= unit) {
    div *= unit
    exp++
  }
  return `${(n / div).toFixed(1)} ${'KMGTPE'[exp]}B`
}

// 把秒数格式化为人类可读时长。
function formatSeconds(total) {
  if (total < 0) total = 0
  if (total < 60) return `${total} 秒`
  if (total < 3600) return `${Math.floor(total / 60)} 分 ${total % 60} 秒`
  if (total < 86400) return `${Math.floor(total / 3600)} 小时 ${Math.floor((total % 3600) / 60)} 分`
  return `${Math.floor(total / 86400)} 天 ${Math.floor((total % 86400) / 3600)} 小时`
}

function handlePush(data) {
  if (!data) return
  if (data.type === 'cloud_tool_status') {
    const c = data.data && data.data.connected
    if (typeof c === 'boolean') {
      connected.value = c
    }
    const r = data.data && data.data.reconnecting
    if (typeof r === 'boolean') {
      reconnecting.value = r
    }
  }
}

onMounted(async () => {
  unsubPush = onPush(handlePush)
  try {
    await loadCloudConfig()
    // 后端已连接则不再 resume，避免每次打开/刷新页面都断开重连一次
    if (connected.value) {
      loadCloudFuncs()
      loadAccountStats()
    } else {
      await resume()
    }
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (unsubPush) unsubPush()
  stopOnlineTicker()
})
</script>

<template>
  <div class="page" v-loading="loading">
    <!-- 顶部：调试开关 + 连接状态 -->
    <div class="top-bar">
      <div class="top-actions">
        <div class="setting-item">
          <span class="setting-label">调试开关</span>
          <ElSwitch :model-value="cloudToolDebug" size="small" @change="saveDebug" />
        </div>
        <div class="status" :class="reconnecting ? 'is-reconnect' : (connected ? 'is-on' : 'is-off')" title="点击编辑服务器地址" @click="editAddr">
          <span class="status-dot"></span>
          <span class="status-text">{{ reconnecting ? '重连中' : (connected ? '已连接' : '未连接') }}</span>
        </div>
      </div>
    </div>

    <!-- 未登录：登录页 -->
    <div v-if="!connected" class="login-page">
      <div class="login-card">
        <ElForm label-position="top" @submit.prevent>
          <ElFormItem label="账号">
            <div class="account-row">
              <ElInput v-model="username" size="large" placeholder="请输入账号" :disabled="reconnecting" @keyup.enter="connect">
                <template #prefix>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </template>
                <template #suffix>
                  <svg class="input-clear" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" @mousedown.prevent="username = ''">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m15 9-6 6" />
                    <path d="m9 9 6 6" />
                  </svg>
                </template>
              </ElInput>
              <ElButton class="random-btn" size="large" text type="primary" @click="randomAccount">随机账号密码</ElButton>
            </div>
          </ElFormItem>

          <ElFormItem label="密码">
            <ElInput v-model="password" type="password" size="large" placeholder="至少 6 位" :disabled="reconnecting" show-password @keyup.enter="connect">
              <template #prefix>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </template>
            </ElInput>
          </ElFormItem>

          <ElButton v-if="reconnecting" class="connect-btn" type="warning" size="large" :loading="interrupting" @click="interruptReconnect">
            中断重连
          </ElButton>
          <ElButton v-else class="connect-btn" type="primary" size="large" :loading="connecting" @click="connect">
            登录
          </ElButton>
        </ElForm>
      </div>
    </div>

    <!-- 已登录：账号面板 -->
    <div v-else class="connected-page">
      <div class="account-actions">
        <ElButton size="small" @click="openMoneyLogs">账户流水</ElButton>
        <ElButton size="small" @click="openChangePwd">修改密码</ElButton>
        <ElButton size="small" @click="openChangeUsername">更改用户名</ElButton>
        <ElButton type="danger" size="small" plain @click="openDeleteAccount">注销账号</ElButton>
        <ElButton type="danger" size="small" @click="logout">退出登录</ElButton>
      </div>
      <div class="account-hero">
        <div class="account-info">
          <div class="account-name">{{ currentUsername }}</div>
          <div class="stat-grid">
            <div class="stat-cell">
              <span class="stat-label">总金额</span>
              <span class="stat-value money">{{ money || '0' }} + {{ coupon || '0' }} = {{ totalMoney || '0' }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">数据占用</span>
              <span class="stat-value">{{ dataSize || '—' }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">在线时长</span>
              <span class="stat-value">{{ onlineDuration || '—' }}</span>
            </div>
            <div class="stat-cell">
              <span class="stat-label">在线设备</span>
              <span class="stat-value" :class="{ dim: devices.length === 0 }" :title="devices.map(d => d.ip).join('、')">{{ devices.length ? devices.length + ' 台' : '无' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">云函数列表</div>
        <ElTable :data="funcs" size="small" border class="funcs-table">
          <ElTableColumn label="云函数" width="180">
            <template #default="{ row }">
              <div class="func-name-cell">
                <ElTag v-if="row.price" type="danger" size="small" effect="plain">扣费 {{ row.price }}</ElTag>
                <span>{{ row.name }}</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="rule" label="参数规则" />
          <ElTableColumn label="说明" min-width="240">
            <template #default="{ row }">
              <div class="func-desc">{{ row.desc }}</div>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </div>

    <ElDialog v-model="pwdDialogVisible" title="修改密码" width="360px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="旧密码">
          <ElInput v-model="oldPassword" type="password" show-password placeholder="请输入旧密码" />
        </ElFormItem>
        <ElFormItem label="新密码">
          <ElInput v-model="newPassword" type="password" show-password placeholder="至少 6 位" />
        </ElFormItem>
        <ElFormItem label="确认新密码">
          <ElInput v-model="confirmPassword" type="password" show-password placeholder="再次输入新密码" @keyup.enter="changePassword" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="pwdDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="changePassword">确认修改</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="renameDialogVisible" title="更改用户名" width="360px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="新用户名">
          <ElInput v-model="renameNewUsername" placeholder="请输入新用户名" />
        </ElFormItem>
        <ElFormItem label="当前密码">
          <ElInput
            v-model="renamePassword"
            type="password"
            show-password
            placeholder="请输入当前密码"
            @keyup.enter="changeUsername"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="renameDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="changeUsername">确认修改</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="deleteDialogVisible" title="注销账号" width="360px">
      <ElForm label-position="top" @submit.prevent>
        <ElAlert type="error" :closable="false" show-icon title="注销后账号与全部数据将被永久清空，且无法恢复" />
        <ElFormItem label="当前密码" style="margin-top: 12px">
          <ElInput
            v-model="deletePassword"
            type="password"
            show-password
            placeholder="请输入当前密码以确认注销"
            @keyup.enter="deleteAccount"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="deleteDialogVisible = false">取消</ElButton>
        <ElButton type="danger" @click="deleteAccount">确认注销</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="moneyLogsDialogVisible" title="账户流水" width="640px">
      <div v-loading="moneyLogsLoading">
        <ElTable :data="moneyLogs" size="small" border max-height="420">
          <ElTableColumn label="类型" width="80">
            <template #default="{ row }">
              <ElTag :type="(row.type === '花费' || row.type === '抵扣') ? 'danger' : 'success'" size="small" effect="plain">{{ row.type }}</ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="金额" width="120">
            <template #default="{ row }">
              <span class="money-amount" :class="moneyLogAmountClass(row.type)">{{ moneyLogAmountText(row) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="balance" label="余额" width="120" />
          <ElTableColumn prop="remark" label="备注" />
          <ElTableColumn prop="created_at" label="时间" width="170" />
        </ElTable>
        <div v-if="!moneyLogsLoading && moneyLogs.length === 0" class="money-empty">暂无流水记录</div>
        <div class="money-pager">
          <ElPagination
            layout="total, prev, pager, next"
            :total="moneyLogTotal"
            :page-size="moneyLogPageSize"
            :current-page="moneyLogPage"
            :hide-on-single-page="true"
            @current-change="moneyLogPageChange"
          />
        </div>
      </div>
      <template #footer>
        <ElButton @click="moneyLogsDialogVisible = false">关闭</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

/* 顶部栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

/* 连接状态 */
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.is-on .status-dot {
  background: var(--el-color-success);
  box-shadow: 0 0 6px var(--el-color-success);
}

.is-reconnect .status-dot {
  background: var(--el-color-warning);
  box-shadow: 0 0 6px var(--el-color-warning);
}

.is-off .status-dot {
  background: var(--el-color-danger);
}

.status-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 登录页 */
.login-page {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.login-card {
  max-width: 480px;
  margin: auto;
}

.connect-btn {
  width: 100%;
  margin-top: 6px;
  font-weight: 600;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.random-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

.input-clear {
  cursor: pointer;
  color: var(--el-text-color-placeholder);
}

.input-clear:hover {
  color: var(--el-text-color-secondary);
}

/* 已登录面板 */
.connected-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.account-hero {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.account-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.account-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--el-text-color-primary);
}

/* 科技感数据面板 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.stat-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 212, 255, 0.14);
  background: rgba(0, 212, 255, 0.05);
  min-width: 0;
}

.stat-label {
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
}

.stat-value {
  font-family: 'Consolas', 'SFMono-Regular', 'Menlo', monospace;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-value.money {
  color: #00d4ff;
  text-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
}

.stat-value.dim {
  color: var(--el-text-color-placeholder);
}

.account-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

/* 设置项 */
.setting-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.setting-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 云函数列表 */
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title::before {
  content: '';
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, #00d4ff, #7850ff);
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
}

.funcs-table {
  max-width: 640px;
}

.func-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 云函数说明：文档形式，保留换行 */
.func-desc {
  white-space: pre-line;
  line-height: 1.6;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 账户流水 */
.money-amount {
  font-family: 'Consolas', 'SFMono-Regular', 'Menlo', monospace;
  font-weight: 600;
}

.money-in {
  color: var(--el-color-success);
}

.money-out {
  color: var(--el-color-danger);
}

.money-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.money-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* 窄屏适配 */
@media (max-width: 640px) {
  .top-bar {
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }
}
</style>
