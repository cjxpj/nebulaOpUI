<template>
  <div class="background" :style="{ '--bg-image': bgImage, backgroundColor: bgColor || 'var(--el-bg-color)' }"></div>
  <ElConfigProvider>
    <div class="layout">
      <!-- 顶部 -->
      <ElPageHeader class="page-header" title="Nebula" icon="">
        <template #extra>
          <!-- 手机端菜单按钮 -->
          <ElButton
            v-if="isMobile"
            circle
            text
            @click="mobileMenuOpen = true"
          >
            <ElIcon><Menu /></ElIcon>
          </ElButton>
          <!-- 登出按钮 -->
          <ElButton
            circle
            text
            @click="logout"
            title="退出登录"
          >
            <ElIcon><SwitchButton /></ElIcon>
          </ElButton>
          <!-- 主题切换按钮（太阳 / 月亮） -->
          <ElButton
            circle
            text
            @click="toggleTheme"
            :title="isDarkMode ? '切换为浅色模式' : '切换为深色模式'"
          >
            <ElIcon v-if="isDarkMode">
              <Moon />
            </ElIcon>
            <ElIcon v-else>
              <Sunny />
            </ElIcon>
          </ElButton>
        </template>
      </ElPageHeader>

      <!-- 主体 -->
      <div class="main">
        <!-- 桌面端侧边栏 -->
        <aside v-if="!isMobile" class="sidebar">
          <ElMenu
            ref="menuRef"
            class="menu"
            :collapse="isCollapse"
            :default-active="activePage"
            @select="switchPage"
          >
            <ElMenuItem index="sys-status">
              <ElIcon><Odometer /></ElIcon>
              <template #title> 系统状态 </template>
            </ElMenuItem>

            <ElSubMenu index="realtime-data">
              <template #title>
                <ElIcon><Monitor /></ElIcon>
                <span>实时数据</span>
              </template>
              <ElMenuItem index="rt-terminal"> 实时终端 </ElMenuItem>
              <ElMenuItem index="rt-ws"> WebSocket </ElMenuItem>
              <ElMenuItem index="rt-tasks"> 定时任务 </ElMenuItem>
              <ElMenuItem index="rt-vars"> 线程变量 </ElMenuItem>
              <ElMenuItem index="rt-security"> 安全中心 </ElMenuItem>
            </ElSubMenu>

            <ElSubMenu index="basic">
              <template #title>
                <ElIcon><Setting /></ElIcon>
                <span>基础配置</span>
              </template>
              <ElMenuItem index="basic-server"> 服务器 </ElMenuItem>
              <ElMenuItem index="basic-server-list"> 服务器列表 </ElMenuItem>
              <ElMenuItem index="basic-ngrok"> Ngrok </ElMenuItem>
              <ElMenuItem index="basic-ftp"> FTP </ElMenuItem>
              <ElMenuItem index="basic-sftp"> SFTP </ElMenuItem>
              <ElMenuItem index="basic-cloudtool-server"> 云工具服务端 </ElMenuItem>
              <ElMenuItem index="cloud-tool"> 云工具 </ElMenuItem>
              <ElMenuItem index="opui-panel"> 面板配置 </ElMenuItem>
            </ElSubMenu>

            <ElSubMenu index="adapter">
              <template #title>
                <ElIcon><Connection /></ElIcon>
                <span>对接配置</span>
              </template>
              <ElMenuItem index="adapter-qq"> QQ 官方机器人 </ElMenuItem>
              <ElMenuItem index="adapter-napcat"> NapCat </ElMenuItem>
              <ElMenuItem index="adapter-yunhu"> 云湖 </ElMenuItem>
              <ElMenuItem index="adapter-feishu"> 飞书 </ElMenuItem>
              <ElMenuItem index="adapter-secluded"> Secluded </ElMenuItem>
            </ElSubMenu>

            <ElSubMenu index="test">
              <template #title>
                <ElIcon><ChatDotRound /></ElIcon>
                <span>测试</span>
              </template>
              <ElMenuItem index="qq-sandbox"> 沙箱测试 </ElMenuItem>
              <ElMenuItem index="dic-debug"> 词库调试 </ElMenuItem>
            </ElSubMenu>

            <ElMenuItem index="file-manager">
              <ElIcon><FolderOpened /></ElIcon>
              <template #title> 文件管理 </template>
            </ElMenuItem>

            <ElMenuItem index="extension-deploy">
              <ElIcon><Setting /></ElIcon>
              <template #title> 扩展部署 </template>
            </ElMenuItem>

            <ElMenuItem index="doc-view">
              <ElIcon><Document /></ElIcon>
              <template #title> 查看文档 </template>
            </ElMenuItem>

            <ElMenuItem v-if="compileReady" index="compile">
              <ElIcon><Box /></ElIcon>
              <template #title> 编译词库 </template>
            </ElMenuItem>
          </ElMenu>

          <div class="sidebar-tools">
            <ElButton
              type="text"
              :icon="isCollapse ? Expand : Fold"
              @click="isCollapse = !isCollapse"
            />
          </div>
        </aside>

        <!-- 手机端抽屉菜单 -->
        <ElDrawer
          v-model="mobileMenuOpen"
          direction="ltr"
          size="240px"
          :with-header="false"
          :z-index="2000"
        >
          <div class="mobile-drawer-title">
            <span class="mobile-drawer-logo">Nebula</span>
            <ElButton circle text @click="mobileMenuOpen = false">
              <ElIcon><Close /></ElIcon>
            </ElButton>
          </div>
          <ElMenu
            class="mobile-menu"
            :default-active="activePage"
            @select="onMobileMenuSelect"
          >
            <ElMenuItem index="sys-status">
              <ElIcon><Odometer /></ElIcon>
              <template #title> 系统状态 </template>
            </ElMenuItem>

            <ElSubMenu index="realtime-data">
              <template #title>
                <ElIcon><Monitor /></ElIcon>
                <span>实时数据</span>
              </template>
              <ElMenuItem index="rt-terminal"> 实时终端 </ElMenuItem>
              <ElMenuItem index="rt-ws"> WebSocket </ElMenuItem>
              <ElMenuItem index="rt-tasks"> 定时任务 </ElMenuItem>
              <ElMenuItem index="rt-vars"> 线程变量 </ElMenuItem>
              <ElMenuItem index="rt-security"> 安全中心 </ElMenuItem>
            </ElSubMenu>

            <ElSubMenu index="basic">
              <template #title>
                <ElIcon><Setting /></ElIcon>
                <span>基础配置</span>
              </template>
              <ElMenuItem index="basic-server"> 服务器 </ElMenuItem>
              <ElMenuItem index="basic-server-list"> 服务器列表 </ElMenuItem>
              <ElMenuItem index="basic-ngrok"> Ngrok </ElMenuItem>
              <ElMenuItem index="basic-ftp"> FTP </ElMenuItem>
              <ElMenuItem index="basic-sftp"> SFTP </ElMenuItem>
              <ElMenuItem index="basic-cloudtool-server"> 云工具服务端 </ElMenuItem>
              <ElMenuItem index="cloud-tool"> 云工具 </ElMenuItem>
              <ElMenuItem index="opui-panel"> 面板配置 </ElMenuItem>
            </ElSubMenu>

            <ElSubMenu index="adapter">

              <template #title>
                <ElIcon><Connection /></ElIcon>
                <span>对接配置</span>
              </template>
              <ElMenuItem index="adapter-qq"> QQ 官方机器人 </ElMenuItem>
              <ElMenuItem index="adapter-napcat"> NapCat </ElMenuItem>
              <ElMenuItem index="adapter-yunhu"> 云湖 </ElMenuItem>
              <ElMenuItem index="adapter-feishu"> 飞书 </ElMenuItem>
              <ElMenuItem index="adapter-secluded"> Secluded </ElMenuItem>
            </ElSubMenu>

            <ElSubMenu index="test">
              <template #title>
                <ElIcon><ChatDotRound /></ElIcon>
                <span>测试</span>
              </template>
              <ElMenuItem index="qq-sandbox"> 沙箱测试 </ElMenuItem>
              <ElMenuItem index="dic-debug"> 词库调试 </ElMenuItem>
            </ElSubMenu>

            <ElMenuItem index="file-manager">
              <ElIcon><FolderOpened /></ElIcon>
              <template #title> 文件管理 </template>
            </ElMenuItem>

            <ElMenuItem index="extension-deploy">
              <ElIcon><Setting /></ElIcon>
              <template #title> 扩展部署 </template>
            </ElMenuItem>

            <ElMenuItem index="doc-view">
              <ElIcon><Document /></ElIcon>
              <template #title> 查看文档 </template>
            </ElMenuItem>

            <ElMenuItem v-if="compileReady" index="compile">
              <ElIcon><Box /></ElIcon>
              <template #title> 编译词库 </template>
            </ElMenuItem>
          </ElMenu>
        </ElDrawer>

        <!-- 内容区 -->
        <main class="content" id="main-content" :class="{ 'content-mobile': isMobile, 'content-flush': activePage === 'file-manager' }">
          <component :is="currentView" />

          <ElBacktop target="#main-content" :right="16" :bottom="16">
            <ElIcon><ArrowUpBold /></ElIcon>
          </ElBacktop>
        </main>
      </div>
    </div>
  </ElConfigProvider>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  inject,
  provide,
  nextTick,
  defineAsyncComponent,
  watch,
} from 'vue'
import {
  Setting,
  Connection,
  Fold,
  Expand,
  ArrowUpBold,
  Sunny,
  Moon,
  Document,
  Menu,
  Close,
  SwitchButton,
  Odometer,
  Monitor,
  FolderOpened,
  ChatDotRound,
  Box,
} from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 背景图 ================= */
const DEFAULT_BG = '' // 默认无背景图

const bgImage = ref('')
const bgColor = ref('')
const bgBlobUrl = ref(null) // 用于 revoke blob URL
// 亮/暗背景配置，共享给 OpuiPanel，避免重复请求
const bgConfig = ref({
  light: { type: '', data: '' },
  dark: { type: '', data: '' },
})

function revokeBgBlob() {
  if (bgBlobUrl.value) {
    URL.revokeObjectURL(bgBlobUrl.value)
    bgBlobUrl.value = null
  }
}

// 按当前主题渲染背景图
async function applyBgForTheme() {
  // 切换前释放旧 blob，避免内存泄漏
  revokeBgBlob()
  const item = isDarkMode.value ? bgConfig.value.dark : bgConfig.value.light
  let loaded = false
  if (item && item.type && item.data) {
    if (item.type === 'local') {
      // base64 data URI 转为 blob URL，避免 inline style 长度限制
      try {
        const res = await fetch(item.data)
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        bgBlobUrl.value = blobUrl
        bgImage.value = `url(${blobUrl})`
        loaded = true
      } catch (e) {
        console.error('背景图加载失败，降级使用原值:', e)
        // 降级：直接使用原值（小图片可能不受限）
        bgImage.value = `url(${item.data})`
        loaded = true
      }
    } else {
      bgImage.value = `url(${item.data})`
      loaded = true
    }
  }
  // 无背景图时：应用自定义背景色；有背景图时清空背景色
  if (!loaded) {
    bgImage.value = DEFAULT_BG ? `url(${DEFAULT_BG})` : ''
    bgColor.value = item?.color || ''
  } else {
    bgColor.value = ''
  }
}

async function loadBg() {
  try {
    const data = await apiPost({ type: 'get_bg' })
    // 共享原始数据给 OpuiPanel
    if (data) {
      bgConfig.value = {
        light: data.light || { type: '', data: '' },
        dark: data.dark || { type: '', data: '' },
      }
    }
  } catch (e) {
    console.error('加载自定义背景图失败:', e)
  }
  await applyBgForTheme()
}

provide('bgConfig', bgConfig)
provide('refreshBg', loadBg)

/* ================= 主题 ================= */
const isDarkMode = inject('isDarkMode')
const toggleTheme = inject('toggleTheme')

// 主题切换时同步对应背景图
watch(isDarkMode, applyBgForTheme)

/* ================= 登出 ================= */
const logout = inject('logout')

/* ================= 布局 ================= */
const isCollapse = ref(false)
// 桌面端菜单实例，用于展开「实时数据」子菜单
const menuRef = ref(null)

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()
const mobileMenuOpen = ref(false)

function onMobileMenuSelect(page) {
  mobileMenuOpen.value = false
  switchPage(page)
}

/* ================= 编译环境检测 ================= */
const compileEnv = ref({ windows: false, go: false })
const compileReady = computed(() => compileEnv.value.go === true)

async function checkCompileEnv() {
  try {
    const data = await apiPost({ type: 'get_compile_env' })
    if (data) {
      compileEnv.value = {
        windows: !!data.windows,
        go: !!data.go,
      }
    }
  } catch (e) {
    console.warn('获取编译环境状态失败:', e)
  }
}

onMounted(() => {
  loadBg()
})

onUnmounted(() => {
  revokeBgBlob()
})

/* ================= 页面组件 ================= */
// 首页默认加载页保持静态引入，其余页面按需懒加载，减小首屏体积
import LoadPage from '@/views/Load.vue'
// 基础配置
const BasicServer = defineAsyncComponent(() => import('@/views/basic/Server.vue'))
const BasicServerList = defineAsyncComponent(() => import('@/views/basic/ServerList.vue'))
const BasicNgrok = defineAsyncComponent(() => import('@/views/basic/Ngrok.vue'))
const BasicFtp = defineAsyncComponent(() => import('@/views/basic/Ftp.vue'))
const BasicSftp = defineAsyncComponent(() => import('@/views/basic/Sftp.vue'))
const BasicCloudToolServer = defineAsyncComponent(() => import('@/views/basic/CloudToolServer.vue'))
// 对接配置
const AdapterQQ = defineAsyncComponent(() => import('@/views/adapter/QQ.vue'))
const AdapterNapCat = defineAsyncComponent(() => import('@/views/adapter/NapCat.vue'))
const AdapterYunHu = defineAsyncComponent(() => import('@/views/adapter/YunHu.vue'))
const AdapterFeiShu = defineAsyncComponent(() => import('@/views/adapter/FeiShu.vue'))
const AdapterSecluded = defineAsyncComponent(() => import('@/views/adapter/Secluded.vue'))
// 沙箱测试（独立导航页）
const QQSandbox = defineAsyncComponent(() => import('@/views/adapter/QQSandbox.vue'))
// 词库调试（独立导航页）
const DicDebug = defineAsyncComponent(() => import('@/views/DicDebug.vue'))

// 扩展部署
const ExtensionDeploy = defineAsyncComponent(() => import('@/views/ExtensionDeploy.vue'))
// 查看文档
const DocViewer = defineAsyncComponent(() => import('@/views/DocViewer.vue'))
// OPUI面板
const OpuiPanel = defineAsyncComponent(() => import('@/views/OpuiPanel.vue'))
// 文件管理
const FileManager = defineAsyncComponent(() => import('@/views/FileManager.vue'))
// 系统状态
const SysStatus = defineAsyncComponent(() => import('@/views/SysStatus.vue'))
// 实时数据
const RtLog = defineAsyncComponent(() => import('@/views/LogView.vue'))
const RtWebSocket = defineAsyncComponent(() => import('@/views/basic/WebSocket.vue'))
const RtTasks = defineAsyncComponent(() => import('@/views/ScheduledTasks.vue'))
const RtVars = defineAsyncComponent(() => import('@/views/ThreadVars.vue'))
const RtSecurity = defineAsyncComponent(() => import('@/views/SecurityCheck.vue'))
// 云工具
const CloudTool = defineAsyncComponent(() => import('@/views/CloudTool.vue'))
// 编译词库
const Compile = defineAsyncComponent(() => import('@/views/Compile.vue'))

const viewMap = {
  'load-page': LoadPage,
  'sys-status': SysStatus,
  'rt-terminal': RtLog,
  'rt-ws': RtWebSocket,
  'rt-tasks': RtTasks,
  'rt-vars': RtVars,
  'rt-security': RtSecurity,
  'basic-server': BasicServer,
	'basic-server-list': BasicServerList,
	'basic-ngrok': BasicNgrok,
	'basic-ftp': BasicFtp,
	'basic-sftp': BasicSftp,
	'basic-cloudtool-server': BasicCloudToolServer,

	'adapter-qq': AdapterQQ,
  'adapter-napcat': AdapterNapCat,
  'adapter-yunhu': AdapterYunHu,
  'adapter-feishu': AdapterFeiShu,
  'adapter-secluded': AdapterSecluded,
  'qq-sandbox': QQSandbox,
  'dic-debug': DicDebug,

  'opui-panel': OpuiPanel,
  'file-manager': FileManager,
  'extension-deploy': ExtensionDeploy,
  'doc-view': DocViewer,
  'cloud-tool': CloudTool,
  'compile': Compile,
}

const DEFAULT_PAGE = 'sys-status'
const DEFAULT_LOAD_PAGE = 'load-page'

const activePage = ref(DEFAULT_LOAD_PAGE)
const currentView = shallowRef(viewMap[DEFAULT_LOAD_PAGE])

/* ================= URL 工具 ================= */
function getPageFromUrl() {
  return new URLSearchParams(location.search).get('page')
}

function updateUrl(page) {
  const url = new URL(location.href)
  url.searchParams.set('page', page)
  history.replaceState(null, '', url)
}

/* ================= 页面切换 ================= */
function applyPage(page) {
  if (!viewMap[page]) {
    page = DEFAULT_PAGE
  }
  // 编译环境未安装时，不允许进入「编译词库」页，跳转到「扩展部署」安装词库编译环境
  if (page === 'compile' && !compileReady.value) {
    page = 'extension-deploy'
  }
  activePage.value = page
  currentView.value = viewMap[page]
  updateUrl(page)
}

// 侧边栏菜单切换
function switchPage(page) {
  if (!viewMap[page]) {
    return // 忽略无效菜单项（如子菜单父级的 index），避免误跳回默认页
  }
  applyPage(page)
}

// 页面所在子菜单分组（打开页面时自动展开对应下拉，支持 URL 直达/跨页跳转）
const SUBMENU_OF_PAGE = {
  basic: { match: (p) => p === 'cloud-tool' || p === 'opui-panel' || p.startsWith('basic-'), sub: 'basic' },
  realtime: { match: (p) => p.startsWith('rt-'), sub: 'realtime-data' },
  test: { match: (p) => p === 'qq-sandbox' || p === 'dic-debug', sub: 'test' },
}
watch(activePage, (page) => {
  for (const g of Object.values(SUBMENU_OF_PAGE)) {
    if (g.match(page)) {
      nextTick(() => menuRef.value?.open?.(g.sub))
      break
    }
  }
})

// 供子页面（如 QQ 列表点击「沙箱测试」）跳转到独立导航页
provide('navigate', switchPage)

/* ================= 初始化 ================= */
onMounted(async () => {
  // 先检测编译环境，再决定是否允许进入「编译词库」页（URL 直达时同样校验）
  await checkCompileEnv()
  const page = getPageFromUrl() || DEFAULT_PAGE
  applyPage(page)
})
</script>

<style scoped>
.background {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  pointer-events: none;
}
.background::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: var(--bg-image, none);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.5;
}

.layout {
  position: relative;
  z-index: 1;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.page-header {
  flex-shrink: 0;
}

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  display: flex;
  flex-direction: column;
}

.menu {
  flex: 1;
  overflow-y: auto;
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: transparent;
  --el-menu-active-bg-color: transparent;
}

.sidebar-tools {
  display: flex;
  justify-content: center;
}

.content {
  flex: 1;
  padding: 16px;
  overflow: auto;
  position: relative;
}

/* ==================== 手机端适配 ==================== */
.content-mobile {
  padding: 12px;
}

/* 文件管理页需要贴边，去掉内容区内边距 */
.content-flush {
  padding: 0;
}

/* 手机端抽屉菜单 */
.mobile-drawer-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 8px;
}

.mobile-drawer-logo {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.mobile-menu {
  border-right: none;
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: transparent;
}

/* 小屏手机优化 */
@media (max-width: 480px) {
  .content-mobile {
    padding: 8px;
  }

  .page-header {
    padding: 8px 12px;
  }
}
</style>
