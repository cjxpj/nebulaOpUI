<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick, defineAsyncComponent } from 'vue'
import { Search, Folder, Document, Cpu, ArrowLeft, Plus, Upload, MoreFilled } from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

// 词库调试（含 monaco 编辑器，体积最大，首次打开时才加载）
const DicDebug = defineAsyncComponent(() => import('@/views/DicDebug.vue'))
// 通用代码编辑器（编辑文件用，含行号，懒加载）
const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'))
// SQLite 数据库浏览器（查看/编辑 db 文件，懒加载）
const DbBrowser = defineAsyncComponent(() => import('@/components/DbBrowser.vue'))

// 词库调试：页面内切换视图，记住打开状态（刷新后自动恢复）
const DIC_DEBUG_OPEN_KEY = 'nebula_fm_dic_debug_open'
const DIC_DEBUG_PATH_KEY = 'nebula_fm_dic_debug_path'
const dicDebugOpen = ref(localStorage.getItem(DIC_DEBUG_OPEN_KEY) === '1')
const dicDebugPath = ref(localStorage.getItem(DIC_DEBUG_PATH_KEY) || '')

watch(dicDebugOpen, (v) => localStorage.setItem(DIC_DEBUG_OPEN_KEY, v ? '1' : '0'))
watch(dicDebugPath, (v) => localStorage.setItem(DIC_DEBUG_PATH_KEY, v || ''))

/* ================= 双栏目录浏览 ================= */
// 左右两栏各自的目录记忆 key，首次为空（根目录）
const DIR_STORAGE_KEYS = ['nebula_fm_pane0_dir', 'nebula_fm_pane1_dir']
const PAGE_SIZE = 50

function makePane(index) {
  return {
    dir: localStorage.getItem(DIR_STORAGE_KEYS[index]) || '',
    entries: [],
    loading: false,
    visibleCount: PAGE_SIZE,
    selected: [],
    selectMode: false,
    // 下拉刷新状态
    pullDistance: 0,
    pullState: '',
    pullStartX: null,
    pullStartY: null,
    pulling: false,
    pullScrollContainer: null,
  }
}

const panes = reactive([makePane(0), makePane(1)])
const activePane = ref(0) // 0 左栏 | 1 右栏

// 应用数据目录的真实名称（后端返回），用作面包屑根节点显示
const rootName = ref('')

function setActivePane(index) {
  if (activePane.value !== index) activePane.value = index
}

// 活动栏对象
function cur() {
  return panes[activePane.value]
}

// 面包屑（显示活动栏路径）
const breadcrumbs = computed(() => {
  const crumbs = [{ name: rootName.value || '文件管理', path: '' }]
  const parts = cur().dir.split('/').filter(Boolean)
  let acc = ''
  for (const p of parts) {
    acc = acc ? acc + '/' + p : p
    crumbs.push({ name: p, path: acc })
  }
  return crumbs
})

async function loadEntries(silent = false, index = activePane.value) {
  const p = panes[index]
  if (!silent) p.loading = true
  p.visibleCount = PAGE_SIZE
  p.selected = []
  p.selectMode = false
  try {
    const data = await apiPost({ type: 'file_list', data: { path: p.dir } })
    p.entries = data?.entries || []
    if (data?.root) rootName.value = data.root
  } catch (e) {
    console.error('加载文件列表失败:', e)
    ElMessage.error('加载文件列表失败: ' + (e.message || '未知错误'))
  } finally {
    if (!silent) p.loading = false
  }
}

// 文件操作后静默刷新两个栏，保证左右显示一致
function refreshBoth() {
  loadEntries(true, 0)
  loadEntries(true, 1)
}

function goTo(index, path) {
  const p = panes[index]
  if (path === p.dir) return
  p.dir = path
  localStorage.setItem(DIR_STORAGE_KEYS[index], path)
  loadEntries(false, index)
}

function enterDir(index, entry) {
  goTo(index, entry.path)
}

/* ================= 懒加载 ================= */
const loadMoreEls = [null, null]
const loadMoreObservers = [null, null]

const hasMore = computed(() => panes.map((p) => p.visibleCount < p.entries.length))

function loadMore(index) {
  panes[index].visibleCount += PAGE_SIZE
}

// 监听某栏“加载更多”元素进入视口时自动加载下一批
function setupLoadMoreObserver(index) {
  if (loadMoreObservers[index]) {
    loadMoreObservers[index].disconnect()
    loadMoreObservers[index] = null
  }
  const el = loadMoreEls[index]
  if (!el) return
  const root = el.closest('.file-panel')
  loadMoreObservers[index] = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMore(index)
  }, { root, rootMargin: '200px' })
  loadMoreObservers[index].observe(el)
}

/* ================= 下拉刷新（按栏） ================= */
const PULL_THRESHOLD = 60
const PULL_MAX = 100
const PULL_ACTIVATE = 8

// 找到离元素最近的纵向滚动容器（含元素自身）
function getScrollContainer(el) {
  let node = el
  while (node) {
    const style = window.getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY)) return node
    node = node.parentElement
  }
  return document.scrollingElement || document.documentElement
}

// 通用：开始下拉（返回是否真正进入可下拉状态）
function beginPull(index, startX, startY, scrollEl) {
  const p = panes[index]
  if (p.loading) return false
  p.pullScrollContainer = scrollEl
  if (scrollEl && scrollEl.scrollTop <= 0) {
    p.pullStartX = startX
    p.pullStartY = startY
    return true
  }
  p.pullStartX = null
  p.pullStartY = null
  return false
}

// 通用：拖动过程中更新下拉状态
function movePull(index, clientX, clientY, prevent) {
  const p = panes[index]
  if (p.pullStartY === null || p.pullStartX === null || p.loading || swiped) return
  const sc = p.pullScrollContainer
  const dy = clientY - p.pullStartY
  const dx = clientX - p.pullStartX
  // 仅当纵向下拉占主导时才进入下拉刷新，避免与横向右滑手势冲突
  if (dy > 0 && dy > Math.abs(dx) && sc && sc.scrollTop <= 0) {
    // 达到激活阈值前不拦截，避免轻微下移就锁死原生滚动
    if (!p.pulling && dy < PULL_ACTIVATE) return
    p.pulling = true
    p.pullDistance = Math.min(dy * 0.5, PULL_MAX)
    p.pullState = p.pullDistance >= PULL_THRESHOLD ? 'ready' : ''
    if (prevent) prevent()
  } else {
    if (p.pulling) {
      p.pulling = false
      p.pullDistance = 0
      p.pullState = ''
    }
  }
}

// 通用：结束下拉，触发刷新或复位
function endPull(index) {
  const p = panes[index]
  if (p.pulling && p.pullDistance >= PULL_THRESHOLD) {
    p.pullState = 'loading'
    p.pullDistance = 50
    loadEntries(true, index).finally(() => {
      p.pullState = ''
      p.pullDistance = 0
    })
  } else {
    p.pullDistance = 0
    p.pullState = ''
  }
  p.pullStartX = null
  p.pullStartY = null
  p.pulling = false
  p.pullScrollContainer = null
}

// —— 触摸入口（移动端）——
function onPanelTouchStart(e, index) {
  setActivePane(index)
  beginPull(index, e.touches[0].clientX, e.touches[0].clientY, getScrollContainer(e.currentTarget))
}

function onPanelTouchMove(e, index) {
  movePull(index, e.touches[0].clientX, e.touches[0].clientY, () => e.preventDefault())
}

function onPanelTouchEnd(index) {
  endPull(index)
}

// —— 鼠标入口（桌面端）——
let mousePullPane = -1

function onPanelMouseDown(e, index) {
  if (e.button !== 0) return
  setActivePane(index)
  if (beginPull(index, e.clientX, e.clientY, getScrollContainer(e.currentTarget))) {
    mousePullPane = index
    document.addEventListener('mousemove', onPanelMouseMove)
    document.addEventListener('mouseup', onPanelMouseUp)
  }
}

function onPanelMouseMove(e) {
  if (mousePullPane < 0) return
  movePull(mousePullPane, e.clientX, e.clientY, () => e.preventDefault())
}

function onPanelMouseUp() {
  const index = mousePullPane
  document.removeEventListener('mousemove', onPanelMouseMove)
  document.removeEventListener('mouseup', onPanelMouseUp)
  mousePullPane = -1
  if (index >= 0) endPull(index)
}

/* ================= 搜索 ================= */
const searchVisible = ref(false)
const searchKeyword = ref('')
const searchDeep = ref(false)
const searchRegex = ref(false)
const searchResults = ref([])
const searchLoading = ref(false)
const searchExecuted = ref(false)

function openSearch() {
  searchKeyword.value = ''
  searchDeep.value = false
  searchRegex.value = false
  searchResults.value = []
  searchExecuted.value = false
  searchVisible.value = true
}

async function runSearch() {
  searchLoading.value = true
  searchExecuted.value = true
  try {
    const data = await apiPost({
      type: 'file_search',
      data: { path: cur().dir, keyword: searchKeyword.value, deep: searchDeep.value, regex: searchRegex.value },
    })
    searchResults.value = data?.entries || []
  } catch (e) {
    console.error('搜索失败:', e)
    ElMessage.error('搜索失败: ' + (e.message || '未知错误'))
  } finally {
    searchLoading.value = false
  }
}

// 点击搜索结果：文件夹跳转到活动栏，词库文件进入词库调试，图片文件预览，db 文件打开数据库浏览器，其他文件打开编辑
function onSearchResultClick(entry) {
  searchVisible.value = false
  if (entry.dir) {
    goTo(activePane.value, entry.path)
    return
  }
  if (isDicFile(entry.path)) {
    openInDicDebug(entry.path)
    return
  }
  if (isImageFile(entry.path)) {
    openImageViewer(entry.path)
    return
  }
  if (isDbFile(entry.path)) {
    openDbBrowser(entry.path)
    return
  }
  openEditDialog(entry.path)
}

/* ================= 文件操作 ================= */
function isDicFile(path) {
  return path.toLowerCase().endsWith('.n')
}

function isImageFile(path) {
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path)
}

function isDbFile(path) {
  return /\.(db|sqlite|sqlite3|db3)$/i.test(path)
}

// 打开条目：文件夹进入浏览；词库文件进入词库调试；图片文件在线预览；db 文件打开数据库浏览器；其他文件弹窗查看/编辑
function openEntry(entry, index) {
  if (entry.dir) {
    enterDir(index, entry)
    return
  }
  if (isDicFile(entry.path)) {
    openInDicDebug(entry.path)
    return
  }
  if (isImageFile(entry.path)) {
    openImageViewer(entry.path)
    return
  }
  if (isDbFile(entry.path)) {
    openDbBrowser(entry.path)
    return
  }
  openEditDialog(entry.path)
}

/* ================= 右键菜单 / 右滑多选 ================= */
const ctxMenu = ref(null) // { entry, index, x, y } | null
// 向右滑动进入多选（需拖动一定距离才触发，避免误触）
const SWIPE_THRESHOLD = 30
const SWIPE_REVEAL = 40 // 右滑最大位移，松手后回弹
const swipeOffset = ref(0) // 当前右滑的横向位移（拖动视觉）
const swipingPath = ref('') // 正在被拖动的行 path
let swipeStartX = null
let swipeStartY = null
let swipeEntry = null
let swipeIndex = -1
let swiped = false

// 长按（移动端打开菜单）
let longPressTimer = null
let longPressTriggered = false
let longPressPos = null
const LONG_PRESS_MS = 500
const LONG_PRESS_MOVE_TOLERANCE = 10

function openCtxMenu(entry, index, x, y) {
  ctxMenu.value = { entry, index, x, y }
}

function closeCtxMenu() {
  ctxMenu.value = null
}

// 行点击：右滑后的合成 click 直接拦截，避免误触发打开
function onRowClick(e, entry, index) {
  if (swiped) {
    swiped = false
    e.stopPropagation()
    e.preventDefault()
    return
  }
  // 长按打开菜单后的合成 click，拦截避免误打开
  if (longPressTriggered) {
    longPressTriggered = false
    e.stopPropagation()
    e.preventDefault()
    return
  }
  // 多选模式下点击行主体 = 切换勾选，不再打开
  if (panes[index].selectMode) {
    toggleSelect(index, entry)
    return
  }
  openEntry(entry, index)
}

// 桌面端右键菜单
function onRowContextMenu(e, entry, index) {
  setActivePane(index)
  openCtxMenu(entry, index, e.clientX, e.clientY)
}

// 通用：开始滑动检测
function beginSwipe(index, entry, startX, startY) {
  setActivePane(index)
  swiped = false
  // 多选模式下无需右滑（点击即可切换选中），不进入滑动状态
  if (panes[index].selectMode) {
    swipeStartX = null
    swipeStartY = null
    swipeEntry = null
    swipeIndex = -1
    return
  }
  swipeStartX = startX
  swipeStartY = startY
  swipeEntry = entry
  swipeIndex = index
  swipingPath.value = entry.path
  swipeOffset.value = 0
}

// 通用：滑动过程中检测右滑触发多选，并同步拖动视觉位移
function moveSwipe(clientX, clientY) {
  if (swipeStartX === null) return
  const p = panes[swipeIndex]
  if (p.pulling) return
  const dx = clientX - swipeStartX
  const dy = clientY - swipeStartY
  // 仅横向且向右拖动时处理（避免与垂直滚动/下拉冲突）
  if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
    swipeOffset.value = Math.min(dx, SWIPE_REVEAL)
    if (!swiped && dx >= SWIPE_THRESHOLD) {
      swiped = true
      p.selectMode = true
      p.selected = [swipeEntry.path]
    }
  } else {
    swipeOffset.value = 0
  }
}

// 计算文件行位移：拖动中跟随手指，松手后回弹复位
function rowStyle(i, path) {
  if (swipingPath.value === path) {
    return { transform: `translateX(${swipeOffset.value}px)`, transition: 'none' }
  }
  return null
}

// 通用：滑动结束复位（swiped 保留，供 onRowClick 拦截合成 click）
function endSwipe() {
  swipeStartX = null
  swipeStartY = null
  swipeEntry = null
  swipeIndex = -1
  swipeOffset.value = 0
  swipingPath.value = ''
}

// —— 长按（移动端打开菜单）——
function startLongPress(entry, index, x, y) {
  cancelLongPress()
  longPressTriggered = false
  longPressPos = { x, y }
  longPressTimer = setTimeout(() => {
    longPressTriggered = true
    openCtxMenu(entry, index, longPressPos.x, longPressPos.y)
  }, LONG_PRESS_MS)
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

// —— 触摸入口（移动端）——
function onRowTouchStart(e, entry, index) {
  const t = e.touches[0]
  beginSwipe(index, entry, t.clientX, t.clientY)
  startLongPress(entry, index, t.clientX, t.clientY)
}

function onRowTouchMove(e) {
  const t = e.touches[0]
  moveSwipe(t.clientX, t.clientY)
  // 移动超过容差则取消长按
  if (longPressTimer && longPressPos) {
    const dx = t.clientX - longPressPos.x
    const dy = t.clientY - longPressPos.y
    if (Math.abs(dx) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE) {
      cancelLongPress()
    }
  }
}

function onRowTouchEnd() {
  cancelLongPress()
  endSwipe()
}

// —— 鼠标入口（桌面端）——
function onRowMouseDown(e, entry, index) {
  if (e.button !== 0) return
  beginSwipe(index, entry, e.clientX, e.clientY)
  document.addEventListener('mousemove', onRowMouseMove)
  document.addEventListener('mouseup', onRowMouseUp)
}

function onRowMouseMove(e) {
  moveSwipe(e.clientX, e.clientY)
}

function onRowMouseUp() {
  document.removeEventListener('mousemove', onRowMouseMove)
  document.removeEventListener('mouseup', onRowMouseUp)
  endSwipe()
}

// 菜单命令
function onCtxMenuCommand(cmd) {
  const c = ctxMenu.value
  closeCtxMenu()
  if (!c) return
  const entry = c.entry
  const index = c.index
  if (cmd === 'open') enterDir(index, entry)
  else if (cmd === 'dic') openInDicDebug(entry.path)
  else if (cmd === 'view') openImageViewer(entry.path)
  else if (cmd === 'db') openDbBrowser(entry.path)
  else if (cmd === 'edit') openEditDialog(entry.path)
  else if (cmd === 'encrypt-dic') encryptDicFile(index, entry)
  else if (cmd === 'rename') renameEntry(index, entry)
  else if (cmd === 'delete') deleteFile(index, entry)
}

// 点击菜单外关闭（右滑/长按后的合成 click 忽略一次，避免误关闭）
function onDocumentClick() {
  if (swiped) {
    swiped = false
    return
  }
  if (longPressTriggered) {
    longPressTriggered = false
    return
  }
  closeCtxMenu()
}

watch(ctxMenu, (v) => {
  if (v) {
    document.addEventListener('click', onDocumentClick)
  } else {
    document.removeEventListener('click', onDocumentClick)
  }
})

/* ================= 词库调试 ================= */
function openInDicDebug(path) {
  dicDebugPath.value = path || ''
  dicDebugOpen.value = true
}

// 右侧「三个点」更多菜单
function onMoreCommand(cmd) {
  if (cmd === 'search') openSearch()
  else if (cmd === 'dic-debug') openInDicDebug('')
}

/* ================= 图片预览（全屏覆盖层，支持缩放/平移） ================= */
const imageVisible = ref(false)
const imagePath = ref('')
const imageUrl = ref('')
const imageLoading = ref(false)
const imageError = ref('')

const imageScale = ref(1)
const imageTx = ref(0)
const imageTy = ref(0)
const isDragging = ref(false)

const imageStyle = computed(() => ({
  transform: `translate(${imageTx.value}px, ${imageTy.value}px) scale(${imageScale.value})`,
}))

let imageDragStart = null

function closeImageViewer() {
  imageVisible.value = false
  imageUrl.value = ''
  imageError.value = ''
  imageScale.value = 1
  imageTx.value = 0
  imageTy.value = 0
}

function zoomImage(factor) {
  const next = imageScale.value * factor
  imageScale.value = Math.min(20, Math.max(0.05, next))
}

function resetImageView() {
  imageScale.value = 1
  imageTx.value = 0
  imageTy.value = 0
}

function onImageWheel(e) {
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  zoomImage(factor)
}

function onImageMouseDown(e) {
  if (e.button !== 0) return
  imageDragStart = { x: e.clientX, y: e.clientY, tx: imageTx.value, ty: imageTy.value }
  isDragging.value = true
  document.addEventListener('mousemove', onImageDragMove)
  document.addEventListener('mouseup', onImageDragEnd)
}

function onImageDragMove(e) {
  if (!imageDragStart) return
  imageTx.value = imageDragStart.tx + (e.clientX - imageDragStart.x)
  imageTy.value = imageDragStart.ty + (e.clientY - imageDragStart.y)
}

function onImageDragEnd() {
  imageDragStart = null
  isDragging.value = false
  document.removeEventListener('mousemove', onImageDragMove)
  document.removeEventListener('mouseup', onImageDragEnd)
}

function onImageKeydown(e) {
  if (e.key === 'Escape') closeImageViewer()
}

watch(imageVisible, (v) => {
  if (v) document.addEventListener('keydown', onImageKeydown)
  else document.removeEventListener('keydown', onImageKeydown)
})

async function openImageViewer(path) {
  imagePath.value = path
  imageUrl.value = ''
  imageError.value = ''
  imageScale.value = 1
  imageTx.value = 0
  imageTy.value = 0
  imageVisible.value = true
  imageLoading.value = true
  try {
    const data = await apiPost({ type: 'file_image', data: { path } })
    imageUrl.value = `data:${data?.mime || 'application/octet-stream'};base64,${data?.data || ''}`
  } catch (e) {
    console.error('加载图片失败:', e)
    imageError.value = e.message || '加载图片失败'
  } finally {
    imageLoading.value = false
  }
}

/* ================= 数据库浏览器 ================= */
const dbVisible = ref(false)
const dbPath = ref('')

function openDbBrowser(path) {
  dbPath.value = path || ''
  dbVisible.value = true
}

/* ================= 编辑弹窗 ================= */
const editVisible = ref(false)
const editPath = ref('')
const editContent = ref('')
const editLoading = ref(false)
const editSaving = ref(false)
const editBinary = ref(false)

// 根据扩展名推断 Monaco 高亮语言
function detectLanguage(path) {
  const ext = (path.split('.').pop() || '').toLowerCase()
  const map = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    html: 'html', htm: 'html', wn: 'html',
    css: 'css', scss: 'scss', less: 'less',
    json: 'json',
    md: 'markdown', markdown: 'markdown',
    xml: 'xml', svg: 'xml',
    yaml: 'yaml', yml: 'yaml',
    py: 'python',
    go: 'go',
    java: 'java',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
    cs: 'csharp',
    sql: 'sql',
    sh: 'shell', bash: 'shell', zsh: 'shell', bat: 'bat', ps1: 'powershell',
    ini: 'ini', conf: 'ini', properties: 'ini', toml: 'ini',
    txt: 'plaintext', log: 'plaintext',
  }
  return map[ext] || 'plaintext'
}

const editLanguage = computed(() => detectLanguage(editPath.value))

async function openEditDialog(path) {
  editPath.value = path
  editBinary.value = false
  editContent.value = ''
  editVisible.value = true
  editLoading.value = true
  try {
    if (isDicFile(path)) {
      const data = await apiPost({ type: 'dic_get_content', data: { path } })
      editContent.value = data?.content || ''
    } else {
      const data = await apiPost({ type: 'file_read', data: { path } })
      if (data?.binary) {
        editBinary.value = true
      } else {
        editContent.value = data?.content || ''
      }
    }
  } catch (e) {
    console.error('读取文件失败:', e)
    ElMessage.error('读取文件失败: ' + (e.message || '未知错误'))
    editVisible.value = false
  } finally {
    editLoading.value = false
  }
}

async function saveEdit() {
  editSaving.value = true
  try {
    if (isDicFile(editPath.value)) {
      await apiPost({ type: 'dic_save_content', data: { path: editPath.value, content: editContent.value } })
    } else {
      await apiPost({ type: 'file_write', data: { path: editPath.value, content: editContent.value } })
    }
    ElMessage.success('文件已保存')
    editVisible.value = false
    refreshBoth()
  } catch (e) {
    console.error('保存文件失败:', e)
    ElMessage.error('保存文件失败: ' + (e.message || '未知错误'))
  } finally {
    editSaving.value = false
  }
}

/* ================= 新建文件 ================= */
const createVisible = ref(false)
const createName = ref('')
const creating = ref(false)

function openCreate() {
  createName.value = ''
  createVisible.value = true
}

async function saveCreate() {
  const name = createName.value.trim()
  if (!name) {
    ElMessage.error('请输入文件名')
    return
  }
  if (name.includes('/') || name.includes('\\')) {
    ElMessage.error('文件名不能包含路径分隔符')
    return
  }
  const path = cur().dir ? cur().dir + '/' + name : name
  creating.value = true
  try {
    await apiPost({ type: 'file_create', data: { path, content: '' } })
    ElMessage.success('文件已创建')
    createVisible.value = false
    refreshBoth()
  } catch (e) {
    console.error('创建文件失败:', e)
    ElMessage.error('创建文件失败: ' + (e.message || '未知错误'))
  } finally {
    creating.value = false
  }
}

/* ================= 新建文件夹 ================= */
const mkdirVisible = ref(false)
const mkdirName = ref('')
const mkdirCreating = ref(false)

function openMkdir() {
  mkdirName.value = ''
  mkdirVisible.value = true
}

async function saveMkdir() {
  const name = mkdirName.value.trim()
  if (!name) {
    ElMessage.error('请输入文件夹名')
    return
  }
  if (name.includes('/') || name.includes('\\')) {
    ElMessage.error('文件夹名不能包含路径分隔符')
    return
  }
  const path = cur().dir ? cur().dir + '/' + name : name
  mkdirCreating.value = true
  try {
    await apiPost({ type: 'file_mkdir', data: { path } })
    ElMessage.success('文件夹已创建')
    mkdirVisible.value = false
    refreshBoth()
  } catch (e) {
    console.error('创建文件夹失败:', e)
    ElMessage.error('创建文件夹失败: ' + (e.message || '未知错误'))
  } finally {
    mkdirCreating.value = false
  }
}

// “新建”下拉菜单选择处理
function onNewCommand(cmd) {
  if (cmd === 'file') openCreate()
  else if (cmd === 'dir') openMkdir()
  else if (cmd === 'upload') openUpload()
}

/* ================= 删除文件/文件夹 ================= */
async function deleteFile(index, entry) {
  const label = entry.dir ? '文件夹' : '文件'
  const tip = entry.dir ? '其内部所有内容都会被删除，' : ''
  try {
    await ElMessageBox.confirm(`确定删除${label}「${entry.name}」吗？${tip}此操作不可恢复`, `删除${label}`, {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch (e) {
    return
  }
  try {
    await apiPost({ type: 'file_delete', data: { path: entry.path } })
    ElMessage.success('已删除')
    panes[index].selected = panes[index].selected.filter((p) => p !== entry.path)
    refreshBoth()
  } catch (e) {
    console.error(`删除${label}失败:`, e)
    ElMessage.error(`删除${label}失败: ` + (e.message || '未知错误'))
  }
}

/* ================= 生成加密词库 ================= */
async function encryptDicFile(index, entry) {
  try {
    await apiPost({ type: 'dic_encrypt_file', data: { path: entry.path } })
    ElMessage.success('加密词库已生成')
    refreshBoth()
  } catch (e) {
    console.error('生成加密词库失败:', e)
    ElMessage.error('生成加密词库失败: ' + (e.message || '未知错误'))
  }
}

/* ================= 上传文件 ================= */
const fileInput = ref(null)

function openUpload() {
  fileInput.value?.click()
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result
      if (typeof res === 'string') {
        resolve(res.split(',')[1] || '')
      } else {
        reject(new Error('读取文件失败'))
      }
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

// 分块大小：超过该大小的文件走分块上传，支持断点续传
const CHUNK_SIZE = 2 * 1024 * 1024
// 上传进度：{ fileName, percent } | null
const uploadProgress = ref(null)

// 上传单个文件，返回是否成功（用户取消覆盖返回 false，不中断批量上传）
async function uploadFile(file, onProgress) {
  try {
    const targetPath = cur().dir ? cur().dir + '/' + file.name : file.name
    const exists = cur().entries.some((e) => !e.dir && e.name === file.name)
    if (exists) {
      try {
        await ElMessageBox.confirm(`文件「${file.name}」已存在，是否覆盖？`, '上传文件', {
          confirmButtonText: '覆盖',
          cancelButtonText: '取消',
          type: 'warning',
        })
      } catch (e) {
        return false
      }
    }
    if (file.size <= CHUNK_SIZE) {
      // 小文件：一次性上传
      const base64 = await readFileAsBase64(file)
      await apiPost({ type: 'file_upload', data: { path: targetPath, data: base64 } })
      onProgress && onProgress(100)
      return true
    }
    // 大文件：分块上传 + 断点续传（先查询已上传的分块，跳过它们）
    const total = Math.ceil(file.size / CHUNK_SIZE)
    const status = await apiPost({ type: 'file_upload_status', data: { path: targetPath } })
    const doneSet = new Set(status?.chunks || [])
    for (let i = 0; i < total; i++) {
      if (doneSet.has(i)) {
        onProgress && onProgress(Math.round(((i + 1) / total) * 100))
        continue
      }
      const blob = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size))
      const base64 = await readFileAsBase64(blob)
      await apiPost({ type: 'file_upload_chunk', data: { path: targetPath, index: i, total, data: base64 } })
      onProgress && onProgress(Math.round(((i + 1) / total) * 100))
    }
    await apiPost({ type: 'file_upload_merge', data: { path: targetPath, total } })
    onProgress && onProgress(100)
    return true
  } catch (e) {
    console.error(`上传 ${file.name} 失败:`, e)
    ElMessage.error(`上传 ${file.name} 失败: ` + (e.message || '未知错误'))
    return false
  }
}

// 批量上传文件
async function uploadFiles(files) {
  const list = Array.from(files || [])
  if (!list.length) return
  let success = 0
  try {
    for (const file of list) {
      uploadProgress.value = { fileName: file.name, percent: 0 }
      const ok = await uploadFile(file, (p) => {
        uploadProgress.value = { fileName: file.name, percent: p }
      })
      if (ok) success++
    }
    if (success > 0) {
      ElMessage.success(`上传成功 ${success} 个文件`)
      refreshBoth()
    }
  } finally {
    uploadProgress.value = null
  }
}

// 点击上传按钮触发的文件选择
async function onFileChange(event) {
  const files = event.target.files
  await uploadFiles(files)
  event.target.value = ''
}

/* ================= 拖拽上传 ================= */
const dragging = ref(false)
let dragCounter = 0

function onDragEnter(e) {
  e.preventDefault()
  dragCounter++
  dragging.value = true
}

function onDragLeave(e) {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    dragging.value = false
  }
}

function onDrop(e) {
  dragCounter = 0
  dragging.value = false
  const files = e.dataTransfer && e.dataTransfer.files
  if (files && files.length) uploadFiles(files)
}

/* ================= 重命名 ================= */
async function renameEntry(index, entry) {
  let value
  try {
    ;({ value } = await ElMessageBox.prompt('请输入新的名称', '重命名', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: entry.name,
      inputValidator: (v) => {
        const t = (v || '').trim()
        if (!t) return '名称不能为空'
        if (t === '.' || t === '..' || t.includes('/') || t.includes('\\')) return '名称不能包含路径分隔符'
        return true
      },
    }))
  } catch (e) {
    return // 取消或关闭
  }
  const newName = value.trim()
  if (!newName || newName === entry.name) return
  try {
    await apiPost({ type: 'file_rename', data: { path: entry.path, newName } })
    ElMessage.success('重命名成功')
    panes[index].selected = panes[index].selected.filter((p) => p !== entry.path)
    if (clipboard.value) {
      clipboard.value = { ...clipboard.value, paths: clipboard.value.paths.filter((p) => p !== entry.path) }
      if (!clipboard.value.paths.length) clipboard.value = null
    }
    refreshBoth()
  } catch (e) {
    console.error('重命名失败:', e)
    ElMessage.error('重命名失败: ' + (e.message || '未知错误'))
  }
}

/* ================= 多选 / 复制 / 剪切（剪贴板跨栏全局） ================= */
const clipboard = ref(null) // { mode: 'copy' | 'cut', paths: string[] }
const pasting = ref(false)

function exitSelectMode(index = activePane.value) {
  const p = panes[index]
  p.selectMode = false
  p.selected = []
}

function isSelected(index, path) {
  return panes[index].selected.includes(path)
}

function toggleSelect(index, entry) {
  const p = panes[index]
  const idx = p.selected.indexOf(entry.path)
  if (idx >= 0) {
    p.selected.splice(idx, 1)
  } else {
    p.selected.push(entry.path)
  }
}

// 多选模式下，若所有勾选都被取消（选中项清零），自动退出多选
watch(
  () => panes.map((p) => p.selected.length),
  (lengths) => {
    lengths.forEach((len, i) => {
      if (len === 0 && panes[i].selectMode) {
        panes[i].selectMode = false
      }
    })
  }
)

const allSelected = computed(() =>
  panes.map((p) => {
    const v = p.entries.slice(0, p.visibleCount)
    return v.length > 0 && p.selected.length === v.length
  })
)

function toggleSelectAll(index = activePane.value) {
  const p = panes[index]
  if (allSelected.value[index]) {
    p.selected = []
  } else {
    p.selected = p.entries.slice(0, p.visibleCount).map((e) => e.path)
  }
}

function copySelection() {
  const p = cur()
  if (!p.selected.length) {
    ElMessage.warning('请先选择文件')
    return
  }
  clipboard.value = { mode: 'copy', paths: [...p.selected] }
  ElMessage.success(`已复制 ${p.selected.length} 项`)
}

function cutSelection() {
  const p = cur()
  if (!p.selected.length) {
    ElMessage.warning('请先选择文件')
    return
  }
  clipboard.value = { mode: 'cut', paths: [...p.selected] }
  ElMessage.success(`已剪切 ${p.selected.length} 项`)
}

async function pasteSelection() {
  if (!clipboard.value || !clipboard.value.paths.length) {
    ElMessage.warning('剪贴板为空')
    return
  }
  const type = clipboard.value.mode === 'cut' ? 'file_move' : 'file_copy'
  pasting.value = true
  try {
    await apiPost({ type, data: { paths: clipboard.value.paths, target: cur().dir } })
    ElMessage.success('粘贴成功')
    if (clipboard.value.mode === 'cut') {
      clipboard.value = null
    }
    refreshBoth()
  } catch (e) {
    console.error('粘贴失败:', e)
    ElMessage.error('粘贴失败: ' + (e.message || '未知错误'))
  } finally {
    pasting.value = false
  }
}

// 批量删除选中的文件/文件夹
async function deleteSelected() {
  const p = cur()
  const paths = [...p.selected]
  if (!paths.length) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${paths.length} 项吗？此操作不可恢复`, '批量删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch (e) {
    return
  }
  let ok = 0
  for (const path of paths) {
    try {
      await apiPost({ type: 'file_delete', data: { path } })
      ok++
    } catch (e) {
      console.error(`删除 ${path} 失败:`, e)
      ElMessage.error(`删除 ${path} 失败: ` + (e.message || '未知错误'))
    }
  }
  if (ok > 0) {
    ElMessage.success(`已删除 ${ok} 项`)
    p.selected = []
    refreshBoth()
  }
}

/* ================= 格式化 ================= */
function formatSize(bytes) {
  if (bytes == null) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function formatTime(sec) {
  if (!sec) return '-'
  const d = new Date(sec * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  loadEntries(false, 0)
  loadEntries(false, 1)
})

onBeforeUnmount(() => {
  cancelLongPress()
  loadMoreObservers.forEach((o) => o && o.disconnect())
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('mousemove', onPanelMouseMove)
  document.removeEventListener('mouseup', onPanelMouseUp)
  document.removeEventListener('mousemove', onRowMouseMove)
  document.removeEventListener('mouseup', onRowMouseUp)
  document.removeEventListener('keydown', onImageKeydown)
  document.removeEventListener('mousemove', onImageDragMove)
  document.removeEventListener('mouseup', onImageDragEnd)
})

// “加载更多”元素出现后监听其进入视口，自动加载下一批
watch(hasMore, async (vals) => {
  for (let i = 0; i < 2; i++) {
    if (vals[i]) {
      await nextTick()
      setupLoadMoreObserver(i)
    } else if (loadMoreObservers[i]) {
      loadMoreObservers[i].disconnect()
      loadMoreObservers[i] = null
    }
  }
})
</script>

<template>
  <div
    class="page"
    @dragenter="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- 词库调试 / 文件管理：先划走再划入的切换动画 -->
    <Transition name="fm-switch" mode="out-in">
      <div v-if="dicDebugOpen" key="dic-debug" class="dic-debug-view">
        <div class="dic-debug-view-header">
          <ElButton text :icon="ArrowLeft" @click="dicDebugOpen = false">文件管理</ElButton>
        </div>
        <DicDebug :initial-path="dicDebugPath" />
      </div>
      <div v-else key="fm-body" class="fm-body">
      <div class="toolbar">
      <div class="breadcrumb">
        <template v-for="(seg, i) in breadcrumbs" :key="seg.path">
          <span v-if="i > 0" class="crumb-sep">/</span>
          <a
            v-if="i < breadcrumbs.length - 1"
            class="crumb-link"
            @click="goTo(activePane, seg.path)"
          >{{ seg.name }}</a>
          <span v-else class="crumb-current">{{ seg.name }}</span>
        </template>
      </div>
      <ElDropdown trigger="click" @command="onNewCommand">
        <ElButton :icon="Plus" text title="新建" />
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="file">新建文件</ElDropdownItem>
            <ElDropdownItem command="dir">新建文件夹</ElDropdownItem>
            <ElDropdownItem command="upload" divided>上传文件</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
      <ElDropdown trigger="click" @command="onMoreCommand">
        <ElButton :icon="MoreFilled" text title="更多" />
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="search" :icon="Search">搜索</ElDropdownItem>
            <ElDropdownItem command="dic-debug" :icon="Cpu">词库调试</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </div>

    <div v-if="uploadProgress" class="upload-progress">
      <span class="upload-progress-name">{{ uploadProgress.fileName }}</span>
      <ElProgress
        :percentage="uploadProgress.percent"
        :stroke-width="8"
        class="upload-progress-bar"
      />
    </div>

    <div class="action-bar">
      <template v-if="!panes[activePane].selectMode">
        <ElButton v-if="clipboard" size="small" :loading="pasting" @click="pasteSelection">粘贴</ElButton>
        <span v-if="clipboard" class="clip-tip">
          剪贴板：{{ clipboard.mode === 'cut' ? '剪切' : '复制' }} {{ clipboard.paths.length }} 项
        </span>
      </template>
      <template v-else>
        <ElButton size="small" @click="toggleSelectAll()">{{ allSelected[activePane] ? '取消全选' : '全选' }}</ElButton>
        <span v-if="panes[activePane].selected.length" class="sel-count">已选 {{ panes[activePane].selected.length }} 项</span>
        <ElButton v-if="panes[activePane].selected.length" size="small" @click="copySelection">复制</ElButton>
        <ElButton v-if="panes[activePane].selected.length" size="small" @click="cutSelection">剪切</ElButton>
        <ElButton v-if="panes[activePane].selected.length" size="small" type="danger" @click="deleteSelected">删除</ElButton>
        <ElButton size="small" type="primary" @click="exitSelectMode()">完成</ElButton>
      </template>
    </div>

    <div class="panes">
      <div
        v-for="(p, i) in panes"
        :key="i"
        v-loading="p.loading"
        class="file-panel"
        :class="{ 'is-active': activePane === i }"
        @mousedown="onPanelMouseDown($event, i)"
        @touchstart.passive="onPanelTouchStart($event, i)"
        @touchmove="onPanelTouchMove($event, i)"
        @touchend="onPanelTouchEnd(i)"
      >
        <div class="pull-indicator" :style="{ height: p.pullDistance + 'px' }">
          <span v-if="p.pullState === 'loading'">刷新中...</span>
          <span v-else-if="p.pullState === 'ready'">释放刷新</span>
          <span v-else>下拉刷新</span>
        </div>
        <template v-if="p.entries.length">
          <div
            v-for="e in p.entries.slice(0, p.visibleCount)"
            :key="e.path"
            class="file-row"
            :class="{ 'is-selected': isSelected(i, e.path) }"
            :style="rowStyle(i, e.path)"
            @click="onRowClick($event, e, i)"
            @contextmenu.prevent="onRowContextMenu($event, e, i)"
            @mousedown="onRowMouseDown($event, e, i)"
            @touchstart.passive="onRowTouchStart($event, e, i)"
            @touchend="onRowTouchEnd"
            @touchcancel="onRowTouchEnd"
            @touchmove.passive="onRowTouchMove($event)"
          >
            <div class="file-icon">
              <ElIcon :size="18" :color="e.dir ? '#e6a23c' : isDicFile(e.path) ? '#409eff' : isDbFile(e.path) ? '#67c23a' : '#909399'">
                <Folder v-if="e.dir" />
                <Document v-else />
              </ElIcon>
            </div>
            <div class="file-info">
              <div class="file-name">{{ e.name }}</div>
              <div class="file-meta">
                {{ formatTime(e.mtime) }}<span v-if="!e.dir">&nbsp;{{ formatSize(e.size) }}</span>
              </div>
            </div>
          </div>
        </template>
        <ElEmpty v-else-if="!p.loading" description="该目录为空" />
        <div v-if="hasMore[i]" :ref="(el) => (loadMoreEls[i] = el)" class="load-more">
          <ElButton size="small" text :loading="p.loading" @click="loadMore(i)">加载更多</ElButton>
        </div>
      </div>
    </div>

    <!-- 编辑文件：从右侧滑入的全屏抽屉 -->
    <ElDrawer
      v-model="editVisible"
      direction="rtl"
      size="100%"
      destroy-on-close
      class="edit-drawer"
    >
      <template #header>
        <div class="edit-drawer-header">
          <ElButton text :icon="ArrowLeft" @click="editVisible = false">文件管理</ElButton>
          <span class="edit-drawer-title">{{ editPath }}</span>
        </div>
      </template>
      <div v-if="editLoading" v-loading="true" class="edit-loading"></div>
      <template v-else>
        <ElAlert
          v-if="editBinary"
          type="warning"
          :closable="false"
          show-icon
          title="该文件为二进制文件，不支持在线编辑"
          class="edit-alert"
        />
        <div v-else class="edit-monaco">
          <MonacoEditor v-model="editContent" :language="editLanguage" />
        </div>
      </template>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :disabled="editBinary" :loading="editSaving" @click="saveEdit">
          保存
        </ElButton>
      </template>
    </ElDrawer>

    <!-- 图片预览：全屏覆盖层，支持滚轮缩放与拖动平移 -->
    <Teleport to="body">
      <div v-if="imageVisible" class="image-viewer-mask">
        <div class="image-viewer-toolbar">
          <span class="image-viewer-title">{{ imagePath }}</span>
          <div class="image-viewer-actions">
            <ElButton size="small" @click="zoomImage(1.25)">放大</ElButton>
            <ElButton size="small" @click="zoomImage(0.8)">缩小</ElButton>
            <ElButton size="small" @click="resetImageView">重置</ElButton>
            <ElButton size="small" type="primary" @click="closeImageViewer">关闭</ElButton>
          </div>
        </div>
        <div
          v-loading="imageLoading"
          class="image-viewer-body"
          :class="{ 'is-dragging': isDragging }"
          @wheel.prevent="onImageWheel"
          @mousedown="onImageMouseDown"
        >
          <img
            v-if="imageUrl"
            :src="imageUrl"
            class="image-preview"
            :style="imageStyle"
            alt="图片预览"
            draggable="false"
          />
          <div v-else-if="imageError" class="image-error">{{ imageError }}</div>
        </div>
      </div>
    </Teleport>

    <!-- 数据库浏览器（全屏，内部 Teleport 到 body） -->
    <DbBrowser v-if="dbVisible" :path="dbPath" @close="dbVisible = false" />

    <!-- 新建文件弹窗 -->
    <ElDialog
      v-model="createVisible"
      title="新建文件"
      :width="isMobile ? '94%' : 420"
      destroy-on-close
    >
      <ElInput
        v-model="createName"
        placeholder="输入文件名，如 example.txt"
        size="small"
        @keyup.enter="saveCreate"
      />
      <template #footer>
        <ElButton @click="createVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="creating" @click="saveCreate">创建</ElButton>
      </template>
    </ElDialog>

    <!-- 新建文件夹弹窗 -->
    <ElDialog
      v-model="mkdirVisible"
      title="新建文件夹"
      :width="isMobile ? '94%' : 420"
      destroy-on-close
    >
      <ElInput
        v-model="mkdirName"
        placeholder="输入文件夹名，如 backup"
        size="small"
        @keyup.enter="saveMkdir"
      />
      <template #footer>
        <ElButton @click="mkdirVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="mkdirCreating" @click="saveMkdir">创建</ElButton>
      </template>
    </ElDialog>

    <!-- 搜索弹窗 -->
    <ElDialog
      v-model="searchVisible"
      title="搜索"
      :width="isMobile ? '94%' : 560"
      destroy-on-close
    >
      <div class="search-box">
        <ElInput
          v-model="searchKeyword"
          placeholder="搜索当前目录下的文件或文件夹"
          clearable
          :prefix-icon="Search"
          @keyup.enter="runSearch"
        />
        <div class="search-options">
          <ElCheckbox v-model="searchDeep">深度搜索（递归子目录）</ElCheckbox>
          <ElCheckbox v-model="searchRegex">正则匹配</ElCheckbox>
        </div>
      </div>
      <div v-loading="searchLoading" class="search-result">
        <template v-if="searchExecuted">
          <ElEmpty v-if="!searchResults.length" description="未找到匹配的项" />
          <div v-else class="search-list">
            <div
              v-for="e in searchResults"
              :key="e.path"
              class="search-row"
              @click="onSearchResultClick(e)"
            >
              <div class="search-row-icon">
                <ElIcon :size="16" :color="e.dir ? '#e6a23c' : isDicFile(e.path) ? '#409eff' : isDbFile(e.path) ? '#67c23a' : '#909399'">
                  <Folder v-if="e.dir" />
                  <Document v-else />
                </ElIcon>
              </div>
              <div class="search-row-info">
                <div class="search-row-name">{{ e.name }}</div>
                <div class="search-row-path">{{ e.path }}</div>
              </div>
              <div v-if="!e.dir" class="search-row-size">{{ formatSize(e.size) }}</div>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <ElButton @click="searchVisible = false">关闭</ElButton>
        <ElButton type="primary" :loading="searchLoading" @click="runSearch">搜索</ElButton>
      </template>
    </ElDialog>

    <!-- 隐藏的上传文件选择框 -->
    <input
      ref="fileInput"
      type="file"
      class="file-input-hidden"
      @change="onFileChange"
    />

    <!-- 拖拽上传覆盖层 -->
    <div v-if="dragging" class="drag-overlay">
      <div class="drag-overlay-inner">
        <Upload class="drag-icon" />
        <div>松开鼠标上传到当前目录</div>
      </div>
    </div>
      </div>
    </Transition>

    <!-- 右键 / 长按菜单 -->
    <Teleport to="body">
      <Transition name="ctx-fade">
        <div
          v-if="ctxMenu"
          class="ctx-menu"
          :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
          @click.stop
          @contextmenu.prevent
        >
          <div v-if="ctxMenu.entry.dir" class="ctx-item" @click="onCtxMenuCommand('open')">打开</div>
          <div v-else-if="isDicFile(ctxMenu.entry.path)" class="ctx-item" @click="onCtxMenuCommand('dic')">打开</div>
          <div v-else-if="isImageFile(ctxMenu.entry.path)" class="ctx-item" @click="onCtxMenuCommand('view')">查看</div>
          <div v-else-if="isDbFile(ctxMenu.entry.path)" class="ctx-item" @click="onCtxMenuCommand('db')">打开</div>
          <div v-else class="ctx-item" @click="onCtxMenuCommand('edit')">编辑</div>
          <div v-if="isDicFile(ctxMenu.entry.path) && !ctxMenu.entry.dir" class="ctx-item" @click="onCtxMenuCommand('edit')">编辑</div>
          <div v-if="isDicFile(ctxMenu.entry.path) && !ctxMenu.entry.dir" class="ctx-item" @click="onCtxMenuCommand('encrypt-dic')">生成加密词库</div>
          <div class="ctx-item" @click="onCtxMenuCommand('rename')">重命名</div>
          <div class="ctx-item ctx-item-danger" @click="onCtxMenuCommand('delete')">删除</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 文件管理主体（词库调试打开时隐藏，保留 DOM 状态） */
.fm-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 词库调试：页面内切换视图 */
.dic-debug-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.dic-debug-view-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

/* 词库调试 / 文件管理切换动画：先划走（左滑出）再划入（右滑入） */
.fm-switch-enter-active,
.fm-switch-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s;
}

.fm-switch-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.fm-switch-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.file-input-hidden {
  display: none;
}

.drag-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

.drag-overlay-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 48px;
  background: var(--el-bg-color);
  border: 2px dashed var(--el-color-primary);
  border-radius: 12px;
  color: var(--el-text-color-primary);
  font-size: 16px;
}

.drag-icon {
  font-size: 40px;
  color: var(--el-color-primary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  font-size: 14px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.crumb-sep {
  color: var(--el-text-color-placeholder);
  margin: 0 2px;
}

.crumb-link {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: none;
}

.crumb-link:hover {
  text-decoration: underline;
}

.crumb-current {
  color: var(--el-text-color-regular);
  font-weight: 600;
}

.upload-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.upload-progress-name {
  flex-shrink: 0;
  max-width: 220px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.upload-progress-bar {
  flex: 1;
  min-width: 120px;
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.sel-count {
  font-size: 13px;
  color: var(--el-color-primary);
}

.clip-tip {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.panes {
  display: flex;
  gap: 0;
  align-items: flex-start;
  flex: 1;
  min-height: 0;
}

.file-panel {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  user-select: none;
}

/* 中间垂直分割线 */
.file-panel + .file-panel {
  border-left: 1px solid var(--el-border-color-lighter);
}

/* 活动栏阴影高亮 */
.file-panel.is-active {
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.28);
}

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 0;
  overflow: hidden;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  transition: height 0.2s ease;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  border-top: 1px solid var(--el-border-color-lighter);
  transition: background-color 0.2s, transform 0.2s ease;
  -webkit-touch-callout: none;
  user-select: none;
}

.file-row:first-child {
  border-top: none;
}

.file-row:hover {
  background: var(--el-fill-color-light);
}

.file-row.is-selected {
  background: var(--el-color-primary-light-9);
}

.file-icon {
  flex-shrink: 0;
  display: flex;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  display: inline-block;
  max-width: 100%;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.file-name:hover {
  color: var(--el-color-primary);
}

.file-meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ctx-menu {
  position: fixed;
  z-index: 4000;
  min-width: 140px;
  padding: 4px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
}

.ctx-item {
  padding: 8px 12px;
  font-size: 14px;
  color: var(--el-text-color-primary);
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.ctx-item:hover {
  background: var(--el-fill-color-light);
}

.ctx-item-danger {
  color: var(--el-color-danger);
}

.ctx-fade-enter-active,
.ctx-fade-leave-active {
  transition: opacity 0.15s ease;
}

.ctx-fade-enter-from,
.ctx-fade-leave-to {
  opacity: 0;
}

.edit-drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.edit-drawer-title {
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 全屏编辑：body 纵向布局，让内容撑满剩余空间 */
.edit-drawer :deep(.el-drawer__body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.edit-loading {
  flex: 1;
  min-height: 200px;
}

.edit-alert {
  margin-bottom: 12px;
}

.edit-monaco {
  height: calc(100vh - 190px);
  min-height: 300px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

.image-viewer-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
}

.image-viewer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  flex-shrink: 0;
}

.image-viewer-title {
  font-size: 13px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.image-viewer-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.image-viewer-body {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}

.image-viewer-body.is-dragging {
  cursor: grabbing;
}

.image-preview {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  display: block;
  transform-origin: center center;
  will-change: transform;
}

.image-error {
  color: #fff;
  font-size: 14px;
  padding: 40px 20px;
}

.search-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.search-options {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.search-result {
  min-height: 120px;
  max-height: 50vh;
  overflow-y: auto;
}

.search-list {
  display: flex;
  flex-direction: column;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  cursor: pointer;
  border-top: 1px solid var(--el-border-color-lighter);
}

.search-row:first-child {
  border-top: none;
}

.search-row:hover {
  background: var(--el-fill-color-light);
}

.search-row-icon {
  flex-shrink: 0;
  display: flex;
}

.search-row-info {
  flex: 1;
  min-width: 0;
}

.search-row-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-row-path {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-row-size {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 手机端：双栏各占一半 */
@media (max-width: 768px) {
  .file-row {
    gap: 8px;
    padding: 10px 12px;
  }
}
</style>
