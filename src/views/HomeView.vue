<template>
  <div class="background"></div>
  <ElConfigProvider>
    <div class="layout">
      <!-- 顶部 -->
      <ElPageHeader class="page-header" title="Nebula" icon="">
        <template #extra>
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
        <!-- 侧边栏 -->
        <aside class="sidebar">
          <ElMenu
            class="menu"
            :collapse="isCollapse"
            :default-active="activePage"
            @select="switchPage"
          >
            <!-- 基础配置 -->
            <ElSubMenu index="basic">
              <template #title>
                <ElIcon><Setting /></ElIcon>
                <span>基础配置</span>
              </template>

              <ElMenuItem index="basic-server"> Server </ElMenuItem>

              <ElMenuItem index="basic-ws"> WebSocket </ElMenuItem>

              <ElMenuItem index="basic-ngrok"> Ngrok </ElMenuItem>
            </ElSubMenu>

            <!-- 对接配置 -->
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

          <!-- 侧边栏工具 -->
          <div class="sidebar-tools">
            <ElButton
              type="text"
              :icon="isCollapse ? Expand : Fold"
              @click="isCollapse = !isCollapse"
            />
          </div>
        </aside>

        <!-- 内容区 -->
        <main class="content" id="main-content">
          <component :is="currentView" />

          <ElBacktop target="#main-content" :right="32" :bottom="32">
            <ElIcon><ArrowUpBold /></ElIcon>
          </ElBacktop>
        </main>
      </div>
    </div>
  </ElConfigProvider>
</template>

<script setup>
import { ref, onMounted, shallowRef, provide } from 'vue'
import {
  ElConfigProvider,
  ElMenu,
  ElMenuItem,
  ElSubMenu,
  ElButton,
  ElBacktop,
  ElPageHeader,
  ElIcon,
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
} from '@element-plus/icons-vue'

/* ================= 主题 ================= */
const isDarkMode = ref(true)

function applyTheme() {
  document.documentElement.classList.toggle('dark', isDarkMode.value)
}

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value
  localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light')
  applyTheme()
}

onMounted(() => {
  isDarkMode.value = localStorage.getItem('theme') !== 'light'
  applyTheme()
})

provide('isDarkMode', isDarkMode)
provide('toggleTheme', toggleTheme)

/* ================= 布局 ================= */
const isCollapse = ref(false)

/* ================= 页面组件 ================= */
import LoadPage from '@/views/Load.vue'
// 基础配置
import BasicServer from '@/views/basic/Server.vue'
import BasicWS from '@/views/basic/WebSocket.vue'
import BasicNgrok from '@/views/basic/Ngrok.vue'

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

const viewMap = {
  'load-page': LoadPage,
  'basic-server': BasicServer,
  'basic-ws': BasicWS,
  'basic-ngrok': BasicNgrok,

  'adapter-qq': AdapterQQ,
  'adapter-napcat': AdapterNapCat,
  'adapter-yunhu': AdapterYunHu,
  'adapter-feishu': AdapterFeiShu,
  'adapter-secluded': AdapterSecluded,

  'encrypted-dic': EncryptedLexicon,
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
  position: fixed; /* 固定定位，随滚动条不动 */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: url(https://img.xjh.me/random_img.php?return=302&type=bg&ctype=acg);
  background-size: cover; /* 等比覆盖，不留空 */
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.5; /* 透明度 0-1，越小越透 */
}

.layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
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
</style>
