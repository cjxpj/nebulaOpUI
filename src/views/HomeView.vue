<template>
  <div class="background" :style="{ '--bg-image': bgImage }"></div>
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

            <ElMenuItem index="encrypted-dic">
              <ElIcon><Document /></ElIcon>
              <template #title> 加密词库 </template>
            </ElMenuItem>

            <ElMenuItem index="extension-deploy">
              <ElIcon><Setting /></ElIcon>
              <template #title> 扩展部署 </template>
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

            <ElMenuItem index="encrypted-dic">
              <ElIcon><Document /></ElIcon>
              <template #title> 加密词库 </template>
            </ElMenuItem>

            <ElMenuItem index="extension-deploy">
              <ElIcon><Setting /></ElIcon>
              <template #title> 扩展部署 </template>
            </ElMenuItem>

            <ElMenuItem index="doc-view">
              <ElIcon><Document /></ElIcon>
              <template #title> 查看文档 </template>
            </ElMenuItem>
          </ElMenu>
        </ElDrawer>

        <!-- 内容区 -->
        <main class="content" id="main-content" :class="{ 'content-mobile': isMobile }">
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
import { ref, onMounted, onUnmounted, shallowRef, inject } from 'vue'
import {
  ElConfigProvider,
  ElMenu,
  ElMenuItem,
  ElSubMenu,
  ElButton,
  ElBacktop,
  ElPageHeader,
  ElIcon,
  ElDrawer,
} from 'element-plus'

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
} from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 背景图 ================= */
const DEFAULT_BG = 'https://img.xjh.me/random_img.php?return=302&type=bg&ctype=acg'

const bgImage = ref('')
const bgBlobUrl = ref(null) // 用于 revoke blob URL

async function loadBg() {
  let loaded = false
  try {
    const data = await apiPost({ type: 'get_bg' })
    if (data && data.type && data.data) {
      if (data.type === 'local') {
        // base64 data URI 转为 blob URL，避免 inline style 长度限制
        try {
          const res = await fetch(data.data)
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          bgBlobUrl.value = blobUrl
          bgImage.value = `url(${blobUrl})`
          loaded = true
        } catch (e) {
          console.error('背景图加载失败，降级使用原值:', e)
          // 降级：直接使用原值（小图片可能不受限）
          bgImage.value = `url(${data.data})`
          loaded = true
        }
      } else {
        bgImage.value = `url(${data.data})`
        loaded = true
      }
    }
  } catch (e) {
    console.error('加载自定义背景图失败:', e)
  }
  // 无自定义背景或加载失败时，延迟加载默认背景图，避免竞争加载
  if (!loaded) {
    bgImage.value = `url(${DEFAULT_BG})`
  }
}

function revokeBgBlob() {
  if (bgBlobUrl.value) {
    URL.revokeObjectURL(bgBlobUrl.value)
    bgBlobUrl.value = null
  }
}

/* ================= 主题 ================= */
const isDarkMode = inject('isDarkMode')
const toggleTheme = inject('toggleTheme')

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

onMounted(loadBg)

onUnmounted(revokeBgBlob)

/* ================= 页面组件 ================= */
import LoadPage from '@/views/Load.vue'
// 基础配置
import BasicServer from '@/views/basic/Server.vue'
import BasicWS from '@/views/basic/WebSocket.vue'
import BasicNgrok from '@/views/basic/Ngrok.vue'
import BasicFrp from '@/views/basic/Frp.vue'
import BasicFtp from '@/views/basic/Ftp.vue'
import BasicSftp from '@/views/basic/Sftp.vue'
// 对接配置
import AdapterQQ from '@/views/adapter/QQ.vue'
import AdapterNapCat from '@/views/adapter/NapCat.vue'
import AdapterYunHu from '@/views/adapter/YunHu.vue'
import AdapterFeiShu from '@/views/adapter/FeiShu.vue'
import AdapterSecluded from '@/views/adapter/Secluded.vue'

// 词库商城
import EncryptedLexicon from '@/views/EncryptedLexicon.vue'

// 扩展部署
import ExtensionDeploy from '@/views/ExtensionDeploy.vue'
// 查看文档
import DocViewer from '@/views/DocViewer.vue'
// OPUI面板
import OpuiPanel from '@/views/OpuiPanel.vue'

const viewMap = {
  'load-page': LoadPage,
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
  'extension-deploy': ExtensionDeploy,
  'doc-view': DocViewer,
}

const DEFAULT_PAGE = 'basic-server'
const DEFAULT_LOAD_PAGE = 'load-page'

const activePage = ref(DEFAULT_LOAD_PAGE)
const currentView = shallowRef(viewMap[DEFAULT_LOAD_PAGE])

/* ================= URL 工具 ================= */
function getPageFromUrl() {
  return new URLSearchParams(location.search).get('page')
}

function setPageToUrl(page) {
  const url = new URL(location.href)
  url.searchParams.set('page', page)
  history.replaceState(null, '', url)
}

/* ================= 页面切换 ================= */
function switchPage(page) {
  if (!viewMap[page]) {
    page = DEFAULT_PAGE
  }
  activePage.value = page
  currentView.value = viewMap[page]
  setPageToUrl(page)
}

/* ================= 初始化 ================= */
onMounted(() => {
  switchPage(getPageFromUrl() || DEFAULT_PAGE)
})
</script>

<style scoped>
.background {
  margin: 0;
  height: 100%;
}
.background::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  background-image: var(--bg-image, none);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.5;
  pointer-events: none;
}

.layout {
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
