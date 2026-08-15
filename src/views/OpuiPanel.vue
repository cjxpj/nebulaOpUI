<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= OPUI 表单数据 ================= */
const opuiForm = ref({
  open: false,
  path: '',
  secret: '',
  cors: false,
})

const loading = ref(false)
const savingOpui = ref(false)
const loadFailed = ref(false)

const logout = inject('logout')
let originalSecret = ''

/* ================= 初始化加载 OPUI ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const opuiData = await apiPost({ type: 'get_opui' })

    opuiForm.value.open = Boolean(opuiData.open)
    opuiForm.value.path = opuiData.path || ''
    opuiForm.value.secret = opuiData.secret || ''
    opuiForm.value.cors = Boolean(opuiData.cors)
    originalSecret = opuiData.secret || ''
  } catch (e) {
    console.error('获取 OPUI 配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取 OPUI 配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存 OPUI ================= */
async function saveOpui() {
  if (loadFailed.value) return

  savingOpui.value = true
  try {
    await apiPost({
        type: 'save_opui',
        data: {
          open: opuiForm.value.open,
          path: opuiForm.value.path,
          secret: opuiForm.value.secret,
          cors: opuiForm.value.cors,
        },
      })
    ElMessage.success('OPUI 配置已保存')
    if (opuiForm.value.secret !== originalSecret) {
      ElMessage.warning('密钥已变更，请重新登录')
      logout()
      return
    }
  } catch (e) {
    console.error('保存 OPUI 配置失败:', e)
    ElMessage.error('保存 OPUI 配置失败')
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

/* ================= 随机密钥 ================= */
function genRandomSecret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  opuiForm.value.secret = result
}

/* ================= 自定义背景图 ================= */
const DEFAULT_BG = '' // 默认无背景图

// 从 HomeView 注入，避免重复请求 get_bg
const bgConfig = inject('bgConfig', ref({ light: { type: '', data: '' }, dark: { type: '', data: '' } }))
const refreshBg = inject('refreshBg', () => {})

const activeBgTheme = ref('light') // 当前编辑的主题：'light' | 'dark'
const bgThemes = ref({
  light: { type: 'none', url: '', localBase64: '', color: '' },
  dark: { type: 'none', url: '', localBase64: '', color: '' },
})
const bgFileInput = ref(null)
const bgLoading = ref(false)

const curBg = computed(() => bgThemes.value[activeBgTheme.value])

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
        dark: toBgItem(bgThemes.value.dark),
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

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">OPUI 面板</h2>
      <p class="page-subtitle">管理面板设置与自定义背景图配置</p>
    </div>

    <!-- OPUI 管理面板卡片 -->
    <div class="panel-card">
      <h3 class="card-title">管理面板</h3>
      <ElForm :model="opuiForm" v-loading="loading" :label-position="isMobile ? 'top' : 'right'">
        <ElFormItem label="启用管理面板">
          <ElSwitch
            v-model="opuiForm.open"
            :disabled="loadFailed"
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

        <ElFormItem label="登录密钥">
          <ElInput
            v-model="opuiForm.secret"
            placeholder="留空不启用登录验证"
            show-password
            :disabled="loadFailed"
          >
            <template #suffix>
              <ElButton
                text
                :icon="Refresh"
                :disabled="loadFailed"
                @click="genRandomSecret"
                title="随机生成密钥"
              />
            </template>
          </ElInput>
          <div class="form-hint">
            设置后访问管理面板需要输入此密钥登录
          </div>
        </ElFormItem>

        <ElFormItem label="跨域开关">
          <ElSwitch
            v-model="opuiForm.cors"
            :disabled="loadFailed"
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
    </div>

    <!-- 自定义背景图卡片 -->
    <div class="panel-card panel-card-2">
      <h3 class="card-title">自定义背景图</h3>

      <!-- 亮色 / 暗色背景切换 -->
      <div class="bg-theme-tabs">
        <button
          type="button"
          :class="['bg-theme-btn', { active: activeBgTheme === 'light' }]"
          @click="activeBgTheme = 'light'"
        >亮色背景</button>
        <button
          type="button"
          :class="['bg-theme-btn', { active: activeBgTheme === 'dark' }]"
          @click="activeBgTheme = 'dark'"
        >暗色背景</button>
      </div>

      <div class="bg-preview">
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
      </div>

      <ElForm :label-position="isMobile ? 'top' : 'right'">
        <!-- 来源选择 -->
        <ElFormItem label="图片来源">
          <div class="bg-source-tabs">
            <button
              type="button"
              :class="['bg-source-btn', { active: curBg.type === 'none' }]"
              @click="curBg.type = 'none'"
            >无背景</button>
            <button
              type="button"
              :class="['bg-source-btn', { active: curBg.type === 'url' }]"
              @click="curBg.type = 'url'"
            >链接</button>
            <button
              type="button"
              :class="['bg-source-btn', { active: curBg.type === 'local' }]"
              @click="curBg.type = 'local'"
            >本地图片</button>
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

        <!-- 本地图片上传 -->
        <ElFormItem v-if="curBg.type === 'local'" label="选择图片">
          <div class="bg-upload-wrap">
            <ElButton native-type="button" @click="triggerFileInput">
              选择图片文件
            </ElButton>
            <input
              ref="bgFileInput"
              type="file"
              accept="image/*"
              class="bg-file-input"
              @change="handleFileUpload"
            />
            <span v-if="curBg.localBase64" class="bg-upload-name">已选择图片</span>
          </div>
          <div class="form-hint">
            支持 JPG、PNG、GIF、WebP，大小不超过 5MB
          </div>
        </ElFormItem>

        <ElFormItem>
          <div class="form-actions form-actions-between">
            <ElButton @click="resetBg">
              恢复默认
            </ElButton>
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

.page-header {
  margin-bottom: 24px;
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

.panel-card {
  padding: 28px 32px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  transition: border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.panel-card-2 {
  margin-top: 16px;
}

.card-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .panel-card {
    padding: 20px 16px;
  }

  .page-title {
    font-size: 18px;
  }

  .form-actions :deep(.el-button) {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .panel-card {
    padding: 16px 12px;
    border-radius: 8px;
  }

  .page-header {
    margin-bottom: 16px;
  }

  .page-title {
    font-size: 16px;
  }

  .page-subtitle {
    font-size: 12px;
  }
}

/* ==================== 自定义背景图 ==================== */
.bg-preview {
  position: relative;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 20px;
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

.bg-theme-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.bg-theme-btn {
  flex: 1;
  padding: 8px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.bg-theme-btn.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.bg-source-tabs {
  display: flex;
  gap: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.bg-source-btn {
  flex: 1;
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.bg-source-btn:first-child {
  border-right: 1px solid var(--el-border-color);
}

.bg-source-btn.active {
  background: var(--el-color-primary);
  color: #fff;
}

.bg-upload-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bg-upload-name {
  font-size: 13px;
  color: var(--el-color-success);
}

.bg-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.form-actions-between {
  justify-content: space-between;
}
</style>
