<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { Refresh, Link, Upload, CircleClose, Connection, Sunny, Moon } from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= OPUI 表单数据 ================= */
const opuiForm = ref({
  open: false,
  path: '',
  password: '',
  cors: false,
})

const loading = ref(false)
const savingOpui = ref(false)
const loadFailed = ref(false)
const hasQuickToken = ref(false)

const logout = inject('logout')

/* ================= 初始化加载 OPUI ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const opuiData = await apiPost({ type: 'get_opui' })

    opuiForm.value.open = Boolean(opuiData.open)
    opuiForm.value.path = opuiData.path || ''
    opuiForm.value.password = ''
    opuiForm.value.cors = Boolean(opuiData.cors)
    hasQuickToken.value = Boolean(opuiData.has_quick_token)
  } catch (e) {
    console.error('获取 OPUI 配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取 OPUI 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存 OPUI 配置（不含密码） ================= */
async function saveOpui() {
  if (loadFailed.value) return
  savingOpui.value = true
  try {
    await apiPost({
      type: 'save_opui',
      data: {
        open: opuiForm.value.open,
        path: opuiForm.value.path,
        cors: opuiForm.value.cors,
      },
    })
    ElMessage.success('OPUI 配置已保存')
  } catch (e) {
    console.error('保存 OPUI 配置失败:', e)
    ElMessage.error('保存 OPUI 配置失败')
  } finally {
    savingOpui.value = false
  }
}

/* ================= 二次验证弹窗 ================= */
async function promptAuthPassword() {
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入当前登录密码以验证身份',
      '二次验证',
      {
        inputType: 'password',
        inputValidator: (v) => (v && v.trim() ? true : '请输入当前登录密码'),
        confirmButtonText: '验证',
        cancelButtonText: '取消',
        closeOnClickModal: false,
        closeOnPressEscape: false,
      }
    )
    return value.trim()
  } catch (e) {
    return null
  }
}

/* ================= 保存登录密码（需二次验证） ================= */
async function savePassword() {
  const pwd = opuiForm.value.password.trim()
  if (!pwd) {
    ElMessage.warning('请输入新密码')
    return
  }
  const auth = await promptAuthPassword()
  if (auth === null) return
  savingOpui.value = true
  try {
    await apiPost({
      type: 'save_opui',
      data: {
        open: opuiForm.value.open,
        path: opuiForm.value.path,
        password: pwd,
        auth_password: auth,
        cors: opuiForm.value.cors,
      },
    }, { noRetry: true })
    ElMessage.success('登录密码已保存')
    opuiForm.value.password = ''
    ElMessage.warning('登录密码已变更，请重新登录')
    logout()
  } catch (e) {
    console.error('保存登录密码失败:', e)
    if (e && e.message === 'auth_password_invalid') {
      ElMessage.error('当前登录密码错误')
    } else {
      ElMessage.error('保存登录密码失败')
    }
  } finally {
    savingOpui.value = false
  }
}

/* ================= 重置随机密码（二次确认 + 二次验证，弹窗告知） ================= */
async function resetRandomPassword() {
  // 二次确认：先弹确认框，避免误触
  try {
    await ElMessageBox.confirm(
      '将生成一个新的随机登录密码并替换当前密码，是否继续？',
      '重置登录密码',
      { confirmButtonText: '继续', cancelButtonText: '取消', type: 'warning' }
    )
  } catch (e) {
    return // 取消
  }
  const auth = await promptAuthPassword()
  if (auth === null) return
  savingOpui.value = true
  try {
    const data = await apiPost({ type: 'reset_opui_password', data: { auth_password: auth } }, { noRetry: true })
    if (data && data.password) {
      await ElMessageBox.alert(
        `新的登录密码已生成，请复制保存：<br><br><b>${data.password}</b>`,
        '重置登录密码',
        { confirmButtonText: '我知道了', dangerouslyUseHTMLString: true }
      )
      ElMessage.warning('登录密码已变更，请重新登录')
      logout()
    }
  } catch (e) {
    console.error('重置登录密码失败:', e)
    if (e && e.message === 'auth_password_invalid') {
      ElMessage.error('当前登录密码错误')
    } else {
      ElMessage.error('重置登录密码失败')
    }
  } finally {
    savingOpui.value = false
  }
}

/* ================= 随机路径 ================= */
function genRandomPath() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  // 保留当前路径首段作为前缀（默认 nebula），重新生成随机段
  const cur = opuiForm.value.path.trim().replace(/^\/+/, '')
  const prefix = cur ? cur.split('/')[0] : 'nebula'
  opuiForm.value.path = prefix + '/' + result
}

/* ================= 快捷登录码（需二次验证） ================= */
async function genQuickToken() {
  const auth = await promptAuthPassword()
  if (auth === null) return
  try {
    const data = await apiPost({ type: 'generate_quick_token', data: { auth_password: auth } }, { noRetry: true })
    if (data && data.token) {
      hasQuickToken.value = true
      // 构造完整快捷登录链接（带 ?key= get 参数），基于当前管理面板访问地址
      const base = window.location.origin + window.location.pathname.replace(/\/+$/, '')
      const url = `${base}?key=${data.token}`
      try {
        await navigator.clipboard.writeText(url)
        ElMessage.success('快捷登录链接已复制到剪贴板')
      } catch (e) {
        /* 复制失败则仅展示，用户手动复制 */
      }
      await ElMessageBox.alert(
        `新的快捷登录码已生成：<br><br><b>${data.token}</b><br><br>快捷登录链接（get 参数）：<br><span style="word-break:break-all;color:var(--el-color-primary)">${url}</span>`,
        '快捷登录码',
        { confirmButtonText: '我知道了', dangerouslyUseHTMLString: true }
      )
    }
  } catch (e) {
    console.error('生成快捷登录码失败:', e)
    if (e && e.message === 'auth_password_invalid') {
      ElMessage.error('当前登录密码错误')
    } else {
      ElMessage.error('生成快捷登录码失败')
    }
  }
}

/* ================= 自定义背景图 ================= */
const DEFAULT_BG = '' // 默认无背景图

// 从 HomeView 注入，避免重复请求 get_bg
const bgConfig = inject('bgConfig', ref({ light: { type: '', data: '' }, dark: { type: '', data: '' } }))
const refreshBg = inject('refreshBg', () => {})

const bgMode = ref('unified') // 当前背景模式：'light' | 'dark' | 'unified'
const bgThemes = ref({
  light: { type: 'none', url: '', localBase64: '', color: '' },
  dark: { type: 'none', url: '', localBase64: '', color: '' },
})
const bgFileInput = ref(null)
const bgLoading = ref(false)

// 亮暗色统一：开启后 light/dark 使用同一份配置
const unifiedBg = computed(() => bgMode.value === 'unified')
// 统一模式下统一以 light 作为编辑主配置
const activeBgTheme = computed(() => (bgMode.value === 'dark' ? 'dark' : 'light'))

const curBg = computed(() => bgThemes.value[activeBgTheme.value])

function setBgMode(mode) {
  if (mode === 'unified') {
    // 以当前主题的配置作为统一配置的初始值
    bgThemes.value.light = { ...bgThemes.value[activeBgTheme.value] }
  }
  bgMode.value = mode
}

// 单个主题配置项 -> 后台存储项 { type, data, color }
function toBgItem(t) {
  if (!t || t.type === 'none') {
    return { type: '', data: '', color: (t && t.color) || '' }
  }
  return { type: t.type, data: t.type === 'url' ? t.url : t.localBase64, color: '' }
}

// 监听 HomeView 传入的 bgConfig，同步到本地状态
function syncBgFromConfig() {
  const data = bgConfig.value || {}
  for (const key of ['light', 'dark']) {
    const item = data[key] || {}
    const target = bgThemes.value[key]
    target.color = item.color || ''
    if (item.type) {
      target.type = item.type
      if (item.type === 'url') {
        target.url = item.data || ''
        target.localBase64 = ''
      } else if (item.type === 'local') {
        target.localBase64 = item.data || ''
        target.url = ''
      }
    } else {
      target.type = 'none'
      target.url = ''
      target.localBase64 = ''
    }
  }
}
watch(bgConfig, syncBgFromConfig, { immediate: true })

const bgPreview = computed(() => {
  const t = curBg.value
  if (t.type === 'none') return ''
  if (t.type === 'url' && t.url) return t.url
  if (t.type === 'local' && t.localBase64) return t.localBase64
  return DEFAULT_BG
})
const isUsingDefault = computed(() => {
  const t = curBg.value
  return !t.url && !t.localBase64 && !t.color
})

async function saveBg() {
  bgLoading.value = true
  try {
    // 校验当前编辑主题
    const t = curBg.value
    if (t.type === 'url' && !t.url.trim()) {
      ElMessage.warning('请输入背景图链接')
      return
    }
    if (t.type === 'local' && !t.localBase64) {
      ElMessage.warning('请选择本地图片')
      return
    }
    await apiPost({
      type: 'save_bg',
      data: {
        light: toBgItem(bgThemes.value.light),
        dark: unifiedBg.value
          ? { ...toBgItem(bgThemes.value.light) }
          : toBgItem(bgThemes.value.dark),
      },
    })
    refreshBg()
    ElMessage.success('背景图已保存，立即生效')
  } catch (e) {
    console.error('保存背景图失败:', e)
    ElMessage.error('保存背景图失败')
  } finally {
    bgLoading.value = false
  }
}

async function resetBg() {
  bgLoading.value = true
  try {
    await apiPost({
      type: 'save_bg',
      data: { light: { type: '', data: '' }, dark: { type: '', data: '' } },
    })
    for (const key of ['light', 'dark']) {
      bgThemes.value[key] = { type: 'none', url: '', localBase64: '', color: '' }
    }
    refreshBg()
    ElMessage.success('已恢复默认背景图，立即生效')
  } catch (e) {
    console.error('恢复默认背景图失败:', e)
    ElMessage.error('恢复默认背景图失败')
  } finally {
    bgLoading.value = false
  }
}

function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 5MB')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    curBg.value.localBase64 = e.target.result
  }
  reader.onerror = () => {
    ElMessage.error('图片读取失败')
  }
  reader.readAsDataURL(file)
}

function triggerFileInput() {
  bgFileInput.value?.click()
}

function onPreviewClick() {
  if (curBg.value.type === 'local') {
    triggerFileInput()
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="page">
    <!-- OPUI 管理面板区块 -->
    <div class="sec-head">
      <span class="sec-line sec-line-l"></span>
      <h3 class="card-title">管理面板</h3>
      <span class="sec-line sec-line-r"></span>
    </div>
      <ElForm :model="opuiForm" v-loading="loading" :label-position="isMobile ? 'top' : 'right'">
        <ElFormItem label="启用管理面板">
          <ElSwitch
            v-model="opuiForm.open"
            :disabled="loadFailed"
            inline-prompt
            active-text="开启"
            inactive-text="关闭"
          />
          <div class="form-hint">
            关闭后管理面板将无法访问
          </div>
        </ElFormItem>

        <ElFormItem label="访问路径">
          <ElInput
            v-model="opuiForm.path"
            placeholder="nebula"
            :disabled="loadFailed"
          >
            <template #suffix>
              <ElButton
                text
                :icon="Refresh"
                :disabled="loadFailed"
                @click="genRandomPath"
                title="随机生成访问路径"
              />
            </template>
          </ElInput>
          <div class="form-hint">
            管理面板的 URL 访问路径，可用右侧按钮随机生成
          </div>
        </ElFormItem>

        <ElFormItem label="登录密码">
          <ElInput
            v-model="opuiForm.password"
            placeholder="输入新密码"
            show-password
            :disabled="loadFailed"
          >
            <template #suffix>
              <ElButton text :icon="Refresh" :disabled="loadFailed" @click="resetRandomPassword" title="重置随机密码" />
              <ElButton text type="primary" :disabled="loadFailed" @click="savePassword" title="保存密码">
                保存密码
              </ElButton>
            </template>
          </ElInput>
          <div class="form-hint">
            密码采用单向加密存储，仅保存哈希，无法查看原密码
          </div>
        </ElFormItem>

        <ElFormItem label="快捷登录码">
          <ElButton :disabled="loadFailed" @click="genQuickToken">
            {{ hasQuickToken ? '重置快捷登录码' : '生成快捷登录码' }}
          </ElButton>
          <div class="form-hint">
            快捷登录码为独立随机登录凭证，采用单向加密存储；更改需二次验证当前登录密码
          </div>
        </ElFormItem>

        <ElFormItem label="跨域开关">
          <ElSwitch
            v-model="opuiForm.cors"
            :disabled="loadFailed"
            inline-prompt
            active-text="开启"
            inactive-text="关闭"
          />
          <div class="form-hint">
            允许跨域访问管理面板接口，默认关闭
          </div>
        </ElFormItem>

        <ElFormItem>
          <div class="form-actions">
            <ElButton type="primary" :loading="savingOpui" :disabled="loadFailed" @click="saveOpui">
              保存配置
            </ElButton>
          </div>
        </ElFormItem>
      </ElForm>

    <!-- 自定义背景图区块 -->
    <div class="bg-header">
      <span class="sec-line sec-line-l"></span>
      <h3 class="card-title">自定义背景图</h3>
      <div class="bg-head-right">
        <span class="sec-line sec-line-r"></span>
        <ElButton text @click="resetBg" :loading="bgLoading">恢复默认</ElButton>
      </div>
    </div>

      <!-- 统一 / 亮色 / 暗色 三合一开关 -->
      <div class="bg-mode-tabs">
        <button
          type="button"
          :class="['bg-mode-btn', { active: bgMode === 'unified' }]"
          @click="setBgMode('unified')"
        >
          <ElIcon><Connection /></ElIcon>
          <span>统一</span>
        </button>
        <button
          type="button"
          :class="['bg-mode-btn', { active: bgMode === 'light' }]"
          @click="setBgMode('light')"
        >
          <ElIcon><Sunny /></ElIcon>
          <span>亮色</span>
        </button>
        <button
          type="button"
          :class="['bg-mode-btn', { active: bgMode === 'dark' }]"
          @click="setBgMode('dark')"
        >
          <ElIcon><Moon /></ElIcon>
          <span>暗色</span>
        </button>
      </div>
      <div v-if="unifiedBg" class="bg-unify-hint">
        <ElIcon><Connection /></ElIcon>
        <span>已开启统一背景，配置将同时应用到亮色与暗色</span>
      </div>

      <!-- 预览 + 设置 -->
      <div class="bg-body">
        <div
          class="bg-preview"
          :class="{ 'is-pickable': curBg.type === 'local' }"
          @click="onPreviewClick"
        >
          <div v-if="!bgPreview" class="bg-preview-empty">
            <template v-if="curBg.color">
              <span class="bg-color-chip" :style="{ backgroundColor: curBg.color }"></span>
              <span>{{ curBg.color }}</span>
            </template>
            <template v-else>无背景</template>
          </div>
          <ElImage
            v-else
            :src="bgPreview"
            fit="cover"
            class="bg-preview-img"
          />
          <span v-if="isUsingDefault" class="bg-preview-tag">默认</span>
          <span v-else class="bg-preview-tag bg-preview-tag-custom">自定义</span>
          <div
            v-if="curBg.type === 'local'"
            class="bg-preview-pick"
            :class="{ 'is-always': !curBg.localBase64 }"
          >
            <ElIcon><Upload /></ElIcon>
            <div class="bg-preview-pick-text">
              <span class="bg-preview-pick-title">{{ curBg.localBase64 ? '更换图片' : '选择图片' }}</span>
              <span class="bg-preview-pick-sub">JPG / PNG / GIF / WebP，≤ 5MB</span>
            </div>
          </div>
          <input
            ref="bgFileInput"
            type="file"
            accept="image/*"
            class="bg-file-input"
            @change="handleFileUpload"
          />
        </div>

        <ElForm class="bg-form" :label-position="isMobile ? 'top' : 'right'">
          <!-- 来源选择 -->
          <ElFormItem label="图片来源">
            <div class="bg-source-tabs">
              <button
                type="button"
                :class="['bg-source-btn', { active: curBg.type === 'none' }]"
                @click="curBg.type = 'none'"
              >
                <ElIcon><CircleClose /></ElIcon>
                <span>无背景</span>
              </button>
              <button
                type="button"
                :class="['bg-source-btn', { active: curBg.type === 'url' }]"
                @click="curBg.type = 'url'"
              >
                <ElIcon><Link /></ElIcon>
                <span>链接</span>
              </button>
              <button
                type="button"
                :class="['bg-source-btn', { active: curBg.type === 'local' }]"
                @click="curBg.type = 'local'"
              >
                <ElIcon><Upload /></ElIcon>
                <span>本地图片</span>
              </button>
            </div>
          </ElFormItem>

          <!-- 无背景时自定义背景颜色 -->
          <ElFormItem v-if="curBg.type === 'none'" label="背景颜色">
            <div class="bg-color-wrap">
              <ElColorPicker v-model="curBg.color" />
              <ElButton v-if="curBg.color" text @click="curBg.color = ''">清空</ElButton>
            </div>
            <div class="form-hint">
              无背景图时可设置纯色背景，留空则使用默认背景色
            </div>
          </ElFormItem>

          <!-- URL 输入 -->
          <ElFormItem v-if="curBg.type === 'url'" label="图片链接">
            <ElInput
              v-model="curBg.url"
              placeholder="https://example.com/bg.jpg"
            />
          </ElFormItem>

          <ElFormItem>
            <div class="form-actions">
              <ElButton type="primary" @click="saveBg">
                保存背景图
              </ElButton>
            </div>
          </ElFormItem>
        </ElForm>
      </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

/* ==================== 区块标题（居中 + 两侧分隔线） ==================== */
.sec-head,
.bg-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sec-head {
  margin: 0 0 16px;
}

.bg-header {
  margin: 40px 0 20px;
}

.sec-line {
  flex: 1;
  height: 1px;
  min-width: 24px;
}

.sec-line-l {
  background: linear-gradient(90deg, transparent, var(--el-border-color));
}

.sec-line-r {
  background: linear-gradient(90deg, var(--el-border-color), transparent);
}

.bg-head-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

.form-hint {
  margin-top: 4px;
  flex-basis: 100%;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .form-actions :deep(.el-button) {
    width: 100%;
  }
}

/* ==================== 自定义背景图 ==================== */

.bg-mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.bg-mode-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 16px;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.bg-mode-btn .el-icon {
  font-size: 15px;
}

.bg-mode-btn:not(:last-child) {
  border-right: 1px solid var(--el-border-color);
}

.bg-mode-btn.active {
  background: var(--el-color-primary);
  color: #fff;
}

.bg-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  align-items: start;
}

.bg-preview {
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
}

.bg-preview-img {
  width: 100%;
  height: 160px;
  display: block;
}

.bg-preview-empty {
  width: 100%;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  background: var(--el-fill-color-lighter);
}

.bg-color-chip {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  margin-right: 6px;
  vertical-align: middle;
  border: 1px solid var(--el-border-color);
}

.bg-color-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bg-preview-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
}

.bg-preview-tag-custom {
  background: var(--el-color-primary);
}

.bg-preview.is-pickable {
  cursor: pointer;
}

.bg-preview-pick {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
  transition: opacity 0.2s;
}

.bg-preview-pick .el-icon {
  font-size: 16px;
}

.bg-preview-pick-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  text-align: left;
}

.bg-preview-pick-title {
  font-size: 13px;
}

.bg-preview-pick-sub {
  font-size: 11px;
  opacity: 0.85;
}

.bg-preview.is-pickable:hover .bg-preview-pick {
  opacity: 1;
}

.bg-preview-pick.is-always {
  opacity: 1;
}

.bg-unify-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.bg-source-tabs {
  display: inline-flex;
  gap: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.bg-source-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 18px;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.bg-source-btn .el-icon {
  font-size: 16px;
}

.bg-source-btn:not(:last-child) {
  border-right: 1px solid var(--el-border-color);
}

.bg-source-btn.active {
  background: var(--el-color-primary);
  color: #fff;
}

.bg-file-input {
  display: none;
}
</style>
