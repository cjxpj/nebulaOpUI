<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { apiPost, onPush, wsSend } from '@/api.js'

/* ================= 日志状态 ================= */
const logs = ref([])
const autoScroll = ref(true)
const logBoxEl = ref(null)
const hasMore = ref(false)
const loadingMore = ref(false)

// 每页加载的日志行数
const PAGE_SIZE = 300

// 日志级别对应的展示样式
const LEVEL_CLASS = {
  Debug: 'log-debug',
  Info: 'log-info',
  Warning: 'log-warning',
  Error: 'log-error',
}

let unsub = null
let alive = false

function onLog(data) {
  if (data.type !== 'server_log') return
  logs.value.push({ level: data.level || 'Info', line: data.line || '' })
  if (autoScroll.value) {
    nextTick(() => scrollToBottom())
  }
}

// 打开页面时先拉取最近一页日志，再订阅实时推送；更早的日志按需懒加载
async function loadHistory() {
  try {
    const res = await apiPost({ type: 'get_server_logs', data: { limit: PAGE_SIZE, skip: 0 } })
    const list = res?.logs || []
    hasMore.value = !!res?.hasMore
    logs.value = list.map((item) => ({ level: item.level || 'Info', line: item.line || '' }))
    nextTick(() => scrollToBottom())
  } catch (e) {
    console.error('加载历史日志失败', e)
  }
}

// 加载更早的日志，向前插入并保持当前滚动位置
async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  const el = logBoxEl.value
  const prevHeight = el ? el.scrollHeight : 0
  const prevTop = el ? el.scrollTop : 0
  try {
    const res = await apiPost({ type: 'get_server_logs', data: { limit: PAGE_SIZE, skip: logs.value.length } })
    const list = res?.logs || []
    hasMore.value = !!res?.hasMore
    if (list.length) {
      const mapped = list.map((item) => ({ level: item.level || 'Info', line: item.line || '' }))
      logs.value = mapped.concat(logs.value)
    }
    await nextTick()
    if (el) {
      el.scrollTop = el.scrollHeight - prevHeight + prevTop
    }
  } catch (e) {
    console.error('加载更多日志失败', e)
  } finally {
    loadingMore.value = false
  }
}

function scrollToBottom() {
  const el = logBoxEl.value
  if (el) el.scrollTop = el.scrollHeight
}

// 用户上滑查看历史时暂停自动滚动，滚回底部后恢复；接近顶部时自动懒加载更早日志
function onScroll() {
  const el = logBoxEl.value
  if (!el) return
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 10
  if (el.scrollTop < 30) loadMore()
}

function scrollBottom() {
  autoScroll.value = true
  scrollToBottom()
}

async function clearLogs() {
  try {
    await apiPost({ type: 'clear_server_logs' })
  } catch (e) {
    console.error('清空日志失败', e)
  }
  logs.value = []
  hasMore.value = false
}

onMounted(async () => {
  alive = true
  // 通知后端本页面正在查看实时终端：仅在此时后端才推送 server_log。
  // persistent=true：WS 断线重连后自动重发，避免停留在页面时重连导致推送中断
  wsSend({ type: 'sub_server_log' }, { persistent: true }).catch(() => {})
  // 先订阅实时推送，再异步加载历史：
  // 若加载期间离开页面，onBeforeUnmount 已能拿到 unsub 并取消订阅，避免组件销毁后仍在监听
  unsub = onPush(onLog)
  await loadHistory()
  if (!alive) {
    // 加载完成前已离开页面：清空结果，避免展示已销毁组件的数据
    logs.value = []
  }
})

onBeforeUnmount(() => {
  alive = false
  if (unsub) {
    unsub()
    unsub = null
  }
  // 通知后端本页面已离开实时终端，停止推送
  wsSend({ type: 'unsub_server_log' }).catch(() => {})
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">实时终端</h2>
      <p class="page-subtitle">监听终端全部输出，持久化到文件并实时显示</p>
    </div>

    <div class="log-panel">
      <div class="log-toolbar">
        <span class="log-count">共 {{ logs.length }} 条</span>
        <div class="log-actions">
          <ElButton v-if="hasMore" size="small" :loading="loadingMore" @click="loadMore">加载更多历史</ElButton>
          <ElButton v-if="!autoScroll" size="small" @click="scrollBottom">回到底部</ElButton>
          <ElButton size="small" @click="clearLogs">清空</ElButton>
        </div>
      </div>

      <div ref="logBoxEl" class="log-box" @scroll="onScroll">
        <div v-if="!logs.length" class="log-empty">暂无日志，等待服务端输出…</div>
        <div
          v-for="(log, i) in logs"
          :key="i"
          :class="['log-line', LEVEL_CLASS[log.level] || 'log-info']"
        >{{ log.line }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.3px;
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.log-panel {
  display: flex;
  flex-direction: column;
  animation: log-panel-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* 面板弹性入场：轻微缩放 + 上移回弹 */
@keyframes log-panel-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.97);
  }
  60% {
    opacity: 1;
    transform: translateY(-3px) scale(1.005);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.log-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.log-actions {
  display: flex;
  gap: 8px;
}

.log-box {
  height: calc(100vh - 240px);
  min-height: 320px;
  overflow: auto;
  padding: 12px 14px;
  border-radius: 8px;
  background: #0d1117;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.log-line {
  white-space: pre-wrap;
  word-break: break-all;
  animation: log-line-in 0.25s ease-out;
}

/* 新日志行淡入 + 轻微上移 */
@keyframes log-line-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.log-debug {
  color: #8b949e;
}

.log-info {
  color: #c9d1d9;
}

.log-warning {
  color: #d29922;
}

.log-error {
  color: #f85149;
}

.log-empty {
  padding-top: 40px;
  text-align: center;
  color: #8b949e;
}

@media (max-width: 768px) {
  .log-box {
    height: calc(100vh - 220px);
  }
}
</style>
