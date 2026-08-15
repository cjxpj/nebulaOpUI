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
            class="menu"
            :collapse="isCollapse"
            :default-active="activePage"
            @select="switchPage"
          >
            <ElMenuItem index="sys-status">
              <ElIcon><Odometer /></ElIcon>
              <template #title> 系统状态 </template>
            </ElMenuItem>

            <ElMenuItem index="server-log">
              <ElIcon><Monitor /></ElIcon>
              <template #title> 实时终端 </template>
            </ElMenuItem>

            <ElSubMenu index="basic">
              <template #title>
                <ElIcon><Setting /></ElIcon>
                <span>基础配置</span>
              </template>
              <ElMenuItem index="basic-server"> Server </ElMenuItem>
              <ElMenuItem index="basic-ws"> WebSocket </ElMenuItem>
              <ElMenuItem index="basic-ngrok"> Ngrok </ElMenuItem>
              <ElMenuItem index="basic-frp"> BeerFrp </ElMenuItem>
              <ElMenuItem index="basic-ftp"> FTP </ElMenuItem>
              <ElMenuItem index="basic-sftp"> SFTP </ElMenuItem>
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

            <ElMenuItem index="opui-panel">
              <ElIcon><Setting /></ElIcon>
              <template #title> 面板配置 </template>
            </ElMenuItem>

            <ElMenuItem index="dic-debug">
              <ElIcon><Cpu /></ElIcon>
              <template #title> 词库调试 </template>
            </ElMenuItem>

            <ElMenuItem index="file-manager">
              <ElIcon><FolderOpened /></ElIcon>
              <template #title> 文件管理 </template>
            </ElMenuItem>

            <ElMenuItem index="encrypted-dic">
              <ElIcon><Document /></ElIcon>
              <template #title> 加密词库 </template>
            </ElMenuItem>

            <ElMenuItem index="extension-deploy">
              <ElIcon><Setting /></ElIcon>
              <template #title> 扩展部署 </template>
            </ElMenuItem>

            <ElMenuItem index="security-check">
              <ElIcon><Warning /></ElIcon>
              <template #title> 安全中心 </template>
            </ElMenuItem>

            <ElMenuItem index="doc-view">
              <ElIcon><Document /></ElIcon>
              <template #title> 查看文档 </template>
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

            <ElMenuItem index="server-log">
              <ElIcon><Monitor /></ElIcon>
              <template #title> 实时终端 </template>
            </ElMenuItem>

            <ElSubMenu index="basic">
              <template #title>
                <ElIcon><Setting /></ElIcon>
                <span>基础配置</span>
              </template>
              <ElMenuItem index="basic-server"> Server </ElMenuItem>
              <ElMenuItem index="basic-ws"> WebSocket </ElMenuItem>
              <ElMenuItem index="basic-ngrok"> Ngrok </ElMenuItem>
              <ElMenuItem index="basic-frp"> BeerFrp </ElMenuItem>
              <ElMenuItem index="basic-ftp"> FTP </ElMenuItem>
              <ElMenuItem index="basic-sftp"> SFTP </ElMenuItem>
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

            <ElMenuItem index="opui-panel">
              <ElIcon><Setting /></ElIcon>
              <template #title> 面板配置 </template>
            </ElMenuItem>

            <ElMenuItem index="dic-debug">
              <ElIcon><Cpu /></ElIcon>
              <template #title> 词库调试 </template>
            </ElMenuItem>

            <ElMenuItem index="file-manager">
              <ElIcon><FolderOpened /></ElIcon>
              <template #title> 文件管理 </template>
            </ElMenuItem>

            <ElMenuItem index="encrypted-dic">
              <ElIcon><Document /></ElIcon>
              <template #title> 加密词库 </template>
            </ElMenuItem>

            <ElMenuItem index="extension-deploy">
              <ElIcon><Setting /></ElIcon>
              <template #title> 扩展部署 </template>
            </ElMenuItem>

            <ElMenuItem index="security-check">
              <ElIcon><Warning /></ElIcon>
              <template #title> 安全中心 </template>
            </ElMenuItem>

            <ElMenuItem index="doc-view">
              <ElIcon><Document /></ElIcon>
              <template #title> 查看文档 </template>
            </ElMenuItem>
          </ElMenu>
        </ElDrawer>

        <!-- 内容区 -->
        <main class="content" id="main-content" :class="{ 'content-mobile': isMobile }">
          <component :is="currentView" v-bind="viewBindings" />

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
  onMounted,
  onUnmounted,
  shallowRef,
  inject,
  provide,
  defineAsyncComponent,
  watch,
  computed,
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
  Cpu,
  Odometer,
  Warning,
  Monitor,
  FolderOpened,
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

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()
const mobileMenuOpen = ref(false)

function onMobileMenuSelect(page) {
  mobileMenuOpen.value = false
  switchPage(page)
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
const BasicWS = defineAsyncComponent(() => import('@/views/basic/WebSocket.vue'))
const BasicNgrok = defineAsyncComponent(() => import('@/views/basic/Ngrok.vue'))
const BasicFrp = defineAsyncComponent(() => import('@/views/basic/Frp.vue'))
const BasicFtp = defineAsyncComponent(() => import('@/views/basic/Ftp.vue'))
const BasicSftp = defineAsyncComponent(() => import('@/views/basic/Sftp.vue'))
// 对接配置
const AdapterQQ = defineAsyncComponent(() => import('@/views/adapter/QQ.vue'))
const AdapterNapCat = defineAsyncComponent(() => import('@/views/adapter/NapCat.vue'))
const AdapterYunHu = defineAsyncComponent(() => import('@/views/adapter/YunHu.vue'))
const AdapterFeiShu = defineAsyncComponent(() => import('@/views/adapter/FeiShu.vue'))
const AdapterSecluded = defineAsyncComponent(() => import('@/views/adapter/Secluded.vue'))

// 词库商城
const EncryptedLexicon = defineAsyncComponent(() => import('@/views/EncryptedLexicon.vue'))

// 扩展部署
const ExtensionDeploy = defineAsyncComponent(() => import('@/views/ExtensionDeploy.vue'))
// 查看文档
const DocViewer = defineAsyncComponent(() => import('@/views/DocViewer.vue'))
// OPUI面板
const OpuiPanel = defineAsyncComponent(() => import('@/views/OpuiPanel.vue'))
// 词库调试（含 monaco 编辑器，体积最大，进入页面时才加载）
const DicDebug = defineAsyncComponent(() => import('@/views/DicDebug.vue'))
// 文件管理
const FileManager = defineAsyncComponent(() => import('@/views/FileManager.vue'))
// 系统状态
const SysStatus = defineAsyncComponent(() => import('@/views/SysStatus.vue'))
// 实时终端
const LogView = defineAsyncComponent(() => import('@/views/LogView.vue'))
// 安全中心
const SecurityCheck = defineAsyncComponent(() => import('@/views/SecurityCheck.vue'))

const viewMap = {
  'load-page': LoadPage,
  'sys-status': SysStatus,
  'server-log': LogView,
  'basic-server': BasicServer,
	'basic-ws': BasicWS,
	'basic-ngrok': BasicNgrok,
	'basic-frp': BasicFrp,
	'basic-ftp': BasicFtp,
	'basic-sftp': BasicSftp,

	'adapter-qq': AdapterQQ,
  'adapter-napcat': AdapterNapCat,
  'adapter-yunhu': AdapterYunHu,
  'adapter-feishu': AdapterFeiShu,
  'adapter-secluded': AdapterSecluded,

  'encrypted-dic': EncryptedLexicon,
  'opui-panel': OpuiPanel,
  'dic-debug': DicDebug,
  'file-manager': FileManager,
  'extension-deploy': ExtensionDeploy,
  'doc-view': DocViewer,
  'security-check': SecurityCheck,
}

const DEFAULT_PAGE = 'sys-status'
const DEFAULT_LOAD_PAGE = 'load-page'

const activePage = ref(DEFAULT_LOAD_PAGE)
const currentView = shallowRef(viewMap[DEFAULT_LOAD_PAGE])

/* ================= URL 工具 ================= */
function getPageFromUrl() {
  return new URLSearchParams(location.search).get('page')
}

function getPathFromUrl() {
  return new URLSearchParams(location.search).get('path') || ''
}

function updateUrl(page, path) {
  const url = new URL(location.href)
  url.searchParams.set('page', page)
  if (path) {
    url.searchParams.set('path', path)
  } else {
    url.searchParams.delete('path')
  }
  history.replaceState(null, '', url)
}

/* ================= 页面切换 ================= */
// 词库调试打开的文件路径（来自 URL，供 DicDebug 作为 initialPath）
const initialDicPath = ref('')

function applyPage(page, path) {
  if (!viewMap[page]) {
    page = DEFAULT_PAGE
  }
  activePage.value = page
  currentView.value = viewMap[page]
  initialDicPath.value = path || ''
  updateUrl(page, path)
}

// 侧边栏菜单切换：不携带词库路径，避免残留上一次从文件管理带入的路径
function switchPage(page) {
  if (!viewMap[page]) {
    page = DEFAULT_PAGE
  }
  applyPage(page, '')
}

// 供子页面（如文件管理）调用：跳转到指定页面并携带词库路径
function navigateTo(page, path) {
  applyPage(page, path)
}

provide('navigateTo', navigateTo)

// 仅词库调试页接收 initialPath，其他页面不传属性避免透传到根元素
const viewBindings = computed(() =>
  activePage.value === 'dic-debug' ? { initialPath: initialDicPath.value } : {}
)

/* ================= 初始化 ================= */
onMounted(() => {
  // 支持 URL 直达：?page=dic-debug&path=... 时把词库路径带给词库调试
  const page = getPageFromUrl() || DEFAULT_PAGE
  applyPage(page, getPageFromUrl() === 'dic-debug' ? getPathFromUrl() : '')
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
