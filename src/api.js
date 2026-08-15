import { config } from './config.js'

let ws = null
let connectingPromise = null // 进行中的连接建立+认证过程，复用避免并发重复建连
let msgId = 0
const pendingRequests = new Map() // id -> { resolve, reject, timer }
let reconnectTimer = null
let reconnectCount = 0
const MAX_RECONNECT = 5
const pushListeners = new Set()
const persistentSends = new Map() // type -> data：连接成功后自动重发的单向消息（页面级订阅）
let unauthHandler = null
let wsAuthenticated = false // 当前 WS 连接是否已通过密钥验证
let lastMessageTime = 0 // 上次收到消息的时间戳，用于心跳检测
let heartbeatTimer = null // 心跳 ping 定时器
let heartbeatCheckTimer = null // 心跳检测定时器

// 需要手动填写 WS 地址的反向代理域名（按访问路径推导的默认 WS 地址可能连不上，需直连局域网服务器）
const WS_ADDRESS_REQUIRE_HOST = 'nebulaopui.cjxpj.com'
const WS_ADDRESS_STORAGE_KEY = 'nebula_opui_ws_address'
let wsAddressRequiredHandler = null
let wsAddressPrompted = false // 本次页面加载是否已提示过，避免重复弹窗

/**
 * 注册"需要填写 WS 地址"回调：特殊域名下 WS 连接失败时触发
 */
export function onWsAddressRequired(fn) {
  wsAddressRequiredHandler = fn
}

// 已保存的自定义 WS 地址（完整 ws://wss:// 地址，或 / 开头的路径）
export function getStoredWsAddress() {
  return localStorage.getItem(WS_ADDRESS_STORAGE_KEY) || ''
}

// 保存/清除自定义 WS 地址（保存后重置提示标记，允许重新校验）
export function saveWsAddress(address) {
  let p = (address || '').trim().replace(/\/+$/, '')
  if (p) {
    // 服务端 WS 固定挂载在访问路径下的 /ws，地址未以 /ws 结尾时自动补全
    if (!/\/ws$/i.test(p)) {
      p += '/ws'
    }
    localStorage.setItem(WS_ADDRESS_STORAGE_KEY, p)
  } else {
    localStorage.removeItem(WS_ADDRESS_STORAGE_KEY)
  }
  wsAddressPrompted = false
}

// 默认 WS 连接地址（本地开发/局域网直连场景，保存时自动补全 /ws）
export const DEFAULT_WS_ADDRESS = 'ws://127.0.0.1:8080/nebula'

// WS 连接状态（是否已建立连接）
let wsStatusHandler = null
export function getWsConnected() {
  return !!(ws && ws.readyState === WebSocket.OPEN)
}
export function onWsStatusChange(fn) {
  wsStatusHandler = fn
  if (fn) fn(getWsConnected())
}

// 当前是否处于需要手动填写 WS 地址的域名
function isWsAddressRequired() {
  const host = window.location.hostname
  return host === WS_ADDRESS_REQUIRE_HOST || host.endsWith('.' + WS_ADDRESS_REQUIRE_HOST)
}

/**
 * 注册未认证回调（API 返回 unauthorized 或 WS 重连次数耗尽时触发）
 */
export function onUnauthorized(fn) {
  unauthHandler = fn
}

function handleUnauthorized() {
  disconnect()
  sessionStorage.removeItem('nebula_opui_key')
  localStorage.removeItem('nebula_opui_key')
  if (unauthHandler) unauthHandler()
}

function getKey() {
  return localStorage.getItem('nebula_opui_key') || sessionStorage.getItem('nebula_opui_key') || ''
}

// 访问路径基础地址（协议 + host + 访问路径，不含末尾斜杠）
// 生产环境同源部署：通过页面访问路径推导，天然适配自定义域名/反向代理/访问路径变更；
// 仅开发环境（Vite dev server 与后端不同源）才使用 VITE_API_BASE_URL 配置的完整地址
function getApiBase() {
  const isFullUrl = config.apiBaseUrl.startsWith('http://') || config.apiBaseUrl.startsWith('https://')
  const apiUrl = new URL(isFullUrl ? config.apiBaseUrl : window.location.href)
  return apiUrl.origin + apiUrl.pathname.replace(/\/+$/, '')
}

// WS 连接地址：优先使用手动填写的 WS 地址（支持完整 ws://wss:// 地址直连局域网服务器，
// 或 / 开头的路径拼在当前访问域名下）；否则通过访问路径定义，服务端固定挂载在访问路径下的 /ws
function getWsUrl() {
  const stored = getStoredWsAddress()
  if (stored) {
    // 完整地址（如 ws://127.0.0.1:8080/nebula/ws）直接使用
    if (/^wss?:\/\//.test(stored)) {
      return stored
    }
    // 路径则拼在当前访问域名下
    const apiUrl = new URL(window.location.href)
    const wsProto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    return wsProto + '//' + apiUrl.host + (stored.startsWith('/') ? stored : '/' + stored)
  }
  const isFullUrl = config.apiBaseUrl.startsWith('http://') || config.apiBaseUrl.startsWith('https://')
  const apiUrl = new URL(isFullUrl ? config.apiBaseUrl : window.location.href)
  const wsProto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  return wsProto + '//' + apiUrl.host + apiUrl.pathname.replace(/\/+$/, '') + '/ws'
}

function ensureConnected() {
  // 已建立且已认证，直接返回
  if (ws && ws.readyState === WebSocket.OPEN && wsAuthenticated) {
    return Promise.resolve()
  }
  // 无密钥时无需认证，连接已打开即可
  if (ws && ws.readyState === WebSocket.OPEN && !getKey()) {
    return Promise.resolve()
  }
  // 复用进行中的连接过程，避免并发调用重复建连 / 认证中误判为需要新建
  if (connectingPromise) {
    return connectingPromise
  }
  const p = doConnect()
  connectingPromise = p
  p.then(
    () => { if (connectingPromise === p) connectingPromise = null },
    () => { if (connectingPromise === p) connectingPromise = null }
  )
  return p
}

function doConnect() {
  return new Promise((resolve, reject) => {
    // 先清理旧连接，防止旧 onclose 闭包将新 ws 置 null
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.close()
      ws = null
    }

    let settled = false
    let connectTimer = null
    const settle = (fn, val) => {
      if (settled) return
      settled = true
      if (connectTimer) clearTimeout(connectTimer)
      fn(val)
    }

    // 连接建立超时（仅覆盖 CONNECTING 阶段，onopen 时清除）
    connectTimer = setTimeout(() => {
      settle(reject, new Error('WebSocket connection timeout'))
      if (ws) {
        ws.onclose = null
        ws.onerror = null
        ws.close()
        ws = null
      }
    }, 5000)

    try {
      ws = new WebSocket(getWsUrl())

      ws.onmessage = (event) => {
        lastMessageTime = Date.now()
        try {
          const data = JSON.parse(event.data)
          // 将响应处理推至下一个 macrotask，解耦消息接收与业务处理
          // 避免 res() 触发的 Vue 响应式微任务链阻塞后续 onmessage 事件
          if (data.id) {
            setTimeout(() => {
              const entry = pendingRequests.get(data.id)
              if (entry) {
                clearTimeout(entry.timer)
                pendingRequests.delete(data.id)
                entry.resolve(data.data)
              }
            }, 0)
          } else {
            // 服务端推送（无 id），如 login_event、online_update
            setTimeout(() => {
              for (const cb of pushListeners) {
                try { cb(data) } catch (e) { /* ignore */ }
              }
            }, 0)
          }
        } catch (e) { /* ignore */ }
      }

      ws.onopen = () => {
        clearTimeout(connectTimer) // 连接已建立，取消连接建立超时
        reconnectCount = 0 // 连接成功，重置重连计数
        wsStatusHandler?.(getWsConnected())
        // 连接内认证：不在 URL 传密钥，改为连接后发送 check_opui_key 消息验证
        const storedKey = getKey()
        if (storedKey) {
          const authId = String(++msgId)
          const authTimer = setTimeout(() => {
            pendingRequests.delete(authId)
            wsAuthenticated = false
            settle(reject, new Error('认证超时'))
            if (ws) ws.close() // 关闭未认证连接，触发 onclose 清理 + 重连
          }, 5000)
          pendingRequests.set(authId, {
            resolve: (data) => {
              clearTimeout(authTimer)
              if (data && data.valid) {
                wsAuthenticated = true
                startHeartbeat()
                resendPersistentSends()
                settle(resolve)
              } else {
                wsAuthenticated = false
                settle(reject, new Error('密钥验证失败'))
              }
            },
            reject: (err) => {
              clearTimeout(authTimer)
              wsAuthenticated = false
              settle(reject, err)
            },
            timer: authTimer,
          })
          ws.send(JSON.stringify({ id: authId, type: 'check_opui_key', data: { key: storedKey } }))
        } else {
          wsAuthenticated = false
          startHeartbeat()
          resendPersistentSends()
          settle(resolve)
        }
      }

      ws.onclose = () => {
        stopHeartbeat()
        wsAuthenticated = false
        ws = null
        wsStatusHandler?.(getWsConnected())
        // 拒绝所有等待中的 API 请求
        for (const [id, { reject: rej, timer }] of pendingRequests) {
          clearTimeout(timer)
          pendingRequests.delete(id)
          rej(new Error('WebSocket disconnected'))
        }
        // 关键：如果 onopen 还没触发，确保连接 Promise 被 reject，
        // 否则 apiPost 会永久挂起，且 scheduleReconnect 的 catch 永远不触发，重连机制瘫痪
        settle(reject, new Error('WebSocket connection closed'))
        scheduleReconnect()
      }

      ws.onerror = () => {
        // onerror 后浏览器会立即触发 onclose，由 onclose 统一处理 reject + 重连
        ws?.close()
      }
    } catch (e) {
      settle(reject, e)
    }
  })
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (heartbeatCheckTimer) {
    clearInterval(heartbeatCheckTimer)
    heartbeatCheckTimer = null
  }
}

function startHeartbeat() {
  stopHeartbeat()
  lastMessageTime = Date.now()

  // 每 30 秒发送一次应用层 ping，确保连接双向活跃
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ id: String(++msgId), type: 'ping' }))
      } catch (e) { /* ignore */ }
    }
  }, 30000)

  // 每 15 秒检查一次：若超过 60 秒未收到任何消息，判定连接已死，主动断开触发重连
  heartbeatCheckTimer = setInterval(() => {
    if (Date.now() - lastMessageTime > 60000) {
      stopHeartbeat()
      if (ws) {
        ws.onclose = null // 阻止 onclose 再次触发 stopHeartbeat + scheduleReconnect
        ws.close()
        ws = null
        wsStatusHandler?.(getWsConnected())
      }
      wsAuthenticated = false
      scheduleReconnect()
    }
  }, 15000)
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectCount++
  // 特殊域名下 WS 连接失败：提示手动填写 WS 地址（本次加载仅提示一次）
  if (!wsAddressPrompted && isWsAddressRequired() && wsAddressRequiredHandler) {
    wsAddressPrompted = true
    wsAddressRequiredHandler()
  }
  if (reconnectCount >= MAX_RECONNECT) {
    handleUnauthorized()
    return
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    ensureConnected().catch(() => {
      scheduleReconnect() // 重连失败，继续尝试
    })
  }, 3000)
}

/**
 * 注册服务端推送回调（如 login_event、online_update 通知）
 * 返回取消监听的函数
 */
export function onPush(callback) {
  pushListeners.add(callback)
  return () => pushListeners.delete(callback)
}

/**
 * 发送单向 WebSocket 消息（不等待响应），如订阅/取消订阅事件推送。
 * 连接未就绪时自动等待建立。
 * @param {{type: string, data?: object}} data
 * @param {{persistent?: boolean}} opts persistent=true 时该消息在每次连接成功（认证完成）后自动重发，
 *        适用于页面级订阅（如实时终端），避免 WS 断线重连后订阅丢失；发送同 type 的非持久消息即可取消注册
 */
export function wsSend(data, { persistent = false } = {}) {
  if (persistent) {
    persistentSends.set(data.type, data)
  } else {
    persistentSends.delete(data.type)
  }
  return sendRaw(data)
}

async function sendRaw(data) {
  await ensureConnected()
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: String(++msgId), type: data.type, data: data.data || {} }))
  }
}

// 连接认证完成后重发所有持久订阅，恢复页面级订阅状态（如实时终端）
function resendPersistentSends() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  for (const data of persistentSends.values()) {
    try {
      ws.send(JSON.stringify({ id: String(++msgId), type: data.type, data: data.data || {} }))
    } catch (e) { /* ignore */ }
  }
}

/**
 * 通过 HTTP fetch 发送 API 请求（短连接，适合高频轮询，不占用 WebSocket）
 */
export async function apiFetch(data) {
  const key = getKey()
  const resp = await fetch(getApiBase() + '/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-OPUI-Key': key } : {}),
    },
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(text || `HTTP ${resp.status}`)
  }
  const result = await resp.json()
  if (result && result.status === 'error') {
    if (result.error === 'unauthorized') {
      handleUnauthorized()
    }
    throw new Error(result.error || 'API error')
  }
  return result.data !== undefined ? result.data : result
}

/**
 * 通过 WebSocket 发送 API 请求
 * 兼容原 HTTP POST 接口：apiPost({ type, data }, { noRetry }?)
 */
export async function apiPost(data, { noRetry = false } = {}) {
  const maxRetries = noRetry ? 0 : 3
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await ensureConnected()
      // ensureConnected 返回后 ws 可能已被 onclose 置 null，校验后再发送
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket disconnected')
      }

      const id = String(++msgId)
      const respData = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }, 15000)
        pendingRequests.set(id, { resolve, reject, timer })
        ws.send(JSON.stringify({ id, type: data.type, data: data.data }))
      })

      // 处理业务错误（如 unauthorized）
      if (respData && respData.status === 'error') {
        if (respData.error === 'unauthorized') {
          handleUnauthorized()
        }
        const err = new Error(respData.error || 'API error')
        if (!noRetry && attempt < maxRetries) {
          lastError = err
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
          continue
        }
        throw err
      }

      return respData
    } catch (err) {
      // 连接/超时错误可重试
      lastError = err
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw lastError || new Error('API 请求失败')
}

/**
 * 断开 WebSocket 连接（登出时调用）
 */
export function disconnect() {
  stopHeartbeat()
  wsAuthenticated = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (connectingPromise) {
    connectingPromise = null
  }
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
  wsStatusHandler?.(getWsConnected())
}
