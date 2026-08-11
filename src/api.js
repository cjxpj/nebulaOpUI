import { config } from './config.js'

let ws = null
let msgId = 0
const pendingRequests = new Map() // id -> { resolve, reject, timer }
let reconnectTimer = null
let reconnectCount = 0
const MAX_RECONNECT = 5
const pushListeners = new Set()
let unauthHandler = null
let wsAuthenticated = false // 当前 WS 连接是否已通过密钥验证
let lastMessageTime = 0 // 上次收到消息的时间戳，用于心跳检测
let heartbeatTimer = null // 心跳 ping 定时器
let heartbeatCheckTimer = null // 心跳检测定时器

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

function getWsUrl() {
  // 开发环境使用配置的完整 API 地址，生产环境使用当前页面地址（同源部署）
  const isFullUrl = config.apiBaseUrl.startsWith('http://') || config.apiBaseUrl.startsWith('https://')
  const baseUrl = isFullUrl ? config.apiBaseUrl : window.location.href
  const apiUrl = new URL(baseUrl)
  const wsProto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsBase = wsProto + '//' + apiUrl.host + apiUrl.pathname.replace(/\/+$/, '')
  return wsBase + '/ws'
}

function ensureConnected() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN && wsAuthenticated) {
      resolve()
      return
    }

    // 正在连接中，等待
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      const currentWs = ws
      const check = setInterval(() => {
        // 使用 currentWs 而非 ws，避免 ws 被 onclose 置 null 后访问报错
        if (currentWs.readyState === WebSocket.OPEN) {
          // 如果已认证（或无密钥需要认证），立即 resolve
          if (wsAuthenticated || !getKey()) {
            clearInterval(check)
            resolve()
          }
          // 否则等待 onopen 中的认证完成（onopen 会调用 resolve）
        } else if (currentWs.readyState === WebSocket.CLOSED) {
          clearInterval(check)
          reject(new Error('WebSocket connection failed'))
        }
      }, 50)
      setTimeout(() => {
        clearInterval(check)
        currentWs?.close() // 超时后关闭旧连接，后续重试会新建
        reject(new Error('WebSocket connection timeout'))
      }, 5000)
      return
    }

    // 需要新建连接 —— 先清理旧连接，防止旧 onclose 闭包将新 ws 置 null
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.close()
      ws = null
    }

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
        reconnectCount = 0 // 连接成功，重置重连计数
        // 连接内认证：不在 URL 传密钥，改为连接后发送 check_opui_key 消息验证
        const storedKey = getKey()
        if (storedKey) {
          const authId = String(++msgId)
          const authTimer = setTimeout(() => {
            pendingRequests.delete(authId)
            wsAuthenticated = false
            reject(new Error('认证超时'))
          }, 5000)
          pendingRequests.set(authId, {
            resolve: (data) => {
              clearTimeout(authTimer)
              if (data && data.valid) {
                wsAuthenticated = true
                startHeartbeat()
                resolve()
              } else {
                wsAuthenticated = false
                reject(new Error('密钥验证失败'))
              }
            },
            reject: (err) => {
              clearTimeout(authTimer)
              wsAuthenticated = false
              reject(err)
            },
            timer: authTimer,
          })
          ws.send(JSON.stringify({ id: authId, type: 'check_opui_key', data: { key: storedKey } }))
        } else {
          wsAuthenticated = false
          startHeartbeat()
          resolve()
        }
      }

      ws.onclose = () => {
        stopHeartbeat()
        wsAuthenticated = false
        ws = null
        // 拒绝所有等待中的 API 请求
        for (const [id, { reject: rej, timer }] of pendingRequests) {
          clearTimeout(timer)
          pendingRequests.delete(id)
          rej(new Error('WebSocket disconnected'))
        }
        // 关键：如果 onopen 还没触发，确保 ensureConnected 的 Promise 被 reject，
        // 否则 apiPost 会永久挂起，且 scheduleReconnect 的 catch 永远不触发，重连机制瘫痪
        reject(new Error('WebSocket connection closed'))
        scheduleReconnect()
      }

      ws.onerror = () => {
        // onerror 后浏览器会立即触发 onclose，由 onclose 统一处理 reject + 重连
        ws?.close()
      }
    } catch (e) {
      reject(e)
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
      }
      wsAuthenticated = false
      scheduleReconnect()
    }
  }, 15000)
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectCount++
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
 * 通过 HTTP fetch 发送 API 请求（短连接，适合高频轮询，不占用 WebSocket）
 */
export async function apiFetch(data) {
  const key = getKey()
  const baseUrl = config.apiBaseUrl.replace(/\/+$/, '')
  const resp = await fetch(baseUrl + '/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-Nebula-Key': key } : {}),
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
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
}
