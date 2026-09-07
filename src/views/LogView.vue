<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { apiPost, onPush, wsSend } from '@/api.js'

/* ================= 日志状态 ================= */
const logs = ref([])
const autoScroll = ref(true)
const logBoxEl = ref(null)
const hasMore = ref(false)
const loadingMore = ref(false)
const inputText = ref('')
const sending = ref(false)
const filterText = ref('')
const inputRef = ref(null)
const historyBoxRef = ref(null)

// 命令历史：记录已执行命令，支持上下键切换
const history = ref([])
// 每条命令的使用次数，用于列表排序与展示
const usageCount = ref({})
let historyIndex = -1
let draft = ''

// 历史列表显示状态：输入框聚焦（触摸）时弹出
const historyVisible = ref(false)

// 历史候选列表：去重后按当前输入前缀过滤，按执行顺序显示（最早在上、最近在下）
const filteredHistory = computed(() => {
  const kw = inputText.value.trim()
  // 保留每条命令最近一次出现的位置
  const lastPos = new Map()
  history.value.forEach((c, i) => {
    if (kw && !c.startsWith(kw)) return
    lastPos.set(c, i)
  })
  return [...lastPos.keys()].sort((a, b) => lastPos.get(a) - lastPos.get(b))
})

/* ================= 命令历史持久化 ================= */
const HISTORY_KEY = 'nebula_terminal_history'
const USAGE_KEY = 'nebula_terminal_usage'

// 从本地存储恢复历史与使用次数，避免刷新浏览器后丢失
function loadHistoryState() {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}')
    if (Array.isArray(h) && h.every((x) => typeof x === 'string')) history.value = h
    if (u && typeof u === 'object' && !Array.isArray(u)) usageCount.value = u
  } catch (e) {
    console.error('加载命令历史失败', e)
  }
}

function saveHistoryState() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
    localStorage.setItem(USAGE_KEY, JSON.stringify(usageCount.value))
  } catch (e) {
    console.error('保存命令历史失败', e)
  }
}

loadHistoryState()

// 当前过滤关键字（保留原始大小写，用于高亮切片）
const filterKeyword = computed(() => filterText.value.trim())

// 过滤后的日志：按纯文本（已剥离 ANSI）大小写不敏感匹配关键字
const filteredLogs = computed(() => {
  const kw = filterKeyword.value.toLowerCase()
  if (!kw) return logs.value
  return logs.value.filter((log) => log.plain.toLowerCase().includes(kw))
})

// 按关键字把文本拆分为若干段，标记命中部分用于高亮
function splitByKeyword(text, kw) {
  if (!kw) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const lowerKw = kw.toLowerCase()
  const parts = []
  let start = 0
  let idx = lower.indexOf(lowerKw, start)
  while (idx !== -1) {
    if (idx > start) parts.push({ text: text.slice(start, idx), hit: false })
    parts.push({ text: text.slice(idx, idx + kw.length), hit: true })
    start = idx + kw.length
    idx = lower.indexOf(lowerKw, start)
  }
  if (start < text.length) parts.push({ text: text.slice(start), hit: false })
  return parts.length ? parts : [{ text, hit: false }]
}

// 过滤关键字变化后回到底部，避免过滤后滚动条停留在中间
watch(filterText, () => {
  autoScroll.value = true
  nextTick(() => scrollToBottom())
})

// 每页加载的日志行数
const PAGE_SIZE = 300

// 实时日志在内存中的最大保留条数：超过后丢弃最旧的行，避免 WebSocket 持续推送导致数组无限增长、渲染卡顿
const MAX_LOGS = 2000

// 日志级别对应的展示样式
const LEVEL_CLASS = {
  Debug: 'log-debug',
  Info: 'log-info',
  Warning: 'log-warning',
  Error: 'log-error',
}

/* ================= ANSI 颜色解析 ================= */
// 标准 16 色终端配色（亮色 / 暗色主题各一套）
const BASE_COLORS = ['#1f2328', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5']
const BRIGHT_COLORS = ['#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff']

function rgb(r, g, b) {
  return `rgb(${Math.max(0, Math.min(255, r | 0))},${Math.max(0, Math.min(255, g | 0))},${Math.max(0, Math.min(255, b | 0))})`
}

// 256 色：前 16 色映射标准调色板，16~231 为 6x6x6 立方体，232~255 为灰度
function ansi256(n) {
  if (n < 16) return n < 8 ? BASE_COLORS[n] : BRIGHT_COLORS[n - 8]
  if (n < 232) {
    const v = [0, 95, 135, 175, 215, 255]
    return rgb(v[Math.floor((n - 16) / 36)], v[Math.floor((n - 16) / 6) % 6], v[(n - 16) % 6])
  }
  return rgb(8 + (n - 232) * 10, 8 + (n - 232) * 10, 8 + (n - 232) * 10)
}

// 将当前 SGR 状态转为 CSS 样式
function ansiStyle(s) {
  const parts = []
  if (s.fg) parts.push('color:' + s.fg)
  if (s.bg) parts.push('background-color:' + s.bg)
  if (s.bold) parts.push('font-weight:700')
  if (s.dim) parts.push('opacity:.7')
  if (s.italic) parts.push('font-style:italic')
  if (s.underline || s.strike) parts.push('text-decoration:' + (s.underline ? 'underline' : '') + (s.underline && s.strike ? ' ' : '') + (s.strike ? 'line-through' : ''))
  return parts.join(';')
}

function applySgr(state, paramsStr) {
  const codes = paramsStr.split(';')
  let i = 0
  while (i < codes.length) {
    const raw = codes[i]
    const code = raw === '' ? 0 : parseInt(raw, 10)
    // 256 色 / 真彩色：38;5;n / 38;2;r;g;b（48 同理为背景）
    if (code === 38 || code === 48) {
      const isFg = code === 38
      if (codes[i + 1] === '5') {
        if (isFg) state.fg = ansi256(parseInt(codes[i + 2], 10))
        else state.bg = ansi256(parseInt(codes[i + 2], 10))
        i += 3
      } else if (codes[i + 1] === '2') {
        const c = rgb(parseInt(codes[i + 2], 10), parseInt(codes[i + 3], 10), parseInt(codes[i + 4], 10))
        if (isFg) state.fg = c
        else state.bg = c
        i += 5
      } else {
        if (isFg) state.fg = null
        else state.bg = null
        i++
      }
      continue
    }
    switch (code) {
      case 0:
        state.bold = state.dim = state.italic = state.underline = state.strike = false
        state.fg = state.bg = null
        break
      case 1: state.bold = true; break
      case 2: state.dim = true; break
      case 3: state.italic = true; break
      case 4: state.underline = true; break
      case 9: state.strike = true; break
      case 21:
      case 22: state.bold = state.dim = false; break
      case 23: state.italic = false; break
      case 24: state.underline = false; break
      case 29: state.strike = false; break
      case 39: state.fg = null; break
      case 49: state.bg = null; break
      default:
        if (code >= 30 && code <= 37) state.fg = BASE_COLORS[code - 30]
        else if (code >= 90 && code <= 97) state.fg = BRIGHT_COLORS[code - 90]
        else if (code >= 40 && code <= 47) state.bg = BASE_COLORS[code - 40]
        else if (code >= 100 && code <= 107) state.bg = BRIGHT_COLORS[code - 100]
        break
    }
    i++
  }
}

// 解析一行中的 ANSI 转义序列，拆分为带样式信息的分段；无法识别/控制类序列直接剥离
function parseAnsi(line) {
  const segs = []
  const state = { bold: false, dim: false, italic: false, underline: false, strike: false, fg: null, bg: null }
  let buf = ''
  let i = 0
  const push = () => {
    if (buf) {
      segs.push({ text: buf, style: ansiStyle(state) })
      buf = ''
    }
  }
  while (i < line.length) {
    const ch = line[i]
    if (ch === '\u001b' && line[i + 1] === '[') {
      // CSI 序列：仅 SGR(以 m 结尾) 影响颜色，其余（光标移动、清屏等）忽略
      push()
      let j = i + 2
      while (j < line.length && !/[@-~]/.test(line[j])) j++
      if (j >= line.length) break
      if (line[j] === 'm') applySgr(state, line.slice(i + 2, j))
      i = j + 1
    } else if (ch === '\u001b') {
      // 其它转义：OSC(ESC ]...BEL/ST) 整段剥离，其余跳过 ESC 与其后一个字符
      push()
      if (line[i + 1] === ']') {
        let j = i + 2
        while (j < line.length && line[j] !== '\u0007' && !(line[j] === '\u001b' && line[j + 1] === '\\')) j++
        i = line[j] === '\u001b' ? j + 2 : j + 1
      } else {
        i += 2
      }
    } else {
      buf += ch
      i++
    }
  }
  push()
  return segs
}

// 还原后端日志折叠的转义字符（\n、\r、\t、\\），让前端多行正常显示
function unescapeControlChars(s) {
  return s.replace(/\\(\\|n|r|t)/g, (m, c) => {
    switch (c) {
      case '\\': return '\\'
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      default: return m
    }
  })
}

// 构造一条日志：line 保留原始文本，segs 为 ANSI 解析后的分段，plain 为剥离 ANSI 后的纯文本
function makeLog(level, line, extra = {}) {
  const text = unescapeControlChars(line)
  const segs = parseAnsi(text)
  return { level, line: text, segs, plain: segs.map((s) => s.text).join(''), ...extra }
}

// 追加一条实时日志并限制内存条数：超出上限时从最旧端裁剪，保持缓冲区有界
function pushLog(log) {
  logs.value.push(log)
  const excess = logs.value.length - MAX_LOGS
  if (excess > 0) {
    logs.value.splice(0, excess)
  }
}

let unsub = null
let alive = false

function onLog(data) {
  if (data.type !== 'server_log') return
  pushLog(makeLog(data.level || 'Info', data.line || ''))
  if (autoScroll.value) {
    nextTick(() => smoothScrollToBottom())
  }
}

// 打开页面时先拉取最近一页日志，再订阅实时推送；更早的日志按需懒加载
async function loadHistory() {
  try {
    const res = await apiPost({ type: 'get_server_logs', data: { limit: PAGE_SIZE, skip: 0 } })
    const list = res?.logs || []
    hasMore.value = !!res?.hasMore
    logs.value = list.map((item) => makeLog(item.level || 'Info', item.line || ''))
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
      const mapped = list.map((item) => makeLog(item.level || 'Info', item.line || ''))
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

let scrollAnim = null

// 直接定位到底部（用于初次加载历史，无需动画）
function scrollToBottom() {
  const el = logBoxEl.value
  if (el) el.scrollTop = el.scrollHeight
}

// 平滑滚动到底部：自实现逐帧动画，内容动态变化时每帧重新计算目标，
// 避免原生 behavior:'smooth' 在内容高频变化时被浏览器取消导致不动。
function smoothScrollToBottom() {
  const el = logBoxEl.value
  if (!el) return
  if (scrollAnim) cancelAnimationFrame(scrollAnim)

  const start = el.scrollTop
  const target = el.scrollHeight - el.clientHeight
  const dist = target - start
  if (dist <= 0) return
  // 内容暴涨（批量插入）时直接定位，避免动画长时间追不上
  if (dist > el.clientHeight) {
    el.scrollTop = target
    return
  }

  const t0 = performance.now()
  const duration = 200
  const step = (now) => {
    const cur = logBoxEl.value
    if (!cur) return
    const p = Math.min(1, (now - t0) / duration)
    const eased = 1 - (1 - p) * (1 - p) * (1 - p)
    const curTarget = cur.scrollHeight - cur.clientHeight
    cur.scrollTop = start + (curTarget - start) * eased
    if (p < 1) scrollAnim = requestAnimationFrame(step)
    else scrollAnim = null
  }
  scrollAnim = requestAnimationFrame(step)
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
  smoothScrollToBottom()
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

// 复制文本到剪贴板：优先用异步 Clipboard API；在非安全上下文（HTTP 局域网访问）
// 或 API 不可用/被拒时，回退到临时 textarea + execCommand('copy')，保证复制可用
async function copyTextToClipboard(text) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) {
      // 继续走下方兜底方案
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  const selection = document.getSelection()
  const prevRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch (e) {
    ok = false
  }
  document.body.removeChild(ta)
  if (prevRange && selection) {
    selection.removeAllRanges()
    selection.addRange(prevRange)
  }
  return ok
}

// 复制单条日志：取解析后的可见文本（已剥离 ANSI 转义与颜色）
async function copyLog(log) {
  try {
    const ok = await copyTextToClipboard(log.plain)
    if (!ok) throw new Error('copy failed')
    ElMessage.success('已复制')
  } catch (e) {
    console.error('复制失败:', e)
    ElMessage.error('复制失败')
  }
}

// 上键：切换到更早的一条命令；首次进入历史时暂存当前未发送内容
function historyUp() {
  if (!history.value.length) return
  if (historyIndex === -1) {
    draft = inputText.value
    historyIndex = history.value.length - 1
  } else if (historyIndex > 0) {
    historyIndex--
  }
  inputText.value = history.value[historyIndex]
}

// 下键：切换到更晚的一条命令；越界后回到未发送草稿
function historyDown() {
  if (historyIndex === -1) return
  if (historyIndex < history.value.length - 1) {
    historyIndex++
    inputText.value = history.value[historyIndex]
  } else {
    historyIndex = -1
    inputText.value = draft
    draft = ''
  }
}

function openHistory() {
  historyVisible.value = true
  // 打开时滚动到底部，让最近的命令（列表最下方）可见
  nextTick(() => {
    const el = historyBoxRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function closeHistory() {
  historyVisible.value = false
}

// 点击历史列表项：填入输入框并收起列表
function pickHistory(cmd) {
  inputText.value = cmd
  historyIndex = -1
  draft = ''
  historyVisible.value = false
}

// 发送终端输入：本地回显命令，交给后端执行，输出经 server_log 实时回推
async function sendInput() {
  const text = inputText.value.trim()
  if (!text || sending.value) return
  // 记录命令历史，连续相同命令去重；同时累计使用次数
  if (history.value[history.value.length - 1] !== text) history.value.push(text)
  usageCount.value[text] = (usageCount.value[text] || 0) + 1
  saveHistoryState()
  historyIndex = -1
  draft = ''
  pushLog(makeLog('Info', '> ' + text, { command: true }))
  if (autoScroll.value) nextTick(() => smoothScrollToBottom())
  inputText.value = ''
  // 执行后让输入框失去焦点，收起触摸键盘/列表
  inputRef.value?.blur()
  sending.value = true
  try {
    await apiPost({ type: 'terminal_input', data: { input: text } }, { noRetry: true })
  } catch (e) {
    pushLog(makeLog('Error', '[终端] 命令发送失败: ' + String(e?.message || e)))
    if (autoScroll.value) nextTick(() => smoothScrollToBottom())
  } finally {
    sending.value = false
  }
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
  if (scrollAnim) {
    cancelAnimationFrame(scrollAnim)
    scrollAnim = null
  }
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
    <div class="log-panel">
      <div class="log-toolbar">
        <span class="log-count">共 {{ filteredLogs.length }}{{ filterText ? ' / ' + logs.length : '' }} 条</span>
        <div class="log-toolbar-right">
          <ElInput
            v-model="filterText"
            class="log-filter"
            size="small"
            placeholder="过滤日志"
            clearable
          />
          <div class="log-actions">
            <ElButton v-if="hasMore" size="small" :loading="loadingMore" @click="loadMore">加载更多历史</ElButton>
            <ElButton v-if="!autoScroll" size="small" @click="scrollBottom">回到底部</ElButton>
            <ElButton size="small" @click="clearLogs">清空</ElButton>
          </div>
        </div>
      </div>

      <div ref="logBoxEl" class="log-box" @scroll="onScroll">
        <div v-if="!logs.length" class="log-empty">暂无日志，等待服务端输出…</div>
        <div v-else-if="!filteredLogs.length" class="log-empty">无匹配日志</div>
        <div v-for="(log, i) in filteredLogs" :key="i" class="log-item">
          <div
            :class="['log-line', log.command ? 'log-command' : (LEVEL_CLASS[log.level] || 'log-info')]"
          ><template v-for="(seg, si) in log.segs" :key="si"><span
              v-for="(part, pi) in splitByKeyword(seg.text, filterKeyword)"
              :key="pi"
              :class="{ 'log-hit': part.hit }"
              :style="seg.style"
            >{{ part.text }}</span></template></div>
          <ElButton class="log-copy" size="small" text @click="copyLog(log)">复制</ElButton>
        </div>
      </div>

      <div class="log-input">
        <div class="log-input-wrap">
          <ElInput
            ref="inputRef"
            v-model="inputText"
            class="log-input-field"
            placeholder="输入命令，回车执行"
            :disabled="sending"
            @focus="openHistory"
            @blur="closeHistory"
            @keyup.enter="sendInput"
            @keydown.up.prevent="historyUp"
            @keydown.down.prevent="historyDown"
          />
          <transition name="el-fade-in">
            <div v-if="historyVisible && filteredHistory.length" ref="historyBoxRef" class="log-history">
              <div
                v-for="(cmd, i) in filteredHistory"
                :key="i"
                class="log-history-item"
                @pointerdown.prevent="pickHistory(cmd)"
              >
                <span class="log-history-cmd">{{ cmd }}</span>
                <span class="log-history-count">{{ usageCount[cmd] }}次</span>
              </div>
            </div>
          </transition>
        </div>
        <ElButton size="small" type="primary" :loading="sending" @click="sendInput">执行</ElButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.log-panel {
  flex: 1;
  min-height: 0;
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

.log-toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.log-filter {
  width: 200px;
}

.log-actions {
  display: flex;
  gap: 8px;
}

.log-box {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
  border-radius: 8px;
  background: #0d1117;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 8px;
  margin-bottom: 4px;
  border: 1px solid #21262d;
  border-radius: 6px;
  background: #161b22;
  transition: border-color 0.15s, background 0.15s;
}

.log-item:hover {
  border-color: #30363d;
  background: #1c2128;
}

.log-line {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-all;
  animation: log-line-in 0.25s ease-out;
}

.log-hit {
  background: rgba(88, 166, 255, 0.4);
  border-radius: 2px;
}

.log-copy {
  flex-shrink: 0;
  height: auto;
  padding: 0;
  line-height: 1.6;
  font-size: 12px;
  color: #8b949e;
  opacity: 0;
  transition: opacity 0.15s;
}

.log-item:hover .log-copy {
  opacity: 1;
}

/* 触屏设备无 hover，复制按钮始终可见 */
@media (hover: none) {
  .log-copy {
    opacity: 1;
  }
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

.log-input {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.log-input-wrap {
  flex: 1;
  position: relative;
}

.log-input-field {
  width: 100%;
}

.log-history {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  max-height: 112px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid #30363d;
  border-radius: 8px;
  background: #161b22;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  z-index: 20;
}

.log-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  color: #c9d1d9;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.log-history-cmd {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-history-count {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 8px;
  background: #21262d;
  color: #8b949e;
  font-size: 11px;
  line-height: 1.6;
}

.log-history-item:hover {
  background: #1f6feb;
  color: #fff;
}

.log-history-item:hover .log-history-count {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.log-command {
  color: #58a6ff;
}


</style>
