import { config } from '@/config.js'

function getKey() {
  return localStorage.getItem('nebula_opui_key') || sessionStorage.getItem('nebula_opui_key') || ''
}

/**
 * noRetry: 禁止重试（默认最多 3 次）
 * 仅对 5xx 和网络错误重试，4xx 永不重试
 */
export async function apiPost(data, { noRetry = false } = {}) {
  const maxRetries = noRetry ? 0 : 3
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers = { 'Content-Type': 'application/json' }
      const key = getKey()
      if (key) headers['X-OPUI-Key'] = key

      const res = await fetch(config.apiBaseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const errorText = await res.text()
        const err = new Error(`请求失败: ${res.status} ${errorText}`)
        // 4xx 不重试（认证/参数错误），直接结束循环
        if (res.status >= 400 && res.status < 500) {
          lastError = err
          break
        }
        // 5xx 可重试
        lastError = err
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
        }
        continue
      }

      const text = await res.text()
      try {
        return JSON.parse(text)
      } catch {
        return {}
      }
    } catch (err) {
      // 网络错误（如连接拒绝）可重试
      lastError = err
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw lastError || new Error('API 请求失败')
}
