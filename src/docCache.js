// 模块级缓存：登录后首次加载文档，后续访问直接使用缓存，重新登录后清空
let cachedDocHtml = null

export function getCachedDocHtml() {
  return cachedDocHtml
}

export function setCachedDocHtml(html) {
  cachedDocHtml = html
}

export function clearDocCache() {
  cachedDocHtml = null
}
