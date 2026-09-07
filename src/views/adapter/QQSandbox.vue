<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } from 'vue'
import { ChatDotRound, Delete, Setting, Close, Picture } from '@element-plus/icons-vue'
// Monaco 编辑器与 nebula 语言高亮/补全（与词库调试页共用）
import { monaco, loadDicFuncs } from '@/monacoNebula.js'
import { apiPost } from '@/api.js'
// 沙箱对话 Markdown 渲染（html:false 防 XSS，breaks 让单换行生效）
import MarkdownIt from 'markdown-it'
// LaTeX 数学公式：markdown-it-texmath 解析 $...$ / $$...$$，交由 KaTeX 渲染
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { sandboxInject } from './qqSandboxShared.js'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
md.use(texmath, { engine: katex, delimiters: 'dollars', katexOptions: { throwOnError: false } })

function renderMd(content) {
  try {
    return md.render(String(content ?? ''))
  } catch {
    return String(content ?? '')
  }
}

/* ================= 主题 ================= */
const isDarkMode = inject('isDarkMode')

/* ================= 机器人配置（自定义，无需选择实例） ================= */
// sandboxBotForm 为已应用配置（驱动 sandboxInstance），sandboxBotDraft 为弹窗编辑草稿
const sandboxBotForm = ref({ name: '', avatar: '', dic: '' })
const sandboxBotDraft = ref({ name: '', avatar: '', dic: '' })
const sandboxBotPopover = ref(false)
const SANDBOX_BOT_KEY = 'qq_sandbox_bot'

// 词库路径作为稳定标识：隔离聊天记录 / 用户配置 / 编辑器状态
const sectionKey = computed(() => {
  const dic = (sandboxBotForm.value.dic || '').trim().replace(/^\/+|\/+$/g, '')
  return dic || 'default'
})

// 当前沙箱机器人（由已应用配置派生，词库/聊天均基于它）
const sandboxInstance = computed(() => {
  const dic = (sandboxBotForm.value.dic || '').trim()
  if (!dic) return null
  return {
    section: sectionKey.value,
    dic,
    bot_name: (sandboxBotForm.value.name || '').trim(),
    bot_avatar: (sandboxBotForm.value.avatar || '').trim(),
  }
})

// 打开配置弹窗时，把已应用配置同步到草稿（避免编辑途中影响已加载状态）
function openSandboxBotPopover() {
  sandboxBotDraft.value = { ...sandboxBotForm.value }
}

// 载入上次自定义的机器人配置：注入实例 > localStorage > 默认
function loadSandboxBot() {
  const injected = sandboxInject.value
  if (injected && (injected.dic || injected.bot_name || injected.remark)) {
    sandboxBotForm.value = {
      name: injected.bot_name || injected.remark || '',
      avatar: injected.bot_avatar || '',
      dic: injected.dic || 'private/bot/qq',
    }
    sandboxInject.value = null
    sandboxBotDraft.value = { ...sandboxBotForm.value }
    persistSandboxBot()
    return
  }
  try {
    const raw = localStorage.getItem(SANDBOX_BOT_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      sandboxBotForm.value = {
        name: saved.name ?? '',
        avatar: saved.avatar ?? '',
        dic: saved.dic || 'private/bot/qq',
      }
      sandboxBotDraft.value = { ...sandboxBotForm.value }
      return
    }
  } catch { /* 忽略非法存储 */ }
  sandboxBotForm.value = { name: '', avatar: '', dic: 'private/bot/qq' }
  sandboxBotDraft.value = { ...sandboxBotForm.value }
}

// 仅持久化机器人配置（不触发重新加载）
function persistSandboxBot() {
  try {
    localStorage.setItem(SANDBOX_BOT_KEY, JSON.stringify(sandboxBotForm.value))
  } catch { /* 忽略 */ }
}

/* ================= 沙箱测试 ================= */
const sandboxFiles = ref([])
const sandboxFile = ref('')
const sandboxContent = ref('')
const sandboxLoading = ref(false)
const sandboxSaving = ref(false)
const sandboxLoadedFor = ref('')
const sandboxDirty = ref(false)

const chatLogs = reactive({ group: [], private: [] })
const chatSending = ref(false)
const chatMessagesEl = ref(null)
const chatInputEl = ref(null)
const chatImageInput = ref(null)
const sandboxEditorEl = ref(null)

const replyTarget = ref(null)

const contextMenu = ref({ visible: false, x: 0, y: 0, msg: null })

// 自动保存：编辑停顿 1 秒后自动写盘
const sandboxAutoSave = ref(true)
const AUTO_SAVE_DEBOUNCE = 1000
let sandboxAutoSaveTimer = null

/* ================= 沙箱对话用户配置 ================= */
// 模拟来源：group 群聊 / private 群私聊（#私聊# 触发词）
const sandboxMode = ref('group')
// 当前模式的聊天记录（切换群聊/私聊时展示各自的历史）
const chatMessages = computed(() => chatLogs[sandboxMode.value] || [])
// 自定义模拟用户（按实例存 localStorage）
const sandboxUserForm = ref({ name: '我', avatar: '', id: 'sandbox_user', group_id: 'sandbox_group' })
const sandboxUserPopover = ref(false)
const SANDBOX_USER_KEY_PREFIX = 'qq_sandbox_user_'

const sandboxUserName = computed(() => {
  const n = (sandboxUserForm.value.name || '').trim()
  return n || '我'
})

const sandboxUserAvatar = computed(() => {
  return (sandboxUserForm.value.avatar || '').trim()
})

const sandboxBotName = computed(() => (sandboxBotForm.value.name || '').trim() || '机器人')

const sandboxBotAvatar = computed(() => (sandboxBotForm.value.avatar || '').trim())

function loadSandboxUser() {
  const inst = sandboxInstance.value
  const key = SANDBOX_USER_KEY_PREFIX + (inst?.section || '')
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const saved = JSON.parse(raw)
      sandboxUserForm.value = {
        name: saved.name || '我',
        avatar: saved.avatar || '',
        id: saved.id || 'sandbox_user',
        group_id: saved.group_id || 'sandbox_group',
      }
      sandboxMode.value = saved.mode === 'private' ? 'private' : 'group'
      return
    }
  } catch { /* 忽略非法存储 */ }
  sandboxUserForm.value = { name: '我', avatar: '', id: 'sandbox_user', group_id: 'sandbox_group' }
  sandboxMode.value = 'group'
}

function saveSandboxUser() {
  const inst = sandboxInstance.value
  localStorage.setItem(SANDBOX_USER_KEY_PREFIX + (inst?.section || ''), JSON.stringify({
    ...sandboxUserForm.value,
    mode: sandboxMode.value,
  }))
  sandboxUserPopover.value = false
  ElMessage.success('用户配置已保存')
}

/* ================= 沙箱聊天记录保留 ================= */
// 聊天记录按「实例 + 模式」存 localStorage：切换实例、关闭沙箱、刷新页面后仍保留
const SANDBOX_CHAT_KEY_PREFIX = 'qq_sandbox_chat_'

function sandboxChatKey(mode) {
  const inst = sandboxInstance.value
  return SANDBOX_CHAT_KEY_PREFIX + (inst?.section || '') + '_' + mode
}

function loadSandboxChat(mode) {
  try {
    const raw = localStorage.getItem(sandboxChatKey(mode))
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) return list
    }
  } catch { /* 忽略非法存储 */ }
  return []
}

// 聊天记录变化即持久化（含清空后的空记录）
watch(chatLogs, () => {
  if (!sandboxInstance.value?.section) return
  for (const mode of ['group', 'private']) {
    try {
      localStorage.setItem(sandboxChatKey(mode), JSON.stringify(chatLogs[mode] || []))
    } catch { /* 存储失败静默忽略 */ }
  }
}, { deep: true })

// 清空当前模式的聊天记录（二次确认）
async function clearSandboxChat() {
  const log = chatLogs[sandboxMode.value]
  if (!log || !log.length) return
  try {
    await ElMessageBox.confirm('确定要清空当前聊天记录吗？此操作不可恢复。', '清空聊天记录', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }
  log.splice(0, log.length)
  ElMessage.success('聊天记录已清空')
}

// 群聊/私聊切换即时持久化（用户配置弹层保存时也会写入）
watch(sandboxMode, () => {
  const inst = sandboxInstance.value
  if (!inst?.section) return
  localStorage.setItem(SANDBOX_USER_KEY_PREFIX + inst.section, JSON.stringify({
    ...sandboxUserForm.value,
    mode: sandboxMode.value,
  }))
})

// 切换群聊/私聊后滚到各自聊天记录底部
watch(sandboxMode, () => {
  nextTick(scrollChatToBottom)
})

// 头像兜底字符：用户取昵称首字（默认「我」），机器人取名称首字
function avatarLetter(m) {
  if (m && m.role === 'user') {
    const n = sandboxUserName.value
    return [...n][0] || '我'
  }
  const n = sandboxBotName.value
  return [...n][0] || '机'
}

async function scrollChatToBottom() {
  await nextTick()
  if (chatMessagesEl.value) {
    chatMessagesEl.value.scrollTop = chatMessagesEl.value.scrollHeight
  }
}

// 还原词库 ±atMsg=消息ID± 引用回复：按 msg_id 在聊天记录中查找被引用的消息
function chatReply(m) {
  if (!m.msgId) return null
  return chatMessages.value.find(x => x !== m && x.id === m.msgId) || null
}

// 被引用消息的气泡缩略文案
function replyPreview(m) {
  if (!m) return ''
  const hasImg = m.type === 'image'
    || (m.images && m.images.length)
    || (m.segments && m.segments.some(s => s.type === 'image'))
  const t = (m.content || '').replace(/\s+/g, ' ').trim()
  if (hasImg) {
    return t ? '[图片] ' + (t.length > 40 ? t.slice(0, 40) + '…' : t) : '[图片]'
  }
  if (m.type === 'video') return '[视频]'
  if (m.type === 'voice') return '[语音]'
  return t.length > 40 ? t.slice(0, 40) + '…' : t
}

// 混排消息是否含文本：含文本则文本与图片共用气泡；纯图片则独立展示
function segmentHasText(m) {
  return !!(m.segments && m.segments.some(s => s.type === 'text' && s.content && s.content.trim()))
}

/* ================= 右键回复 ================= */
// 机器人消息本地唯一 ID（用户消息 id 由后端返回，机器人消息无后端 id，本地生成供引用）
let botMsgSeq = 0
function botMsgId() {
  return 'bot_' + Date.now().toString(36) + '_' + (botMsgSeq++)
}

// 右键消息：弹出「回复」菜单
function onMsgContextMenu(e, m) {
  if (!m || !m.id) return
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, msg: m }
}

// 菜单点击「回复」
function replyToMsg() {
  const m = contextMenu.value.msg
  contextMenu.value.visible = false
  if (!m || !m.id) return
  replyTarget.value = m
  nextTick(() => chatInputEl.value && chatInputEl.value.focus())
}

// 取消回复
function cancelReply() {
  replyTarget.value = null
}

// 关闭右键菜单（点击其它区域）
function closeContextMenu() {
  if (contextMenu.value.visible) contextMenu.value.visible = false
}

function sandboxDicDir() {
  const inst = sandboxInstance.value
  if (!inst || !inst.dic) return ''
  return (inst.dic || '').replace(/^\/+|\/+$/g, '') + '/dic'
}

async function loadSandboxFiles() {
  const dir = sandboxDicDir()
  sandboxLoading.value = true
  try {
    const data = await apiPost({ type: 'get_dic_list', data: { path: dir } })
    sandboxFiles.value = (data.entries || []).filter(e => !e.dir)
    sandboxLoadedFor.value = sandboxInstance.value ? sandboxInstance.value.section : ''
    // 优先恢复上次打开的词库文件，否则打开列表第一个
    const saved = loadSandboxEditorState()
    const target = saved?.file && sandboxFiles.value.some(f => f.path === saved.file)
      ? saved.file
      : (sandboxFiles.value[0]?.path || '')
    if (target) await openSandboxFile(target)
    else { sandboxFile.value = ''; setEditorValue('') }
  } catch (e) {
    console.warn('加载词库列表失败:', e)
    ElMessage.error('加载词库列表失败')
  } finally {
    sandboxLoading.value = false
  }
}

async function openSandboxFile(path) {
  // 切换文件前立即保存旧文件的滚动/光标（实时保存已兜底，此处保证切换瞬间不丢）
  if (sandboxFile.value && sandboxFile.value !== path) saveSandboxEditorState()
  sandboxLoading.value = true
  try {
    const data = await apiPost({ type: 'dic_get_content', data: { path } })
    sandboxFile.value = path
    setEditorValue((data && data.content) || '')
    sandboxDirty.value = false
    await nextTick()
    restoreSandboxEditorState(path)
  } catch (e) {
    ElMessage.error('读取词库失败: ' + (e.message || '未知错误'))
  } finally {
    sandboxLoading.value = false
  }
}

async function saveSandboxFile() {
  if (!sandboxFile.value) return ElMessage.warning('请先选择词库文件')
  sandboxSaving.value = true
  try {
    await apiPost({ type: 'dic_save_content', data: { path: sandboxFile.value, content: sandboxContent.value } })
    sandboxDirty.value = false
    ElMessage.success('词库已保存')
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    sandboxSaving.value = false
  }
}

/* ================= 沙箱 Monaco 编辑器 ================= */
let sandboxEditor = null
let sandboxSuppressChange = false
// 编辑器状态（词库文件 + 滚动位置 + 光标位置），按词库路径存 localStorage
const SANDBOX_EDITOR_KEY_PREFIX = 'qq_sandbox_editor_'

function createSandboxEditor() {
  if (sandboxEditor || !sandboxEditorEl.value) return
  sandboxEditor = monaco.editor.create(sandboxEditorEl.value, {
    value: sandboxContent.value,
    language: 'nebula',
    theme: isDarkMode.value ? 'nebula-dark' : 'nebula-light',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
    lineNumbers: 'on',
    folding: true,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 4,
    insertSpaces: false,
    roundedSelection: false,
    renderWhitespace: 'selection',
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    padding: { top: 8, bottom: 8 },
    quickSuggestions: false,
    suggestOnTriggerCharacters: true,
    inlineSuggest: { enabled: true },
    fixedOverflowWidgets: true,
  })
  sandboxEditor.onDidChangeModelContent(() => {
    if (sandboxSuppressChange) return
    sandboxContent.value = sandboxEditor.getValue()
    sandboxDirty.value = true
    scheduleSandboxAutoSave()
  })
  // 记录滚动/光标位置（实时写盘，供重新打开时还原）
  sandboxEditor.onDidScrollChange(() => saveSandboxEditorState())
  sandboxEditor.onDidChangeCursorPosition(() => saveSandboxEditorState())
  // Ctrl/Cmd + S 保存词库
  sandboxEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveSandboxFile())
}

function setEditorValue(text) {
  sandboxContent.value = text
  if (sandboxEditor) {
    sandboxSuppressChange = true
    sandboxEditor.setValue(text)
    sandboxSuppressChange = false
  }
}

// 编辑停顿后自动写入词库文件（不弹提示）
function scheduleSandboxAutoSave() {
  clearTimeout(sandboxAutoSaveTimer)
  if (!sandboxAutoSave.value) return
  const path = sandboxFile.value
  if (!path) return
  sandboxAutoSaveTimer = setTimeout(async () => {
    if (path === sandboxFile.value && sandboxDirty.value) {
      try {
        await apiPost({ type: 'dic_save_content', data: { path, content: sandboxContent.value } })
        sandboxDirty.value = false
      } catch (e) {
        // 自动保存失败不打扰用户，继续编辑会再次触发重试
        console.warn('沙箱自动保存失败:', e)
      }
    }
  }, AUTO_SAVE_DEBOUNCE)
}

/* ================= 沙箱编辑器状态持久化（文件 + 滚动 + 光标） ================= */
function saveSandboxEditorState(section) {
  if (!sandboxEditor) return
  const key = section || sandboxInstance.value?.section
  if (!key) return
  const pos = sandboxEditor.getPosition()
  const state = {
    file: sandboxFile.value || '',
    scrollTop: sandboxEditor.getScrollTop(),
    scrollLeft: sandboxEditor.getScrollLeft(),
    cursor: pos ? { lineNumber: pos.lineNumber, column: pos.column } : null,
  }
  try { localStorage.setItem(SANDBOX_EDITOR_KEY_PREFIX + key, JSON.stringify(state)) } catch { /* 忽略 */ }
}

function loadSandboxEditorState() {
  const section = sandboxInstance.value?.section
  if (!section) return null
  try {
    const raw = localStorage.getItem(SANDBOX_EDITOR_KEY_PREFIX + section)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// 打开词库文件后，还原该文件上次的滚动/光标位置
function restoreSandboxEditorState(path) {
  if (!sandboxEditor) return
  const state = loadSandboxEditorState()
  if (!state || state.file !== path) return
  if (state.cursor) sandboxEditor.setPosition(state.cursor)
  if (typeof state.scrollTop === 'number') sandboxEditor.setScrollTop(state.scrollTop)
  if (typeof state.scrollLeft === 'number') sandboxEditor.setScrollLeft(state.scrollLeft)
}

// 主题切换时同步编辑器主题
watch(isDarkMode, (dark) => {
  sandboxEditor?.updateOptions({ theme: dark ? 'nebula-dark' : 'nebula-light' })
})

/* ================= 机器人配置应用与初始化 ================= */
// 上次已应用的词库标识，用于切换词库时把旧编辑器状态存回旧 key
let lastSectionKey = ''

// 应用当前自定义机器人配置：重置状态、加载聊天记录与词库
async function applySandbox() {
  const inst = sandboxInstance.value
  if (!inst) return
  // 切换词库前保存旧配置的滚动/光标，并冲掉旧配置的自动保存
  if (lastSectionKey && lastSectionKey !== inst.section) {
    clearTimeout(sandboxAutoSaveTimer)
    saveSandboxEditorState(lastSectionKey)
  }
  lastSectionKey = inst.section
  sandboxLoadedFor.value = ''
  sandboxFiles.value = []
  sandboxFile.value = ''
  setEditorValue('')
  // 加载该词库群聊/私聊的聊天记录（历史记录按词库隔离）
  chatLogs.group = loadSandboxChat('group')
  chatLogs.private = loadSandboxChat('private')
  sandboxDirty.value = false
  loadDicFuncs()
  await nextTick()
  createSandboxEditor()
  clearEditor()
  loadSandboxUser()
  loadSandboxFiles()
  // 加载历史聊天记录后滚到最底部（最新消息）
  scrollChatToBottom()
}

// 机器人配置「保存并加载」：校验词库路径、持久化，词库路径变化时才重新加载
function saveSandboxBot() {
  const dic = (sandboxBotDraft.value.dic || '').trim()
  if (!dic) {
    sandboxBotPopover.value = false
    return ElMessage.warning('请填写词库路径')
  }
  const newKey = dic.replace(/^\/+|\/+$/g, '') || 'default'
  const dicChanged = sectionKey.value !== newKey
  sandboxBotForm.value = {
    name: (sandboxBotDraft.value.name || '').trim(),
    avatar: (sandboxBotDraft.value.avatar || '').trim(),
    dic,
  }
  persistSandboxBot()
  sandboxBotPopover.value = false
  if (dicChanged) {
    applySandbox()
  } else {
    ElMessage.success('机器人配置已保存')
  }
}

// 机器人配置重置为默认
function resetSandboxBot() {
  sandboxBotDraft.value = { name: '', avatar: '', dic: 'private/bot/qq' }
}

// 输入框 Ctrl/Cmd + Enter 快捷发送；普通 Enter 换行
function onChatKeydown(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    sendChat()
  }
}

/* ================= 输入区图片（选图 + 粘贴，支持文本任意位置） ================= */
function clearEditor() {
  if (chatInputEl.value) chatInputEl.value.innerHTML = ''
}

// 打开系统选图器
function pickImage() {
  chatImageInput.value && chatImageInput.value.click()
}

// 选图后插入到光标位置
function onImageChange(e) {
  const files = Array.from(e.target.files || [])
  for (const file of files) {
    if (!file || !file.type.startsWith('image/')) continue
    const reader = new FileReader()
    reader.onload = () => insertImageAtCursor(reader.result)
    reader.readAsDataURL(file)
  }
  e.target.value = '' // 允许重复选择同一文件
}

// 粘贴：剪贴板含图片时插入到光标位置，否则走默认文本粘贴
function onChatPaste(e) {
  const files = []
  if (e.clipboardData && e.clipboardData.items) {
    for (const it of e.clipboardData.items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) files.push(f)
      }
    }
  }
  if (!files.length) return
  e.preventDefault()
  for (const file of files) {
    const reader = new FileReader()
    reader.onload = () => insertImageAtCursor(reader.result)
    reader.readAsDataURL(file)
  }
}

// 把图片插入到 contenteditable 光标位置，并在其后补零宽空格以便继续输入
function insertImageAtCursor(dataURL) {
  const el = chatInputEl.value
  if (!el) return
  el.focus()
  const img = document.createElement('img')
  img.src = dataURL
  img.className = 'chat-editor-img'
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(img)
    const space = document.createTextNode('\u200B')
    range.setStartAfter(img)
    range.insertNode(space)
    range.setStartAfter(space)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  } else {
    el.appendChild(img)
  }
}

// 解析编辑器 DOM 为有序的文本/图片段
function getEditorSegments() {
  const el = chatInputEl.value
  if (!el) return []
  const BLOCK = new Set(['DIV', 'P', 'LI'])
  const segs = []
  const walk = (node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        const t = child.nodeValue || ''
        if (t) segs.push({ type: 'text', content: t })
      } else if (child.nodeType === 1) {
        const tag = child.tagName
        if (tag === 'IMG') {
          const src = child.getAttribute('src') || ''
          if (src) segs.push({ type: 'image', content: src })
        } else if (tag === 'BR') {
          segs.push({ type: 'text', content: '\n' })
        } else {
          walk(child)
          if (BLOCK.has(tag)) segs.push({ type: 'text', content: '\n' })
        }
      }
    }
  }
  walk(el)
  // 合并相邻文本段
  const merged = []
  for (const s of segs) {
    const last = merged[merged.length - 1]
    if (last && last.type === 'text' && s.type === 'text') {
      last.content += s.content
    } else {
      merged.push(s)
    }
  }
  return merged
}

async function sendChat() {
  const segments = getEditorSegments()
  const images = segments.filter(s => s.type === 'image').map(s => s.content)
  const msg = segments
    .filter(s => s.type === 'text')
    .map(s => s.content)
    .join('')
    .replace(/\u200B/g, '')
    .trim()
  if ((!msg && !images.length) || chatSending.value) return
  const inst = sandboxInstance.value
  if (!inst || !inst.section) return ElMessage.warning('请先配置词库路径')
  // 锁定发送时的模式：请求期间切换群聊/私聊，回复仍写入原模式记录
  const mode = sandboxMode.value
  const log = chatLogs[mode] || chatLogs.group
  const isPrivate = mode === 'private'
  const userMsg = {
    role: 'user',
    content: msg,
    name: sandboxUserName.value,
    avatar: sandboxUserAvatar.value,
  }
  if (images.length) {
    // 展示用混排段：清理零宽空格与空白文本段，保留图片与文本顺序
    userMsg.segments = segments
      .map(s => (s.type === 'image' ? s : { type: 'text', content: s.content.replace(/\u200B/g, '') }))
      .filter(s => s.type === 'image' || s.content !== '')
  }
  log.push(userMsg)
  // 记录回复目标：发送后清空（无论成败）
  const replyId = replyTarget.value ? replyTarget.value.id : ''
  replyTarget.value = null
  clearEditor()
  chatSending.value = true
  scrollChatToBottom()
  try {
    const data = await apiPost({
      type: 'qq_sandbox_run',
      data: {
        dic: inst.dic,
        msg,
        private: isPrivate,
        reply_id: replyId,
        group_id: sandboxUserForm.value.group_id,
        images,
        user: { id: sandboxUserForm.value.id, name: sandboxUserName.value },
      },
    })
    // 记录后端生成的模拟消息 ID，机器人回复携带的 msg_id 可据此还原引用回复
    if (data && data.msg_id) userMsg.id = data.msg_id
    // 词库回复为空时不发送任何消息（也不提示无回复）
    for (const m of data.messages || []) {
      log.push({
        role: 'bot',
        content: m.content || '',
        type: m.type,
        msgId: m.msg_id || '',
        id: botMsgId(),
        name: sandboxBotName.value,
        avatar: sandboxBotAvatar.value,
      })
    }
  } catch (e) {
    log.push({
      role: 'bot',
      content: '请求失败: ' + (e.message || '未知错误'),
      name: sandboxBotName.value,
      avatar: sandboxBotAvatar.value,
    })
  } finally {
    chatSending.value = false
    scrollChatToBottom()
  }
}

/* ================= 生命周期 ================= */
onMounted(async () => {
  window.addEventListener('click', closeContextMenu)
  loadSandboxBot()
  await applySandbox()
})

onBeforeUnmount(() => {
  clearTimeout(sandboxAutoSaveTimer)
  // 刷新/离开页面前保存当前滚动与光标
  saveSandboxEditorState()
  sandboxEditor?.dispose()
  sandboxEditor = null
  window.removeEventListener('click', closeContextMenu)
})
</script>

<template>
  <div class="sandbox-page">
    <div class="sandbox-page-header">
      <div class="sandbox-page-title">
        <el-icon><ChatDotRound /></el-icon>
        <span>沙箱测试</span>
        <ElPopover v-model:visible="sandboxBotPopover" placement="bottom-start" :width="300" trigger="click" @show="openSandboxBotPopover">
          <template #reference>
            <ElButton size="small" :icon="Setting" class="sandbox-bot-btn">机器人配置</ElButton>
          </template>
          <div class="sandbox-user-form">
            <div class="sandbox-user-row">
              <span class="label">名称</span>
              <ElInput v-model="sandboxBotDraft.name" size="small" placeholder="默认：机器人" />
            </div>
            <div class="sandbox-user-row">
              <span class="label">头像</span>
              <ElInput v-model="sandboxBotDraft.avatar" size="small" placeholder="头像图片 URL（可空）" />
            </div>
            <div class="sandbox-user-row">
              <span class="label">词库</span>
              <ElInput v-model="sandboxBotDraft.dic" size="small" placeholder="词库路径，如 private/bot/qq" />
            </div>
            <div class="sandbox-user-actions">
              <ElButton size="small" @click="resetSandboxBot">重置</ElButton>
              <ElButton type="primary" size="small" @click="saveSandboxBot">保存并加载</ElButton>
            </div>
          </div>
        </ElPopover>
      </div>
    </div>

    <!-- 未配置词库路径 -->
    <div v-if="!sandboxInstance" class="sandbox-empty">
      请点击「机器人配置」填写词库路径后开始测试
    </div>

    <!-- 沙箱主体 -->
    <div v-else class="sandbox-panel" v-loading="sandboxLoading">
      <div class="sandbox-left">
        <div class="sandbox-file-list">
          <div class="sandbox-file-title">词库文件</div>
          <div
            v-for="f in sandboxFiles"
            :key="f.path"
            class="sandbox-file-item"
            :class="{ active: f.path === sandboxFile }"
            @click="openSandboxFile(f.path)"
          >{{ f.name }}</div>
          <div v-if="sandboxFiles.length === 0" class="sandbox-file-empty">无词库文件</div>
        </div>
        <div ref="sandboxEditorEl" class="sandbox-editor"></div>
        <div class="sandbox-editor-actions">
          <span class="sandbox-file-name">{{ sandboxFile || '未选择文件' }}</span>
          <div class="sandbox-auto-save">
            <span>自动保存</span>
            <ElSwitch v-model="sandboxAutoSave" size="small" />
          </div>
          <ElButton type="primary" size="small" :loading="sandboxSaving" @click="saveSandboxFile">
            保存词库
          </ElButton>
        </div>
      </div>
      <div class="sandbox-right">
        <div class="chat-toolbar">
          <ElRadioGroup v-model="sandboxMode" size="small">
            <ElRadioButton value="group">群聊</ElRadioButton>
            <ElRadioButton value="private">私聊</ElRadioButton>
          </ElRadioGroup>
          <div class="chat-toolbar-right">
            <ElButton
              size="small"
              text
              type="danger"
              :icon="Delete"
              :disabled="!chatMessages.length"
              title="清空当前聊天记录"
              @click="clearSandboxChat"
            >
              清空
            </ElButton>
            <ElPopover v-model:visible="sandboxUserPopover" placement="bottom-end" :width="280" trigger="click">
              <template #reference>
                <ElButton size="small" :icon="Setting">用户配置</ElButton>
              </template>
              <div class="sandbox-user-form">
                <div class="sandbox-user-row">
                  <span class="label">昵称</span>
                  <ElInput v-model="sandboxUserForm.name" size="small" placeholder="默认：我" />
                </div>
                <div class="sandbox-user-row">
                  <span class="label">头像</span>
                  <ElInput v-model="sandboxUserForm.avatar" size="small" placeholder="头像图片 URL（可空）" />
                </div>
                <div class="sandbox-user-row">
                  <span class="label">QQ号</span>
                  <ElInput v-model="sandboxUserForm.id" size="small" placeholder="写入词库变量 QQ/qq" />
                </div>
                <div class="sandbox-user-row">
                  <span class="label">群号</span>
                  <ElInput v-model="sandboxUserForm.group_id" size="small" placeholder="写入词库变量 群号" />
                </div>
                <div class="sandbox-user-actions">
                  <ElButton size="small" @click="sandboxUserForm = { name: '我', avatar: '', id: 'sandbox_user', group_id: 'sandbox_group' }">
                    重置
                  </ElButton>
                  <ElButton type="primary" size="small" @click="saveSandboxUser">保存</ElButton>
                </div>
              </div>
            </ElPopover>
          </div>
        </div>
        <div class="chat-messages" ref="chatMessagesEl">
          <div
            v-for="(m, i) in chatMessages"
            :key="i"
            class="chat-msg"
            :class="m.role"
            @contextmenu.prevent="onMsgContextMenu($event, m)"
          >
            <div class="chat-avatar">
              <img v-if="m.avatar" :src="m.avatar" alt="" @error="m.avatar = ''" />
              <span v-else class="chat-avatar-letter">{{ avatarLetter(m) }}</span>
            </div>
            <div class="chat-body">
              <div class="chat-name">{{ m.name || (m.role === 'user' ? '我' : '机器人') }}</div>
              <!-- 用户混排消息（文本+图片按粘贴顺序） -->
              <template v-if="m.segments && m.segments.length">
                <!-- 纯图片：独立展示，不带气泡 -->
                <template v-if="!segmentHasText(m)">
                  <template v-for="(seg, si) in m.segments" :key="si">
                    <img v-if="seg.type === 'image' && seg.content" :src="seg.content" class="chat-img" alt="" />
                  </template>
                </template>
                <!-- 文本+图片：整体一个气泡，图片内嵌限制高宽 -->
                <div v-else class="chat-bubble">
                  <template v-for="(seg, si) in m.segments" :key="si">
                    <img v-if="seg.type === 'image' && seg.content" :src="seg.content" class="chat-segment-img" alt="" />
                    <template v-else-if="seg.type === 'text'">{{ seg.content }}</template>
                  </template>
                </div>
              </template>
              <!-- 其它消息（机器人富媒体 / 旧用户图片+文本） -->
              <template v-else>
                <div v-if="m.images && m.images.length" class="chat-imgs">
                  <img v-for="(src, idx) in m.images" :key="idx" :src="src" class="chat-img" alt="" />
                </div>
                <div
                  v-if="!(m.images && m.images.length && !m.content)"
                  class="chat-bubble"
                  :class="{ 'chat-bubble-media': m.type === 'image' || m.type === 'video' }"
                >
                  <div v-if="m.msgId && chatReply(m)" class="chat-reply">
                    <span class="chat-reply-name">{{ chatReply(m).name || '引用' }}</span>
                    <span class="chat-reply-text">{{ replyPreview(chatReply(m)) }}</span>
                  </div>
                  <img v-if="m.type === 'image' && m.content" :src="m.content" class="chat-img" alt="" />
                  <div v-else-if="m.type === 'markdown' && m.content" class="chat-md" v-html="renderMd(m.content)"></div>
                  <template v-else-if="m.type === 'video'">[视频消息]</template>
                  <template v-else-if="m.type === 'voice'">[语音消息]</template>
                  <template v-else-if="m.type === 'media'">[富媒体消息]{{ m.content ? ' ' + m.content : '' }}</template>
                  <template v-else>{{ m.content }}</template>
                </div>
              </template>
            </div>
          </div>
          <div v-if="chatSending" class="chat-msg bot">
            <div class="chat-avatar">
              <img v-if="sandboxBotAvatar" :src="sandboxBotAvatar" alt="" />
              <span v-else class="chat-avatar-letter">{{ avatarLetter({ role: 'bot' }) }}</span>
            </div>
            <div class="chat-body">
              <div class="chat-name">{{ sandboxBotName }}</div>
              <div class="chat-bubble chat-loading">回复中…</div>
            </div>
          </div>
          <div v-if="chatMessages.length === 0 && !chatSending" class="chat-empty">
            输入消息与机器人对话测试
          </div>
        </div>
        <div class="chat-input">
          <input ref="chatImageInput" type="file" accept="image/*" multiple style="display:none" @change="onImageChange" />
          <div v-if="replyTarget" class="chat-reply-bar">
            <span class="chat-reply-bar-icon">↩</span>
            <span class="chat-reply-bar-name">回复 {{ replyTarget.name || (replyTarget.role === 'user' ? '我' : '机器人') }}</span>
            <span class="chat-reply-bar-text">{{ replyPreview(replyTarget) }}</span>
            <ElButton text :icon="Close" class="chat-reply-bar-close" @click="cancelReply" />
          </div>
          <ElButton text :icon="Picture" title="发送图片" @click="pickImage" />
          <div
            ref="chatInputEl"
            class="chat-editor"
            contenteditable="true"
            data-placeholder="输入测试消息，Ctrl+Enter 发送，可粘贴图片"
            @keydown.enter="onChatKeydown"
            @paste="onChatPaste"
          ></div>
          <ElButton type="primary" :loading="chatSending" @click="sendChat">发送</ElButton>
        </div>
      </div>
    </div>

    <!-- 右键消息上下文菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="chat-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="chat-context-item" @click="replyToMsg">
          <el-icon><ChatDotRound /></el-icon>
          <span>回复</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ========== 沙箱测试页面 ========== */
.sandbox-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 160px);
  min-height: 460px;
  box-sizing: border-box;
}

.sandbox-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 300px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.sandbox-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.sandbox-page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.sandbox-bot-btn {
  margin-left: 6px;
}

.sandbox-panel {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.sandbox-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sandbox-file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.sandbox-file-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: 2px;
}

.sandbox-file-item {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  background: var(--el-fill-color-light);
  border: 1px solid transparent;
  transition: all 0.15s;
  color: var(--el-text-color-regular);
}

.sandbox-file-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.sandbox-file-item.active {
  background: var(--el-color-primary);
  color: #fff;
}

.sandbox-file-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.sandbox-editor {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.sandbox-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sandbox-auto-save {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sandbox-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sandbox-right {
  width: 440px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.chat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.chat-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

/* 用户消息靠右：row-reverse 下主轴起点在右侧，需用 flex-start 才能推到右边 */
.chat-msg.user {
  flex-direction: row-reverse;
}

.chat-msg.bot {
  flex-direction: row;
}

.chat-avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
}

.chat-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-avatar-letter {
  font-size: 15px;
  color: var(--el-color-primary);
  font-weight: 600;
}

.chat-msg.user .chat-avatar {
  background: var(--el-color-primary-light-8);
}

.chat-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  max-width: 82%;
}

.chat-msg.user .chat-body {
  align-items: flex-end;
}

.chat-name {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding: 0 4px;
}

/* 引用回复（±atMsg=消息ID± 还原）：内嵌在气泡顶部，与被引用消息内容融为一体 */
.chat-reply {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  padding: 3px 8px;
  border-left: 3px solid var(--el-color-primary-light-5);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  margin-bottom: 6px;
}

/* 媒体气泡去掉了内边距，引用条需自带外边距 */
.chat-bubble-media .chat-reply {
  margin: 6px;
}

.chat-reply-name {
  flex-shrink: 0;
  color: var(--el-color-primary);
}

.chat-reply-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 输入框上方的「回复 xx」提示条 */
.chat-reply-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 6px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.chat-reply-bar-icon {
  color: var(--el-color-primary);
}

.chat-reply-bar-name {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--el-color-primary);
}

.chat-reply-bar-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--el-text-color-secondary);
}

.chat-reply-bar-close {
  flex-shrink: 0;
  padding: 0;
}

/* 右键消息上下文菜单 */
.chat-context-menu {
  position: fixed;
  z-index: 3000;
  min-width: 120px;
  padding: 4px;
  border-radius: 8px;
  background: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-light);
  border: 1px solid var(--el-border-color-lighter);
}

.chat-context-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: background 0.15s;
}

.chat-context-item:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.chat-bubble {
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 气泡内嵌图片/视频：去掉内边距与背景，让媒体直接展示 */
.chat-bubble-media {
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  overflow: hidden;
}

/* 气泡内嵌图片（沙箱捕获的 data URL） */
.chat-img {
  display: block;
  max-width: 240px;
  max-height: 240px;
  border-radius: 8px;
  object-fit: contain;
  cursor: pointer;
}

/* 文本+图片混排：图片单独一行显示并限制高宽 */
.chat-segment-img {
  display: block;
  max-width: 160px;
  max-height: 160px;
  border-radius: 6px;
  margin: 4px 0;
}

/* 用户发送的多张图片（气泡外独立展示，靠右对齐） */
.chat-imgs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

/* contenteditable 输入区 */
.chat-editor {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  max-height: 120px;
  overflow-y: auto;
  padding: 6px 11px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
}

.chat-editor:focus {
  border-color: var(--el-color-primary);
}

/* 空输入框占位提示 */
.chat-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--el-text-color-placeholder);
  pointer-events: none;
}

/* 输入区内的图片（粘贴/选图后内嵌，动态创建需 :deep 穿透 scoped，与发送后的混排图片等大） */
:deep(.chat-editor-img) {
  max-width: 160px;
  max-height: 160px;
  vertical-align: middle;
  border-radius: 4px;
  margin: 0 2px;
}

/* Markdown 消息渲染（$发送MD$ 捕获的正文） */
.chat-md {
  white-space: normal;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
}

.chat-md > :first-child {
  margin-top: 0;
}

.chat-md > :last-child {
  margin-bottom: 0;
}

.chat-md h1,
.chat-md h2,
.chat-md h3 {
  margin: 8px 0 6px;
  font-weight: 600;
  line-height: 1.4;
}

.chat-md h1 {
  font-size: 17px;
}

.chat-md h2 {
  font-size: 15px;
}

.chat-md h3 {
  font-size: 14px;
}

.chat-md p {
  margin: 4px 0;
}

.chat-md ul,
.chat-md ol {
  margin: 4px 0;
  padding-left: 20px;
}

.chat-md li {
  margin: 2px 0;
}

.chat-md a {
  color: var(--el-color-primary);
  word-break: break-all;
}

.chat-md code {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--el-fill-color-dark);
  font-family: Consolas, 'Courier New', monospace;
}

.chat-md pre {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  background: var(--el-fill-color-dark);
}

.chat-md pre code {
  padding: 0;
  background: transparent;
}

.chat-md blockquote {
  margin: 6px 0;
  padding: 2px 10px;
  border-left: 3px solid var(--el-color-primary-light-5);
  color: var(--el-text-color-secondary);
}

.chat-md hr {
  margin: 8px 0;
  border: none;
  border-top: 1px solid var(--el-border-color-lighter);
}

.chat-md img {
  max-width: 220px;
  max-height: 160px;
  border-radius: 6px;
}

/* LaTeX 公式（markdown-it-texmath 渲染的 <eq>/<eqn> 经 v-html 注入，需 :deep 穿透 scoped） */
.chat-md :deep(eq) {
  display: inline-block;
}

.chat-md :deep(eqn) {
  display: block;
}

.chat-md :deep(.katex) {
  font-size: 1.1em;
}

.chat-md :deep(.katex-display) {
  margin: 6px 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0;
}

.chat-msg.user .chat-bubble {
  background: var(--el-color-primary);
  color: #fff;
  border-top-right-radius: 2px;
}

.chat-msg.bot .chat-bubble {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-top-left-radius: 2px;
}

.chat-loading {
  color: var(--el-text-color-secondary);
}

.chat-empty {
  margin: auto;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.chat-input {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

/* 沙箱用户配置弹层 */
.sandbox-user-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sandbox-user-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sandbox-user-row .label {
  width: 36px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.sandbox-user-row .el-input {
  flex: 1;
}

.sandbox-user-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  /* 沙箱视图：纵向堆叠，页面自然滚动（避免固定 vh 被软键盘挤压） */
  .sandbox-page {
    height: auto;
    min-height: 0;
  }

  .sandbox-page-header {
    margin-bottom: 10px;
  }

  .sandbox-page-title {
    min-width: 0;
  }

  .sandbox-panel {
    flex-direction: column;
    overflow: visible;
  }

  .sandbox-left {
    flex: none;
    height: auto;
  }

  .sandbox-editor {
    flex: none;
    height: 40vh;
    min-height: 220px;
  }

  .sandbox-right {
    flex: none;
    width: 100%;
    height: 52vh;
    min-height: 340px;
  }

  /* 聊天气泡在窄屏更紧凑 */
  .chat-body {
    max-width: 86%;
  }

  .chat-avatar {
    width: 30px;
    height: 30px;
  }
}

@media (max-width: 480px) {
  /* 词库文件列表横向滚动，避免纵向换行过高 */
  .sandbox-file-list {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .sandbox-file-item {
    flex-shrink: 0;
  }

  .sandbox-editor-actions {
    flex-wrap: wrap;
  }

  .sandbox-file-name {
    max-width: 100%;
  }

  /* 聊天工具栏与输入在窄屏换行 */
  .chat-toolbar {
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
