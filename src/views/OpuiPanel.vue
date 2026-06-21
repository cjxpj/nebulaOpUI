<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch, ElImage } from 'element-plus'
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
const DEFAULT_BG = 'https://img.xjh.me/random_img.php?return=302&type=bg&ctype=acg'

const bgType = ref('url') // 'url' | 'local'
const bgUrl = ref('')
const bgLocalBase64 = ref('')
const bgFileInput = ref(null)
const bgLoading = ref(false)

const bgPreview = computed(() => {
  if (bgType.value === 'url' && bgUrl.value) return bgUrl.value
  if (bgType.value === 'local' && bgLocalBase64.value) return bgLocalBase64.value
  return DEFAULT_BG
})
const isUsingDefault = computed(() => {
  return !bgUrl.value && !bgLocalBase64.value
})

async function loadBgConfig() {
  try {
    const data = await apiPost({ type: 'get_bg' })
    if (data && data.type) {
      bgType.value = data.type
      if (data.type === 'url') {
        bgUrl.value = data.data
      } else if (data.type === 'local') {
        bgLocalBase64.value = data.data
      }
    }
  } catch (e) {
    console.error('加载背景图配置失败:', e)
    // 无自定义背景，使用默认
  }
}

async function saveBg() {
  bgLoading.value = true
  try {
    let saveType = ''
    let saveData = ''
    if (bgType.value === 'url') {
      if (!bgUrl.value.trim()) {
        ElMessage.warning('请输入背景图链接')
        return
      }
      saveType = 'url'
      saveData = bgUrl.value.trim()
    } else if (bgType.value === 'local') {
      if (!bgLocalBase64.value) {
        ElMessage.warning('请选择本地图片')
        return
      }
      saveType = 'local'
      saveData = bgLocalBase64.value
    }
    await apiPost({ type: 'save_bg', data: { type: saveType, data: saveData } })
    ElMessage.success('背景图已保存，刷新页面生效')
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
    await apiPost({ type: 'save_bg', data: { type: '', data: '' } })
    bgType.value = 'url'
    bgUrl.value = ''
    bgLocalBase64.value = ''
    ElMessage.success('已恢复默认背景图，刷新页面生效')
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
    bgLocalBase64.value = e.target.result
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
  loadBgConfig()
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
            placeholder="nebula/xxxx"
            :disabled="loadFailed"
          />
          <div class="form-hint">
            管理面板的 URL 访问路径
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

      <div class="bg-preview">
        <ElImage
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
              :class="['bg-source-btn', { active: bgType === 'url' }]"
              @click="bgType = 'url'"
            >链接</button>
            <button
              type="button"
              :class="['bg-source-btn', { active: bgType === 'local' }]"
              @click="bgType = 'local'"
            >本地图片</button>
          </div>
        </ElFormItem>

        <!-- URL 输入 -->
        <ElFormItem v-if="bgType === 'url'" label="图片链接">
          <ElInput
            v-model="bgUrl"
            placeholder="https://example.com/bg.jpg"
          />
        </ElFormItem>

        <!-- 本地图片上传 -->
        <ElFormItem v-if="bgType === 'local'" label="选择图片">
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
            <span v-if="bgLocalBase64" class="bg-upload-name">已选择图片</span>
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
